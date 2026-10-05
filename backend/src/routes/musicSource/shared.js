const ncmAuth = require('../../utils/ncmAuth');
const qqmusicAuth = require('../../utils/qqmusicAuth');
const kugouAuth = require('../../utils/kugouAuth');
const kuwoAuth = require('../../utils/kuwoAuth');
const platformBind = require('../../utils/platformBind');

// 提取当前请求的用户ID (支持两种方式: Authorization Bearer 或 query token)
function getUserIdFromReq(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
      return decoded.id;
    } catch (_) {}
  }
  return null;
}

// 获取某平台的 cookie: 用户绑定 > DB全局 > 内存全局
async function getPlatformCookie(userId, platform) {
  if (!userId) {
    // Audio element requests carry no JWT. Try DB first (persists across restarts),
    // then fall back to in-memory cookie (set during current session's QR login).
    try {
      const dbCookie = await platformBind.getGlobalCookie(platform);
      if (dbCookie) return dbCookie;
    } catch (_) { /* ignore DB errors */ }
    if (platform === 'netease') return ncmAuth.getCookie();
    if (platform === 'qqmusic') return qqmusicAuth.getCookie();
    if (platform === 'kugou') return kugouAuth.getCookie();
    if (platform === 'kuwo') return kuwoAuth.getCookie();
    return '';
  }
  const memoryFallback = () => {
    if (platform === 'netease') return ncmAuth.getCookie();
    if (platform === 'qqmusic') return qqmusicAuth.getCookie();
    if (platform === 'kugou') return kugouAuth.getCookie();
    if (platform === 'kuwo') return kuwoAuth.getCookie();
    return '';
  };

  const userCookie = await platformBind.getUserCookie(userId, platform, memoryFallback);
  if (userCookie) return userCookie;

  try {
    const dbCookie = await platformBind.getGlobalCookie(platform);
    if (dbCookie) return dbCookie;
  } catch (_) { /* ignore DB errors */ }

  return memoryFallback();
}

// URL cache: avoid double-fetching stream URLs (get-url → download proxy)
// Key: rawId (e.g. "qq_000J0KtD2auL4h"), Value: { url, expires, trial }
const urlCache = new Map();
const songMetaCache = new Map();
const URL_CACHE_TTL = 30 * 1000; // 30 seconds for non-authenticated
const URL_CACHE_TTL_AUTH = 5 * 1000; // 5 seconds with auth (CDN URLs may be one-time)

// Helper: parse platform prefix from song id (e.g. "wy_12345", "qq_mid", "kg_hash", "kw_rid")
function parsePlatformId(id) {
  const match = String(id).match(/^(wy|qq|kg|kw)_(.+)$/);
  if (match) {
    return { platform: match[1], rawId: match[2] };
  }
  return null;
}

const PLATFORM_MAP = {
  wy: 'netease',
  qq: 'qqmusic',
  kg: 'kugou',
  kw: 'kuwo',
};

// Helper: map search/playlist track fields (different from song_detail)
function mapSearchSong(s) {
  const artists = (s.artists || s.ar || []).map(a => a.name).join(' / ');
  // Search results use `album` with `picId`, song_detail uses `al` with `picUrl`
  // For cover: prefer album picUrl in song_detail, or artist img1v1Url from search
  let coverUrl = '';
  if (s.al?.picUrl) {
    coverUrl = s.al.picUrl;
  } else if (s.album?.picUrl) {
    coverUrl = s.album.picUrl;
  } else if (s.artists?.[0]?.img1v1Url) {
    coverUrl = s.artists[0].img1v1Url;
  } else if (s.ar?.[0]?.img1v1Url) {
    coverUrl = s.ar[0].img1v1Url;
  }

  return {
    id: 'wy_' + s.id,
    neteaseId: s.id,
    title: s.name,
    artist: artists || '未知歌手',
    album: (s.al || s.album || {}).name || '',
    duration: Math.floor((s.dt || s.duration || 0) / 1000),
    cover_url: coverUrl,
    mv_id: s.mv || s.mv_id || 0,
    source: 'netease',
  };
}

// ── CORS helper for cross-origin cookie submission ──
function corsCookieApi(req, res, next) {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}

module.exports = {
  getUserIdFromReq,
  getPlatformCookie,
  urlCache,
  songMetaCache,
  URL_CACHE_TTL,
  URL_CACHE_TTL_AUTH,
  parsePlatformId,
  PLATFORM_MAP,
  mapSearchSong,
  corsCookieApi,
  ncmAuth,
  qqmusicAuth,
  kugouAuth,
  kuwoAuth,
};
