/**
 * 酷我音乐 API 封装
 * 使用公开搜索 API，支持传入cookie获取VIP播放权限
 */
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 搜索歌曲
 */
async function search(keyword, page = 1, limit = 20, cookie = '') {
  try {
    const pn = Math.max(0, page - 1);
    const headers = {
      'User-Agent': UA,
      Referer: 'https://www.kuwo.cn/',
      ...(cookie ? { Cookie: cookie } : {}),
    };
    const resp = await axios.get('https://search.kuwo.cn/r.s', {
      params: {
        all: keyword,
        ft: 'music',
        itemset: 'web_2013',
        client: 'kt',
        pn: pn,
        rn: limit,
        rformat: 'json',
        encoding: 'utf8',
      },
      headers,
      timeout: 8000,
    });

    // KuWo returns single-quoted "JSON" - need to parse manually
    let data = resp.data;
    if (typeof data === 'string') {
      try {
        // Replace single quotes with double quotes (safe for this API's format)
        data = JSON.parse(data.replace(/'/g, '"'));
      } catch (e) {
        console.error('[KuWo] Parse error:', e.message);
        return { songs: [], total: 0 };
      }
    }

    if (!data || !data.abslist) {
      return { songs: [], total: 0 };
    }

    const songs = data.abslist.map((s) => {
      const musicRid = s.MUSICRID || '';
      return {
        id: 'kw_' + musicRid.replace('MUSIC_', ''),
        title: (s.NAME || s.SONGNAME || '').replace(/&nbsp;/g, ' ').trim(),
        artist: (s.ARTIST || s.SINGER || '').replace(/&nbsp;/g, ' ').trim(),
        album: (s.ALBUM || '').replace(/&nbsp;/g, ' ').trim(),
        cover_url: s.PICPATH || '',
        duration: parseInt(s.DURATION || 0),
        source: 'kuwo',
        fee: parseInt(s.PAY || 0) || 0,
        mv_id: (s.mvpayinfo?.vid && s.mvpayinfo.vid !== '0') ? s.mvpayinfo.vid : 0,
        // 保存用于获取播放URL
        _mp3Rid: (s.MP3RID || '').replace('MP3_', ''),
        _nsig1: s.NSIG1 || s.MP3NSIG1 || '',
        _nsig2: s.NSIG2 || s.MP3NSIG2 || '',
      };
    });

    return {
      songs,
      total: parseInt(data.TOTAL || songs.length),
    };
  } catch (err) {
    console.error('[KuWo] Search error:', err.message);
    return { songs: [], total: 0 };
  }
}

/**
 * 获取歌曲播放URL
 * 优先使用酷我主站 API (支持多音质 + VIP cookie)，失败则回退 anti-server
 * @param {string} rid - 歌曲rid
 * @param {string} cookie - 登录cookie (VIP用户可获取更高音质/完整版)
 */
async function getSongUrl(rid, cookie = '') {
  const csrfToken = (cookie && cookie.match(/kw_token=([^;]+)/)) 
    ? cookie.match(/kw_token=([^;]+)/)[1] 
    : '';

  // Run main API and anti-server in parallel, prefer main (better quality)
  const mainPromise = (async () => {
    try {
      const mainResp = await axios.get('https://www.kuwo.cn/api/v1/www/music/playUrl', {
        params: { mid: rid, type: 'music', httpsStatus: 1, reqId: Date.now().toString() },
        headers: {
          'User-Agent': UA, 'Referer': 'https://www.kuwo.cn/',
          'csrf': csrfToken,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 6000,
        validateStatus: (s) => s < 500,
      });
      if (mainResp.data?.code === 200 && mainResp.data?.data?.url) {
        console.log('[KuWo] Main API success for', rid, '| hasCookie:', !!cookie);
        return { url: mainResp.data.data.url };
      }
    } catch (err) {
      console.log('[KuWo] Main API error for', rid, ':', err.message);
    }
    return null;
  })();

  const antiPromise = (async () => {
    try {
      const resp = await axios.get('https://antiserver.kuwo.cn/anti.s', {
        params: { type: 'convert_url3', format: 'aac|mp3', response: 'url', rid: 'MUSIC_' + rid },
        headers: { 'User-Agent': UA, Referer: 'https://www.kuwo.cn/', ...(cookie ? { Cookie: cookie } : {}) },
        timeout: 6000,
      });
      if (resp.data?.code === 200 && resp.data?.url) {
        console.log('[KuWo] Anti-server success for', rid);
        return { url: resp.data.url };
      }
    } catch (err) {
    }
    return null;
  })();

  const results = await Promise.allSettled([mainPromise, antiPromise]);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.url) return { url: r.value.url };
  }

  console.log('[KuWo] GetUrl FAIL for', rid, '| hasCookie:', !!cookie);
  return { url: null };
}

/**
 * 获取歌词
 */
async function getLyric(rid) {
  try {
    const resp = await axios.get('https://www.kuwo.cn/api/www/music/musicInfo', {
      params: {
        mid: rid,
        httpsStatus: 1,
        reqId: Date.now().toString(),
      },
      headers: {
        'User-Agent': UA,
        Referer: 'https://www.kuwo.cn/',
        csrf: Date.now().toString(),
        Cookie: 'kw_token=test',
      },
      timeout: 5000,
      validateStatus: () => true,
    });
    return resp.data?.data?.lrclist
      ? resp.data.data.lrclist.map((l) => `[${l.time}]${l.lineLyric}`).join('\n')
      : '';
  } catch (err) {
    return '';
  }
}

/**
 * 获取MV播放地址 (通过酷我MV页面)
 * @param {string} mvid - MV的vid标识
 */
async function getMvUrl(mvid) {
  return {
    url: `https://www.kuwo.cn/mvplay/${mvid}`,
    cover: '',
    title: '',
  };
}

module.exports = { search, getSongUrl, getLyric, getMvUrl };
