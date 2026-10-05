/**
 * 网易云音乐认证管理
 * - 启动时从 .env 读取 NETEASE_COOKIE
 * - 运行时可通过 API 更新 cookie
 * - 支持通过手机号/邮箱登录获取 cookie
 * - 支持扫码登录 (二维码) - weapi加密 + 浏览器模拟，防拦截
 */
const { login_cellphone, login_email, login_refresh, login_qr_create, login_qr_check, login_qr_key, login_status } = require('NeteaseCloudMusicApi');
const { weapi } = require('NeteaseCloudMusicApi/util/crypto');
const axios = require('axios');
const https = require('https');

// 持久化浏览器模拟 axios 实例（关键：保持连接和Cookie一致性）
const browserAxios = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
  },
});

let currentCookie = process.env.NETEASE_COOKIE || '';
let loginTime = 0;
let userProfile = null;  // { nickname, avatarUrl, userId, vipType }

// 扫码登录状态
let qrState = {
  unikey: null,
  qrcode: null,
  startTime: 0,
  status: 'idle',
  seen8821: 0,  // 8821 重试计数：首次标记 scanned，后续尝试重定向
};

// 扫码流程中的浏览器会话 Cookie
let sessionCookies = {};

function mergeCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const c of cookies) {
    const parts = c.split(';')[0];
    if (!parts) continue;
    const [key, ...val] = parts.split('=');
    const k = key.trim();
    if (k && !['Path', 'Domain', 'Expires', 'Max-Age', 'Secure', 'HttpOnly'].includes(k)) {
      sessionCookies[k] = val.join('=');
    }
  }
}

function mergeCookiePairInto(target, cookieStr) {
  const parts = cookieStr.split(';')[0];
  if (!parts) return;
  const [key, ...val] = parts.split('=');
  const k = key.trim();
  if (k && !['Path', 'Domain', 'Expires', 'Max-Age', 'Secure', 'HttpOnly'].includes(k)) {
    target[k] = val.join('=');
  }
}

function mergeCookiesInto(target, setCookieHeaders) {
  if (!setCookieHeaders) return;
  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const c of cookies) {
    mergeCookiePairInto(target, c);
  }
}

function parseCookieStringInto(target, cookieStr) {
  if (!cookieStr || typeof cookieStr !== 'string') return;
  for (const pair of cookieStr.split(';')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const [key, ...val] = trimmed.split('=');
    const k = key.trim();
    if (k && !['Path', 'Domain', 'Expires', 'Max-Age', 'Secure', 'HttpOnly'].includes(k)) {
      target[k] = val.join('=');
    }
  }
}

function buildSessionCookieStr() {
  return Object.entries(sessionCookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function getCookie() {
  return currentCookie;
}

async function setCookie(cookie) {
  currentCookie = cookie || '';
  loginTime = Date.now();
  userProfile = null;

  // Fetch user profile to show identity
  if (currentCookie) {
    try {
      const res = await login_status({ cookie: currentCookie });
      const profile = res?.body?.data?.profile;
      const account = res?.body?.data?.account;
      if (profile) {
        userProfile = {
          nickname: profile.nickname || '',
          avatarUrl: profile.avatarUrl || '',
          userId: profile.userId || account?.id || '',
          vipType: profile.vipType ?? -1,
        };
        console.log('[NCM Auth] User profile fetched:', userProfile.nickname);
      } else {
        console.log('[NCM Auth] login_status returned no profile, code:', res?.body?.code);
      }
    } catch (e) {
      console.log('[NCM Auth] Failed to fetch user profile:', e.message);
    }
  }

  return currentCookie;
}

function clearCookie() {
  currentCookie = '';
  loginTime = 0;
  userProfile = null;
}

function hasCookie() {
  return !!currentCookie;
}

// ── 账号密码登录 ──

/**
 * 通过手机号登录获取 cookie
 */
async function loginByPhone(phone, password) {
  try {
    const result = await login_cellphone({ phone, password, md5_password: undefined });
    if (result.status === 200 && result.body?.cookie) {
      const cookie = result.body.cookie;
      const cookieStr = typeof cookie === 'string' ? cookie
        : Object.entries(cookie).map(([k, v]) => `${k}=${v}`).join('; ');
      setCookie(cookieStr);
      return { success: true, cookie: cookieStr };
    }
    return { success: false, message: result.body?.message || '登录失败，请检查手机号和密码' };
  } catch (err) {
    return { success: false, message: err.message || '登录请求失败' };
  }
}

/**
 * 通过邮箱登录获取 cookie
 */
async function loginByEmail(email, password) {
  try {
    const result = await login_email({ email, password, md5_password: undefined });
    if (result.status === 200 && result.body?.cookie) {
      const cookieStr = typeof result.body.cookie === 'string'
        ? result.body.cookie
        : Object.entries(result.body.cookie).map(([k, v]) => `${k}=${v}`).join('; ');
      setCookie(cookieStr);
      return { success: true, cookie: cookieStr };
    }
    return { success: false, message: result.body?.message || '登录失败' };
  } catch (err) {
    return { success: false, message: err.message || '登录请求失败' };
  }
}

/**
 * 刷新 cookie (续期)
 */
async function refreshCookie() {
  if (!currentCookie) return { success: false, message: '没有已保存的 cookie' };
  try {
    const result = await login_refresh({ cookie: currentCookie });
    if (result.status === 200 && result.body?.cookie) {
      const cookieStr = typeof result.body.cookie === 'string'
        ? result.body.cookie
        : Object.entries(result.body.cookie).map(([k, v]) => `${k}=${v}`).join('; ');
      setCookie(cookieStr);
      return { success: true, cookie: cookieStr };
    }
    return { success: false, message: 'cookie 刷新失败，请重新登录' };
  } catch (err) {
    return { success: false, message: err.message || '刷新请求失败' };
  }
}

function getStatus() {
  return {
    hasCookie: !!currentCookie,
    loginTime: loginTime ? new Date(loginTime).toISOString() : null,
    cookieAge: loginTime ? Math.floor((Date.now() - loginTime) / 1000 / 60) : null,
    profile: userProfile || null,
  };
}

// ══════════════════════════════════════════
//  扫码登录 - 直接 HTTP + weapi 加密
//  绕过 NeteaseCloudMusicApi 的 Cookie 覆盖
// ══════════════════════════════════════════

/**
 * 访问网易云首页建立浏览器会话
 */
async function initSession() {
  sessionCookies = {};
  try {
    const r1 = await browserAxios.get('https://music.163.com/', {
      maxRedirects: 5,
      timeout: 10000,
    });
    mergeCookies(r1.headers['set-cookie']);
    console.log('[NCM] Session established, cookies:', Object.keys(sessionCookies).join(','));
  } catch (e) {
    console.log('[NCM] Session init warning:', e.message);
  }
}

/**
 * 生成扫码登录二维码
 * 使用 weapi 加密直连 music.163.com，保持浏览器会话一致性
 */
async function generateQrcode() {
  try {
    await initSession();

    const cookieStr = buildSessionCookieStr();

    // Step 1: 获取 unikey
    const keyData = { type: 3 };
    const keyEnc = weapi(keyData);

    const keyResp = await browserAxios.post(
      'https://music.163.com/weapi/login/qrcode/unikey',
      new URLSearchParams({ params: keyEnc.params, encSecKey: keyEnc.encSecKey }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://music.163.com/',
          'Cookie': cookieStr,
        },
        timeout: 10000,
      },
    );

    // 合并服务器返回的新 cookie
    mergeCookies(keyResp.headers['set-cookie']);

    const keyBody = keyResp.data;
    // weapi 响应格式: { code: 200, unikey: "..." }
    const unikey = keyBody?.unikey || keyBody?.data?.unikey;
    if (!unikey) {
      console.error('[NCM] unikey response:', JSON.stringify(keyBody));
      return { code: 500, message: '获取登录密钥失败，请稍后重试' };
    }

    // Step 2: 本地生成二维码图片（login_qr_create 是纯本地操作，无HTTP请求）
    const qrResult = await login_qr_create({ key: unikey, qrimg: true });
    if (qrResult.status !== 200 || !qrResult.body?.data?.qrimg) {
      return { code: 500, message: '生成二维码失败，请稍后重试' };
    }

    qrState = {
      unikey,
      qrcode: qrResult.body.data.qrimg,
      startTime: Date.now(),
      status: 'waiting',
      seen8821: 0,
    };

    console.log('[NCM] QR code generated, unikey:', unikey);
    return { code: 200, data: { qrcode: qrResult.body.data.qrimg } };
  } catch (err) {
    console.error('[NCM] QR generate error:', err.message);
    return { code: 500, message: '生成二维码失败: ' + err.message };
  }
}

/**
 * 检查扫码状态
 * 使用 weapi 加密直连 music.163.com，保持浏览器会话一致性
 */
async function checkQrcodeStatus() {
  if (qrState.status === 'idle') {
    return { code: 400, message: '请先生成二维码' };
  }

  if (qrState.status === 'success' || qrState.status === 'expired') {
    return { code: 200, data: { status: qrState.status } };
  }

  // 超时判断
  if (Date.now() - qrState.startTime > 300000) {
    qrState.status = 'expired';
    return { code: 200, data: { status: 'expired' } };
  }

  try {
    // 使用 NeteaseCloudMusicApi 的 login_qr_check —— 内部自动处理 cookie 和重定向
    const result = await login_qr_check({
      key: qrState.unikey,
      type: 3,
    });

    console.log('[NCM] QR poll:', result.status, '| code:', result.body?.code, '| cookie:', result.body?.cookie ? 'present' : 'none');

    if (result.status !== 200) {
      return { code: 200, data: { status: 'waiting' } };
    }

    const body = result.body || {};
    const code = body.code;

    if (code == 800) {
      qrState.status = 'expired';
      return { code: 200, data: { status: 'expired' } };
    }

    if (code == 801 || code === undefined) {
      return { code: 200, data: { status: 'waiting' } };
    }

    if (code == 802) {
      if (qrState.status !== 'scanned') {
        qrState.status = 'scanned';
        console.log('[NCM] QR code scanned');
      }
      return { code: 200, data: { status: 'scanned', nickname: body.nickname || '' } };
    }

    if (code == 803 || code == 8821) {
      // 登录完成 —— 库已收集 cookie
      const cookie = body.cookie || '';
      console.log('[NCM] Login complete, code:', code, '| cookie length:', cookie.length, '| MUSIC_U:', cookie.includes('MUSIC_U'));

      if (cookie && cookie.includes('MUSIC_U')) {
        setCookie(cookie);
        qrState.status = 'success';
        console.log('[NCM] QR login success, nickname:', body.nickname || 'unknown');
        return {
          code: 200,
          data: {
            status: 'success',
            nickname: body.nickname || '',
            avatarUrl: body.avatarUrl || '',
          },
        };
      }

      console.warn('[NCM] Login code', code, 'but no MUSIC_U in cookie');
      qrState.status = 'expired';
      return { code: 200, data: { status: 'expired' } };
    }

    console.warn('[NCM] QR poll unexpected code:', code);

    // 超时自动过期
    if (Date.now() - qrState.startTime > 180000) {
      qrState.status = 'expired';
      return { code: 200, data: { status: 'expired' } };
    }

    return { code: 200, data: { status: 'waiting' } };
  } catch (err) {
    console.error('[NCM] QR check error:', err.message);

    // 超时自动过期
    if (Date.now() - qrState.startTime > 180000) {
      qrState.status = 'expired';
      return { code: 200, data: { status: 'expired' } };
    }

    return { code: 200, data: { status: 'waiting' } };
  }
}

function getQrStatus() {
  return {
    status: qrState.status,
    qrcode: qrState.qrcode,
    elapsed: qrState.startTime ? Math.floor((Date.now() - qrState.startTime) / 1000) : 0,
  };
}

/**
 * Restore cookie from DB on server startup (called by app.js)
 */
async function initFromDB(getCookieFn) {
  if (currentCookie) return; // Already set via env or setCookie
  try {
    const dbCookie = await getCookieFn();
    if (dbCookie) {
      await setCookie(dbCookie);
      console.log('[NCM Auth] Cookie restored from database');
    }
  } catch (e) {
    // DB might not be ready yet at startup, ignore
  }
}

module.exports = {
  getCookie,
  setCookie,
  clearCookie,
  hasCookie,
  loginByPhone,
  loginByEmail,
  refreshCookie,
  getStatus,
  generateQrcode,
  checkQrcodeStatus,
  getQrStatus,
  initFromDB,
};
