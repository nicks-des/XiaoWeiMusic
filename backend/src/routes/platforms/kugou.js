/**
 * 酷狗音乐 API 封装
 * 使用公开 API，支持传入cookie获取VIP播放权限
 */
const axios = require('axios');
const https = require('https');

// 酷狗 mobilecdn 域名证书可能指向腾讯CDN通用证书，需跳过验证
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15',
  'Referer': 'https://m.kugou.com/',
};

/**
 * 搜索歌曲
 */
async function search(keyword, page = 1, limit = 20, cookie = '') {
  try {
    const url = 'https://mobilecdn.kugou.com/api/v3/search/song';
    const params = {
      format: 'json',
      keyword,
      page,
      pagesize: limit,
      showtype: 1,
    };
    const resp = await axios.get(url, {
      params,
      headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) },
      timeout: 8000,
      httpsAgent: insecureAgent,
    });
    const data = resp.data;

    // Handle different response formats from the MobileCDN API
    let infoList = null;
    let totalCount = 0;

    if (data && data.status === 1 && data.data && data.data.info) {
      // Standard format: { status: 1, data: { info: [...], total: N } }
      infoList = data.data.info;
      totalCount = data.data.total || infoList.length;
    } else if (data && data.errcode === 0 && data.data && data.data.lists) {
      // Alternate format: { errcode: 0, data: { lists: [...], total: N } }
      infoList = data.data.lists;
      totalCount = data.data.total || infoList.length;
    } else if (data && data.code === 0 && data.result && data.result.songs) {
      // Another alternate format: { code: 0, result: { songs: [...] } }
      // Map to our internal format
      infoList = data.result.songs.map(s => ({
        hash: s.hash || s.song_hash,
        songname: s.name || s.songname,
        singername: s.singer || s.singername,
        album_name: s.album || '',
        album_id: s.album_id || s.cover_id || '',
        duration: s.duration || s.time || 0,
        price: s.fee || 0,
        album_audio_id: s.album_audio_id || 0,
      }));
      totalCount = data.result.total || infoList.length;
    }

    if (!infoList || infoList.length === 0) {
      return { songs: [], total: 0 };
    }

    const songs = infoList.map((s) => ({
      id: 'kg_' + s.hash,
      title: s.songname || s.filename,
      artist: s.singername || s.author || '',
      album: s.album_name || s.album_id || '',
      cover_url: s.album_id
        ? `https://imge.kugou.com/stdmusic/{size}/${s.album_id}/20240101/${s.hash}.jpg`
          .replace('{size}', '240')
        : '',
      // 酷狗 duration 单位是秒
      duration: parseInt(s.duration || 0),
      source: 'kugou',
      fee: s.price || 0,
      mv_id: s.mvhash || 0,
      _hash: s.hash,
      _albumAudioId: s.album_audio_id || 0,
    }));

    return {
      songs,
      total: totalCount || songs.length,
    };
  } catch (err) {
    console.error('[KuGou] Search error:', err.message);
    return { songs: [], total: 0 };
  }
}

/**
 * 获取歌曲播放URL
 * 优先使用酷狗 web API (支持多音质 + VIP cookie)，失败则回退移动端 API
 * @param {string} hash - 歌曲hash
 * @param {string} cookie - 登录cookie (VIP用户可获取更高音质)
 * @param {number} albumAudioId - 专辑音频ID (web API需要)
 */
async function getSongUrl(hash, cookie = '', albumAudioId = 0) {
  // Run web API and mobile API in parallel, prefer web (better quality)
  const webPromise = (async () => {
    try {
      const webParams = { r: 'play/getdata', hash, mid: '1' };
      if (albumAudioId) webParams.album_audio_id = albumAudioId;

      const webResp = await axios.get('https://wwwapi.kugou.com/yy/index.php', {
        params: webParams,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.kugou.com/',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 6000,
        httpsAgent: insecureAgent,
      });

      const wdata = webResp.data;
      if (wdata?.status === 1 && wdata?.data) {
        const playUrl = wdata.data.play_url || wdata.data.play_backup_url || wdata.data.url;
        if (playUrl) {
          console.log('[KuGou] Web API success for', hash, '| hasCookie:', !!cookie);
          return { url: playUrl, source: 'web' };
        }
      }
    } catch (err) {
      console.log('[KuGou] Web API error for', hash, ':', err.message);
    }
    return null;
  })();

  const mobilePromise = (async () => {
    try {
      const resp = await axios.get('https://m.kugou.com/app/i/getSongInfo.php', {
        params: { cmd: 'playInfo', hash },
        headers: { ...MOBILE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
        timeout: 6000,
        httpsAgent: insecureAgent,
      });

      const data = resp.data;
      if (!data || typeof data !== 'object') {
        console.log('[KuGou] Mobile API returned non-object response for', hash);
        return null;
      }

      if (data.url && data.url.length > 0) {
        console.log('[KuGou] Mobile API success for', hash);
        return { url: data.url, source: 'mobile' };
      }

      if (data.backup_url && typeof data.backup_url === 'object') {
        const keys = Object.keys(data.backup_url);
        if (keys.length > 0) {
          const bu = data.backup_url[keys[0]];
          if (bu && typeof bu === 'string' && bu.startsWith('http')) {
            return { url: bu, source: 'mobile-backup' };
          }
        }
      }

      if (data.extraUrl && typeof data.extraUrl === 'string' && data.extraUrl.startsWith('http')) {
        return { url: data.extraUrl, source: 'mobile-extra' };
      }

      if (data.data?.play_url && typeof data.data.play_url === 'string') {
        return { url: data.data.play_url, source: 'mobile-nested' };
      }
    } catch (err) {
    }
    return null;
  })();

  // Wait for first result, prefer web over mobile
  const results = await Promise.allSettled([webPromise, mobilePromise]);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.url) return { url: r.value.url };
  }

  console.log('[KuGou] GetUrl FAIL for', hash, '| hasCookie:', !!cookie);
  return { url: null };
}

/**
 * 获取歌词
 */
async function getLyric(hash) {
  try {
    const resp = await axios.get('https://m.kugou.com/app/i/getSongInfo.php', {
      params: { cmd: 'playInfo', hash },
      headers: MOBILE_HEADERS,
      timeout: 5000,
    });
    return resp.data?.lyrics || resp.data?.intro || '';
  } catch (err) {
    return '';
  }
}

/**
 * 获取MV播放地址 (通过酷狗MV页面)
 * @param {string} mvhash - MV的hash值
 */
async function getMvUrl(mvhash) {
  // Kugou MV page: provides the best playback experience
  return {
    url: `https://www.kugou.com/mvweb/html/mv_${mvhash}.html`,
    cover: `https://imge.kugou.com/mvhdpic/{size}/${mvhash}.jpg`.replace('{size}', '480'),
    title: '',
  };
}

module.exports = { search, getSongUrl, getLyric, getMvUrl };
