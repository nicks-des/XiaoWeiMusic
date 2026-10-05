/**
 * 平台扫码登录统一管理
 * - 网易云: 复用 NeteaseCloudMusicApi + ncmAuth 实现
 * - QQ 音乐: 复用 qqmusicAuth 的 ptqrlogin 实现
 * - 酷狗: 自实现 ptlogin 流程
 * - 酷我: 自实现 passport 流程
 */
const axios = require('axios');
const https = require('https');
const ncmAuth = require('./ncmAuth');
const qqmusicAuth = require('./qqmusicAuth');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const browserAxios = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
});

// ==================== 网易云 ====================
async function neteaseGenerateQrcode() {
  return ncmAuth.generateQrcode();
}
async function neteaseCheckQrcode() {
  return ncmAuth.checkQrcodeStatus();
}
async function neteaseGetProfile(cookie) {
  try {
    // 通过用户信息接口验证 cookie 并获取昵称
    const resp = await axios.get('https://music.163.com/api/nuser/account/get', {
      headers: { Cookie: cookie, 'User-Agent': UA, Referer: 'https://music.163.com/' },
      timeout: 6000,
      validateStatus: () => true,
    });
    if (resp.data?.profile) {
      return {
        platform_uid: String(resp.data.profile.userId || resp.data.account?.id || ''),
        platform_nickname: resp.data.profile.nickname || '',
        platform_avatar: resp.data.profile.avatarUrl || '',
      };
    }
  } catch (_) {}
  return { platform_uid: null, platform_nickname: '已绑定用户' };
}

// ==================== QQ 音乐 ====================
async function qqGenerateQrcode() {
  return qqmusicAuth.generateQrcode();
}
async function qqCheckQrcode() {
  return qqmusicAuth.checkQrcodeStatus();
}
async function qqGetProfile(cookie) {
  try {
    const resp = await axios.get('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      params: {
        format: 'json',
        data: JSON.stringify({
          req_0: {
            module: 'userInfo.BaseUserInfoServer',
            method: 'get_user_baseinfo_v2',
            param: {},
          },
        }),
      },
      headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/', Cookie: cookie },
      timeout: 6000,
    });
    const info = resp.data?.req_0?.data;
    if (info) {
      return {
        platform_uid: String(info.uin || qqmusicAuth.extractUin(cookie) || ''),
        platform_nickname: info.nick || info.nickname || '',
        platform_avatar: info.headpic || '',
      };
    }
  } catch (_) {}
  return { platform_uid: qqmusicAuth.extractUin(cookie) || null, platform_nickname: 'QQ用户' };
}

// ==================== 酷狗音乐 ====================
// 酷狗扫码登录通过 login.kugou.com
let kugouState = {
  uuid: null,
  qrcode: null,
  startTime: 0,
  status: 'idle',
  sessionCookies: {},
};

function kugouMergeCookies(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of list) {
    const [pair] = c.split(';');
    const [k, ...v] = pair.split('=');
    if (k) kugouState.sessionCookies[k.trim()] = v.join('=');
  }
}

function kugouBuildCookie() {
  return Object.entries(kugouState.sessionCookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function kugouGenerateQrcode() {
  try {
    kugouState = { uuid: null, qrcode: null, startTime: 0, status: 'idle', sessionCookies: {} };

    // 访问登录页获取会话
    await browserAxios.get('https://www.kugou.com/', {
      maxRedirects: 3,
      timeout: 8000,
    });

    const ts = Date.now();
    const resp = await browserAxios.get('https://login.kugou.com/loginqr/ptqrcode', {
      params: {
        appid: '1001',
        type: '1',
        plat: 'web',
        version: '1.0.0',
        ts,
        // 兼容可能有的额外参数
        daid: '',
      },
      headers: { Referer: 'https://www.kugou.com/' },
      responseType: 'arraybuffer',
      timeout: 8000,
      validateStatus: () => true,
    });

    kugouMergeCookies(resp.headers);

    if (resp.status === 200 && resp.data && resp.data.length > 100) {
      const base64 = Buffer.from(resp.data).toString('base64');
      const qrcode = `data:image/png;base64,${base64}`;
      kugouState = {
        uuid: resp.headers['x-uuid'] || String(ts),
        qrcode,
        startTime: Date.now(),
        status: 'waiting',
        sessionCookies: kugouState.sessionCookies,
      };
      return { code: 200, data: { qrcode } };
    }

    // 备用接口
    return { code: 500, message: '酷狗扫码服务暂不可用，请稍后重试' };
  } catch (err) {
    console.error('[KuGou] QR generate error:', err.message);
    return { code: 500, message: '生成酷狗二维码失败: ' + err.message };
  }
}

async function kugouCheckQrcode() {
  if (kugouState.status === 'idle') return { code: 400, message: '请先生成二维码' };
  if (Date.now() - kugouState.startTime > 300000) {
    kugouState.status = 'expired';
    return { code: 200, data: { status: 'expired' } };
  }
  if (kugouState.status === 'success' || kugouState.status === 'expired') {
    return { code: 200, data: { status: kugouState.status } };
  }
  // 酷狗扫码登录比较受限(风控严格),此接口为占位
  return { code: 200, data: { status: 'waiting' } };
}

// ==================== 酷我音乐 ====================
// 酷我扫码通过 passport.kuwo.cn
let kuwoState = {
  qrcodeId: null,
  qrcode: null,
  startTime: 0,
  status: 'idle',
  sessionCookies: {},
};

function kuwoMergeCookies(headers) {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of list) {
    const [pair] = c.split(';');
    const [k, ...v] = pair.split('=');
    if (k) kuwoState.sessionCookies[k.trim()] = v.join('=');
  }
}

function kuwoBuildCookie() {
  return Object.entries(kuwoState.sessionCookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function kuwoGenerateQrcode() {
  try {
    kuwoState = { qrcodeId: null, qrcode: null, startTime: 0, status: 'idle', sessionCookies: {} };

    // 1) 访问登录页建立会话
    await browserAxios.get('https://www.kuwo.cn/', {
      maxRedirects: 3,
      timeout: 8000,
    });

    // 2) 获取二维码 id
    const ts = Date.now();
    const idResp = await browserAxios.get('https://passport.kuwo.cn/NMuser/QRLogin/getQR', {
      params: { timestamp: ts },
      headers: { Referer: 'https://www.kuwo.cn/' },
      timeout: 8000,
    });
    kuwoMergeCookies(idResp.headers);

    const idData = typeof idResp.data === 'string' ? safeJson(idResp.data) : idResp.data;
    const qrcodeId = idData?.data?.qrcodeId || idData?.qrcodeId;

    if (!qrcodeId) {
      return { code: 500, message: '获取酷我二维码 ID 失败' };
    }

    // 3) 获取二维码图片
    const imgResp = await browserAxios.get(`https://passport.kuwo.cn/NMuser/QRLogin/getQRImg`, {
      params: { qrcodeId, timestamp: Date.now() },
      headers: { Referer: 'https://www.kuwo.cn/' },
      responseType: 'arraybuffer',
      timeout: 8000,
    });
    kuwoMergeCookies(imgResp.headers);

    if (imgResp.status === 200 && imgResp.data) {
      const base64 = Buffer.from(imgResp.data).toString('base64');
      const qrcode = `data:image/png;base64,${base64}`;
      kuwoState = {
        qrcodeId,
        qrcode,
        startTime: Date.now(),
        status: 'waiting',
        sessionCookies: kuwoState.sessionCookies,
      };
      return { code: 200, data: { qrcode } };
    }

    return { code: 500, message: '获取酷我二维码图片失败' };
  } catch (err) {
    console.error('[KuWo] QR generate error:', err.message);
    return { code: 500, message: '生成酷我二维码失败: ' + err.message };
  }
}

async function kuwoCheckQrcode() {
  if (kuwoState.status === 'idle') return { code: 400, message: '请先生成二维码' };
  if (Date.now() - kuwoState.startTime > 300000) {
    kuwoState.status = 'expired';
    return { code: 200, data: { status: 'expired' } };
  }
  if (kuwoState.status === 'success' || kuwoState.status === 'expired') {
    return { code: 200, data: { status: kuwoState.status } };
  }

  try {
    const cookieStr = kuwoBuildCookie();
    const resp = await browserAxios.get('https://passport.kuwo.cn/NMuser/QRLogin/checkQR', {
      params: { qrcodeId: kuwoState.qrcodeId, timestamp: Date.now() },
      headers: { Referer: 'https://www.kuwo.cn/', Cookie: cookieStr },
      timeout: 8000,
      validateStatus: () => true,
    });
    kuwoMergeCookies(resp.headers);

    const data = typeof resp.data === 'string' ? safeJson(resp.data) : resp.data;
    // 酷我返回结构: { code: 0/1, msg: '...', data: { status: 0/1/2/3 } }
    // 0=未扫码, 1=已扫码未确认, 2=已确认(成功), 3=已过期
    const status = data?.data?.status ?? data?.status;
    if (status === 2) {
      kuwoState.status = 'success';
      // 提取 cookie
      const finalCookie = kuwoBuildCookie();
      return {
        code: 200,
        data: {
          status: 'success',
          cookie: finalCookie,
        },
      };
    }
    if (status === 3) {
      kuwoState.status = 'expired';
      return { code: 200, data: { status: 'expired' } };
    }
    if (status === 1) {
      return { code: 200, data: { status: 'scanned' } };
    }
    return { code: 200, data: { status: 'waiting' } };
  } catch (err) {
    console.error('[KuWo] QR check error:', err.message);
    return { code: 200, data: { status: 'waiting' } };
  }
}

function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// ==================== 平台调度 ====================

const PLATFORMS = {
  netease: {
    label: '网易云音乐',
    icon: 'netease',
    generate: neteaseGenerateQrcode,
    check: neteaseCheckQrcode,
    getProfile: neteaseGetProfile,
    // 提取 cookie
    extractCookie: (checkResult) => {
      const status = checkResult?.data?.status;
      if (status === 'success') {
        return ncmAuth.getCookie();
      }
      return null;
    },
  },
  qqmusic: {
    label: 'QQ 音乐 (仅支持Cookie/账号登录)',
    icon: 'qq',
    generate: async () => ({ code: 400, message: 'QQ音乐暂不支持扫码登录，请使用Cookie粘贴或QQ账号登录' }),
    check: async () => ({ code: 200, data: { status: 'waiting' } }),
    getProfile: qqGetProfile,
    extractCookie: () => qqmusicAuth.getCookie(),
  },
  kugou: {
    label: '酷狗音乐',
    icon: 'kugou',
    generate: kugouGenerateQrcode,
    check: kugouCheckQrcode,
    getProfile: async () => ({ platform_uid: null, platform_nickname: '酷狗用户' }),
    extractCookie: (checkResult) => checkResult?.data?.cookie || null,
  },
  kuwo: {
    label: '酷我音乐',
    icon: 'kuwo',
    generate: kuwoGenerateQrcode,
    check: kuwoCheckQrcode,
    getProfile: async () => ({ platform_uid: null, platform_nickname: '酷我用户' }),
    extractCookie: (checkResult) => checkResult?.data?.cookie || null,
  },
};

function listPlatforms() {
  return Object.entries(PLATFORMS).map(([key, v]) => ({
    key,
    label: v.label,
  }));
}

module.exports = {
  PLATFORMS,
  listPlatforms,
  // 显式导出各平台方法
  neteaseGenerateQrcode,
  neteaseCheckQrcode,
  neteaseGetProfile,
  qqGenerateQrcode,
  qqCheckQrcode,
  qqGetProfile,
  kugouGenerateQrcode,
  kugouCheckQrcode,
  kuwoGenerateQrcode,
  kuwoCheckQrcode,
};
