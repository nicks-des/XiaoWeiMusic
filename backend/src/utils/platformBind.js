/**
 * 用户平台账号绑定管理
 * - 每用户独立的平台 Cookie 存储
 * - 优先级: 用户绑定 Cookie > 全局 Cookie (.env)
 */
const { pool } = require('../config/db');

// 内存缓存: userId+platform -> cookie (减少DB查询)
const cookieCache = new Map();
const CACHE_TTL = 60 * 1000; // 1分钟

function cacheKey(userId, platform) {
  return `${userId}::${platform}`;
}

function setCache(userId, platform, data) {
  if (!data) {
    cookieCache.delete(cacheKey(userId, platform));
    return;
  }
  cookieCache.set(cacheKey(userId, platform), { ...data, ts: Date.now() });
}

function getCache(userId, platform) {
  const entry = cookieCache.get(cacheKey(userId, platform));
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cookieCache.delete(cacheKey(userId, platform));
    return null;
  }
  return entry;
}

function isUsablePlatformCookie(platform, cookie) {
  if (!cookie) return false;
  if (platform === 'netease') {
    return /(?:^|;\s*)MUSIC_U=/.test(cookie) || /(?:^|;\s*)MUSIC_A=/.test(cookie);
  }
  if (platform === 'qqmusic') {
    const hasUin = /(?:^|;\s*)(?:uin|p_uin|qqmusic_uin|wxuin)=o?\d+/i.test(cookie);
    const hasSessionKey = /(?:^|;\s*)(?:skey|p_skey|p_lskey|qqmusic_key|wxskey|wxsid)=/.test(cookie);
    return hasUin && hasSessionKey;
  }
  return true;
}

/**
 * 获取用户某平台的 cookie
 * 优先用户绑定,回退到全局
 */
async function getUserCookie(userId, platform, fallbackGlobalFn) {
  if (!userId) {
    return fallbackGlobalFn ? fallbackGlobalFn() : '';
  }

  const cached = getCache(userId, platform);
  if (cached) {
    if (!isUsablePlatformCookie(platform, cached.cookie)) {
      cookieCache.delete(cacheKey(userId, platform));
      return fallbackGlobalFn ? fallbackGlobalFn() : '';
    }
    return cached.cookie || (fallbackGlobalFn ? fallbackGlobalFn() : '');
  }

  try {
    const [rows] = await pool.query(
      'SELECT cookie, platform_nickname, platform_avatar, platform_uid, extra, expires_at FROM user_platforms WHERE user_id = ? AND platform = ?',
      [userId, platform]
    );

    if (rows.length > 0) {
      const row = rows[0];
      // 检查是否过期
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return fallbackGlobalFn ? fallbackGlobalFn() : '';
      }
      if (!isUsablePlatformCookie(platform, row.cookie)) {
        return fallbackGlobalFn ? fallbackGlobalFn() : '';
      }
      setCache(userId, platform, row);
      return row.cookie || (fallbackGlobalFn ? fallbackGlobalFn() : '');
    }
  } catch (err) {
    console.error(`[PlatformBind] getUserCookie error (${platform}):`, err.message);
  }

  return fallbackGlobalFn ? fallbackGlobalFn() : '';
}

/**
 * 保存用户平台绑定
 */
async function saveBinding(userId, platform, data) {
  if (!userId || !platform) {
    throw new Error('userId 和 platform 为必填项');
  }

  const {
    cookie = '',
    platform_uid = null,
    platform_nickname = null,
    platform_avatar = null,
    extra = null,
    expires_at = null,
  } = data;

  if (!isUsablePlatformCookie(platform, cookie)) {
    throw new Error(`${platform} cookie is not a usable logged-in credential`);
  }

  await pool.query(
    `INSERT INTO user_platforms
     (user_id, platform, platform_uid, platform_nickname, platform_avatar, cookie, extra, bound_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
     platform_uid = VALUES(platform_uid),
     platform_nickname = VALUES(platform_nickname),
     platform_avatar = VALUES(platform_avatar),
     cookie = VALUES(cookie),
     extra = VALUES(extra),
     bound_at = NOW(),
     expires_at = VALUES(expires_at)`,
    [userId, platform, platform_uid, platform_nickname, platform_avatar, cookie, extra ? JSON.stringify(extra) : null, expires_at]
  );

  setCache(userId, platform, { cookie, platform_nickname, platform_avatar, platform_uid, extra, expires_at });
  return true;
}

/**
 * 删除用户平台绑定
 */
async function removeBinding(userId, platform) {
  await pool.query(
    'DELETE FROM user_platforms WHERE user_id = ? AND platform = ?',
    [userId, platform]
  );
  cookieCache.delete(cacheKey(userId, platform));
}

/**
 * 获取用户所有平台绑定
 */
async function listBindings(userId) {
  const [rows] = await pool.query(
    `SELECT platform, platform_uid, platform_nickname, platform_avatar, cookie,
            bound_at, expires_at
     FROM user_platforms
     WHERE user_id = ?
     ORDER BY bound_at DESC`,
    [userId]
  );
  return rows.filter((r) => {
    const expired = r.expires_at && new Date(r.expires_at) < new Date();
    return !expired && isUsablePlatformCookie(r.platform, r.cookie);
  }).map((r) => ({
    platform: r.platform,
    platform_uid: r.platform_uid,
    platform_nickname: r.platform_nickname,
    platform_avatar: r.platform_avatar,
    bound_at: r.bound_at,
    expires_at: r.expires_at,
    isBound: true,
  }));
}

/**
 * 检查某平台是否已绑定
 */
async function isBound(userId, platform) {
  const [rows] = await pool.query(
    'SELECT id FROM user_platforms WHERE user_id = ? AND platform = ?',
    [userId, platform]
  );
  return rows.length > 0;
}

/**
 * 获取某平台最新的全局Cookie (不区分用户，用于audio下载代理等无JWT场景)
 * 服务重启后从DB恢复，避免用户需要重新扫码
 */
async function getGlobalCookie(platform) {
  try {
    const [rows] = await pool.query(
      'SELECT cookie, expires_at FROM user_platforms WHERE platform = ? ORDER BY bound_at DESC LIMIT 1',
      [platform]
    );
    if (rows.length > 0) {
      const row = rows[0];
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return '';
      }
      if (!isUsablePlatformCookie(platform, row.cookie)) {
        return '';
      }
      return row.cookie || '';
    }
  } catch (err) {
    console.error(`[PlatformBind] getGlobalCookie error (${platform}):`, err.message);
  }
  return '';
}

/**
 * Save a cookie globally (not tied to a specific user)
 * Uses user_id = 0 as convention for global cookies
 */
async function saveGlobalCookie(platform, cookie) {
  if (!isUsablePlatformCookie(platform, cookie)) {
    throw new Error(`${platform} cookie is not a usable logged-in credential`);
  }
  try {
    // Delete existing global cookies for this platform first
    await pool.query(
      'DELETE FROM user_platforms WHERE user_id = 0 AND platform = ?',
      [platform]
    );
    await pool.query(
      `INSERT INTO user_platforms
       (user_id, platform, cookie, bound_at, expires_at)
       VALUES (0, ?, ?, NOW(), ?)`,
      [platform, cookie, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
    );
    console.log(`[PlatformBind] Global ${platform} cookie saved`);
    return true;
  } catch (err) {
    console.error(`[PlatformBind] saveGlobalCookie error (${platform}):`, err.message);
    return false;
  }
}

module.exports = {
  getUserCookie,
  saveBinding,
  removeBinding,
  listBindings,
  isBound,
  getGlobalCookie,
  saveGlobalCookie,
  isUsablePlatformCookie,
  setCache,
  getCache,
};
