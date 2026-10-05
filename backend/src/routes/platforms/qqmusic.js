/**
 * QQ音乐 API 封装
 * 使用公开 API，无需认证
 */
const axios = require('axios');

// 统一的请求头
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://y.qq.com/',
};

/**
 * 从 cookie 中计算 g_tk (CSRF token, 用于需要登录的API)
 */
function computeGTK(cookie) {
  const skeyMatch = cookie.match(/(?:skey|p_skey|rv2)=([^;]+)/);
  const key = skeyMatch ? skeyMatch[1] : '';
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash += (hash << 5) + key.charCodeAt(i);
  }
  return hash & 0x7fffffff;
}

/**
 * 搜索歌曲
 */
async function search(keyword, page = 1, limit = 20, cookie = '') {
  try {
    const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';
    const params = {
      w: keyword,
      format: 'json',
      p: page,
      n: limit,
      t: 0,
      aggr: 1,
      lossless: 1,
      cr: 1,
      new_json: 1,
    };
    const reqHeaders = { ...headers };
    if (cookie) reqHeaders['Cookie'] = cookie;
    const resp = await axios.get(url, { params, headers: reqHeaders, timeout: 8000 });
    const data = resp.data;

    if (!data || !data.data || !data.data.song || !data.data.song.list) {
      return { songs: [], total: 0 };
    }

    const songs = data.data.song.list.map((s) => ({
      id: s.mid ? 'qq_' + s.mid : 'qq_' + s.id,
      title: s.title || s.name,
      artist: (s.singer || []).map((si) => si.name).join(' / '),
      album: (s.album || {}).title || s.albumname || '',
      cover_url: ((s.album || {}).mid)
        ? `https://y.qq.com/music/photo_new/T002R300x300M000${s.album.mid}.jpg`
        : '',
      // QQ音乐 interval 单位是秒
      duration: parseInt(s.interval || 0),
      source: 'qqmusic',
      fee: (s.pay || {}).payplay || 0,
      mv_id: (s.mv || {}).vid || 0,
    }));

    return {
      songs,
      total: data.data.song.totalnum || songs.length,
    };
  } catch (err) {
    console.error('[QQMusic] Search error:', err.message);
    return { songs: [], total: 0 };
  }
}

/**
 * 获取歌曲播放URL
 * @param {string} mid - 歌曲mid
 * @param {string} quality - 音质 'standard' | 'low' | 'hires' | 'lossless'
 * @param {string} cookie - QQ音乐Cookie (可选, 会员可获取更高音质和VIP歌曲)
 */
async function getSongUrl(mid, quality = 'standard', cookie = '') {
  try {
    const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg';

    // 从 cookie 提取 uin；否则生成随机 guid 避免被屏蔽
    let uin = '0';
    let guid = String(Math.floor(Math.random() * 9000000000) + 1000000000);
    if (cookie) {
      const uinMatch = cookie.match(/uin=o?0*(\d+)/i);
      if (uinMatch) {
        uin = uinMatch[1];
        guid = uin;
      }
    }

    // 根据质量级别设置不同的请求参数
    const qualityMap = {
      low: { songtype: [0], platform: '20' },
      standard: { songtype: [0], platform: '20' },
      hires: { songtype: [0], platform: '20' },
      lossless: { songtype: [1], platform: '20' },
    };
    const q = qualityMap[quality] || qualityMap.standard;

    // Compute g_tk from cookie for authenticated requests
    const g_tk = cookie ? computeGTK(cookie) : 5381;

    const params = {
      format: 'json',
      g_tk,
      data: JSON.stringify({
        req_0: {
          module: 'vkey.GetVkeyServer',
          method: 'CgiGetVkey',
          param: {
            guid,
            songmid: [mid],
            songtype: q.songtype,
            uin,
            loginflag: cookie ? 1 : 0,
            platform: q.platform,
          },
        },
      }),
    };

    const requestHeaders = {
      ...headers,
      'Referer': 'https://y.qq.com',
      'Origin': 'https://y.qq.com',
    };
    if (cookie) {
      requestHeaders['Cookie'] = cookie;
    }

    const resp = await axios.get(url, { params, headers: requestHeaders, timeout: 6000 });
    const data = resp.data;
    const midurlinfo = data?.req_0?.data?.midurlinfo?.[0];
    const sip = data?.req_0?.data?.sip?.[0] || '';

    if (midurlinfo && midurlinfo.purl && !midurlinfo.purl.startsWith('http')) {
      const streamUrl = (sip || 'http://ws.stream.qqmusic.qq.com/') + midurlinfo.purl;
      return { url: streamUrl };
    }

    // 详细的诊断日志
    const hasSkey = cookie && /skey=/.test(cookie);
    const hasPSkey = cookie && /p_skey=/.test(cookie);
    const hasUin = cookie && /uin=/.test(cookie);
    console.log('[QQMusic] vkey result for', mid,
      '| loginflag:', cookie ? 1 : 0,
      '| g_tk:', g_tk,
      '| purl:', midurlinfo?.purl || '(empty)',
      '| vkey code:', data?.req_0?.code,
      '| cookie has skey:', hasSkey,
      '| cookie has p_skey:', hasPSkey,
      '| cookie has uin:', hasUin,
      '| cookie len:', (cookie || '').length);

    // Fallback: try lower quality
    if (quality === 'standard') {
      return getSongUrl(mid, 'low', cookie);
    }

    return { url: null };
  } catch (err) {
    console.error('[QQMusic] GetUrl error:', err.message);
    return { url: null };
  }
}

/**
 * 获取歌词
 */
async function getLyric(mid) {
  try {
    const url = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';
    const resp = await axios.get(url, {
      params: { songmid: mid, format: 'json', nobase64: 1, g_tk: 5381 },
      headers: { ...headers, Referer: 'https://y.qq.com/portal/player.html' },
      timeout: 5000,
    });
    return resp.data?.lyric || '';
  } catch (err) {
    return '';
  }
}

/**
 * 获取MV播放地址
 * QQ Music MV requires extracting the play URL from the MV page.
 * We provide the MV page URL as fallback since direct MP4 extraction is unreliable.
 * @param {string} vid - MV的vid标识
 */
async function getMvUrl(vid) {
  try {
    // Try to get MV info and construct play URL
    const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
    const params = {
      format: 'json',
      data: JSON.stringify({
        comm: { ct: 24, cv: 10000 },
        mvPlay: {
          module: 'MvService.MvInfoProServer',
          method: 'GetMvInfoList',
          param: {
            vidlist: [vid],
            required: ['vid', 'type', 'sid', 'cover_pic', 'duration', 'title', 'fileid'],
          },
        },
      }),
    };
    const resp = await axios.get(url, {
      params,
      headers: { ...headers, Referer: 'https://y.qq.com/' },
      timeout: 8000,
    });
    const mvInfo = resp.data?.mvPlay?.data?.mvlist?.[0];
    if (!mvInfo) {
      console.log('[QQMusic] MV info not found for', vid);
      return null;
    }

    // QQ Music restricts direct MP4 access; provide the MV page URL
    // which the user can open in browser. The MV page URL is:
    const mvPageUrl = `https://y.qq.com/n/yqq/mv/v/${vid}.html`;

    return {
      url: mvPageUrl,       // MV page (plays in browser)
      cover: mvInfo.cover_pic || '',
      title: mvInfo.title || '',
      duration: mvInfo.duration || 0,
    };
  } catch (err) {
    console.error('[QQMusic] GetMvUrl error:', err.message);
    return null;
  }
}

module.exports = { search, getSongUrl, getLyric, getMvUrl };
