/**
 * QQ音乐认证管理
 * - 启动时从 .env 读取 QQMUSIC_COOKIE
 * - 运行时可通过 API 更新 cookie
 * - QQ音乐 vkey API 通过 Cookie 中的 uin/skey 识别会员身份
 * - 支持扫码登录 (二维码) - 模拟浏览器行为防检测
 */
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');

// 创建一个带连接池的 axios 实例，模拟浏览器行为
const browserAxios = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
  },
});

let currentCookie = process.env.QQMUSIC_COOKIE || '';
let loginTime = 0;

// 扫码登录状态
let qrState = {
  qrsig: null,
  loginSig: '',
  qrcode: null,
  startTime: 0,
  status: 'idle',
};

// 扫码流程中的会话 Cookie 管理
let sessionCookies = {};

function getCookie() {
  return currentCookie;
}

function setCookie(cookie) {
  currentCookie = cookie || '';
  loginTime = Date.now();
  return currentCookie;
}

function clearCookie() {
  currentCookie = '';
  loginTime = 0;
}

function hasCookie() {
  return !!currentCookie;
}

/**
 * 从 Cookie 中提取 uin (QQ号)
 */
function extractUin(cookie = currentCookie) {
  if (!cookie) return '0';
  // Try uin=oXXXXXX or uin=XXXXX format
  const match = cookie.match(/uin=o?0*(\d+)/i);
  return match ? match[1] : '0';
}

function parsePtuiCallback(text) {
  const raw = String(text || '');
  const match = raw.match(/ptuiCB\((.*)\)\s*;?\s*$/s);
  if (!match) return null;

  const args = [];
  const re = /'([^']*)'/g;
  let item;
  while ((item = re.exec(match[1])) !== null) {
    args.push(item[1]);
  }

  if (args.length === 0) return null;
  return {
    code: parseInt(args[0], 10),
    subCode: args[1] || '',
    redirectUrl: args[2] || '',
    message: args[4] || '',
    nickname: args[5] || '',
    args,
  };
}

function mapPtuiCodeToQrStatus(code) {
  if (code === 0) return 'success';
  if (code === 65) return 'expired';
  if (code === 67) return 'scanned';
  if (code === 66) return 'waiting';
  return 'waiting';
}

/**
 * 验证 cookie 是否有效 (通过调用一个简单的API)
 */
async function validateCookie() {
  if (!currentCookie) return false;
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
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com/',
        'Cookie': currentCookie,
      },
      timeout: 8000,
    });
    const data = resp.data;
    return data?.req_0?.code === 0;
  } catch {
    return false;
  }
}

function getStatus() {
  return {
    hasCookie: !!currentCookie,
    loginTime: loginTime ? new Date(loginTime).toISOString() : null,
    cookieAge: loginTime ? Math.floor((Date.now() - loginTime) / 1000 / 60) : null,
    uin: extractUin(),
  };
}

// ── 扫码登录 ──

/**
 * 从 Set-Cookie 头中提取并合并 cookie
 */
function mergeCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const c of cookies) {
    const parts = c.split(';')[0];
    if (!parts) continue;
    const [key, ...val] = parts.split('=');
    if (key && !['Path', 'Domain', 'Expires', 'Max-Age', 'Secure', 'HttpOnly'].includes(key.trim())) {
      sessionCookies[key.trim()] = val.join('=');
    }
  }
}

function getCookieValueFromSetCookieHeaders(setCookieHeaders, name) {
  if (!setCookieHeaders || !name) return '';
  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const c of cookies) {
    const [pair] = String(c).split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    if (key === name) return pair.slice(eq + 1);
  }
  return '';
}

function buildCookieStr() {
  return Object.entries(sessionCookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * 建立浏览器会话: 访问QQ音乐首页 + 登录页面
 */
async function initSession() {
  sessionCookies = {};
  try {
    // 步骤1: 访问QQ音乐首页，获取基础 cookie
    const r1 = await browserAxios.get('https://y.qq.com/', {
      maxRedirects: 5,
      timeout: 10000,
    });
    mergeCookies(r1.headers['set-cookie']);

    // 步骤2: 预热 ssl.ptlogin2.qq.com 域名，建立同域 Cookie 上下文
    try {
      const xloginResp = await browserAxios.get('https://xui.ptlogin2.qq.com/cgi-bin/xlogin', {
        params: {
          appid: '716027609',
          daid: '383',
          style: '33',
          login_text: '授权并登录',
          hide_title_bar: '1',
          hide_border: '1',
          target: 'self',
          s_url: 'https://y.qq.com/',
          pt_no_auth: '1',
        },
        headers: {
          'Referer': 'https://y.qq.com/',
          'Cookie': buildCookieStr() || undefined,
        },
        maxRedirects: 5,
        timeout: 10000,
        validateStatus: (s) => s < 500,
      });
      mergeCookies(xloginResp.headers['set-cookie']);
      const loginSig = sessionCookies['pt_login_sig']
        || getCookieValueFromSetCookieHeaders(xloginResp.headers['set-cookie'], 'pt_login_sig');
      if (loginSig) qrState.loginSig = loginSig;
      console.log('[QQMusic] xlogin initialized, status:', xloginResp.status,
        '| login_sig:', loginSig ? 'present' : 'MISSING');
    } catch (e) {
      console.log('[QQMusic] xlogin init warning:', e.message);
    }

    console.log('[QQMusic] Session established, cookies:', Object.keys(sessionCookies).join(','));
  } catch (e) {
    console.log('[QQMusic] Session init warning:', e.message);
  }
}

/**
 * hash33 算法 - QQ登录 ptqrtoken 计算
 */
function hash33(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash += (hash << 5) + str.charCodeAt(i);
  }
  return hash & 0x7fffffff;
}

/**
 * 生成QQ音乐扫码登录二维码 (模拟浏览器流程)
 */
async function generateQrcode() {
  try {
    // 先建立浏览器会话
    await initSession();

    const ts = Date.now();
    const cookieStr = buildCookieStr();
    
    const resp = await browserAxios.get('https://ssl.ptlogin2.qq.com/ptqrshow', {
      params: {
        appid: '716027609',
        e: '2',
        l: 'M',
        s: '3',
        d: '72',
        v: '4',
        t: ts,
        daid: '383',
        pt_3rd_aid: '0',
      },
      responseType: 'arraybuffer',
      headers: {
        'Referer': 'https://ssl.ptlogin2.qq.com/',
        'Cookie': cookieStr,
      },
      timeout: 8000,
    });

    // 提取新 cookie
    mergeCookies(resp.headers['set-cookie']);

    // 从 ptqrshow 响应 cookie 中提取 login_sig
    if (!qrState.loginSig && sessionCookies['pt_login_sig']) {
      qrState.loginSig = sessionCookies['pt_login_sig'];
      console.log('[QQMusic] login_sig from ptqrshow cookie:', qrState.loginSig.substring(0, 10) + '...');
    }
    if (!qrState.loginSig) {
      console.log('[QQMusic] WARNING: login_sig not found after ptqrshow');
    }

    // 从当前会话 Cookie 中找 qrsig
    let qrsig = sessionCookies['qrsig'];
    
    // 也检查 Set-Cookie
    if (!qrsig) {
      const setCookie = resp.headers['set-cookie'];
      if (setCookie) {
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
        for (const c of cookies) {
          const m = c.match(/qrsig=([^;]+)/);
          if (m) { qrsig = m[1]; break; }
        }
      }
    }

    if (!qrsig) {
      return { code: 500, message: '获取登录令牌失败，请稍后重试' };
    }

    const base64 = Buffer.from(resp.data).toString('base64');
    const qrcode = `data:image/png;base64,${base64}`;

    qrState = { qrsig, loginSig: qrState.loginSig || '', qrcode, startTime: Date.now(), status: 'waiting' };

    return { code: 200, data: { qrcode } };
  } catch (err) {
    console.error('[QQMusic] QR generate error:', err.message);
    return { code: 500, message: '生成二维码失败: ' + err.message };
  }
}

/**
 * 检查扫码状态 (使用会话 cookie)
 */
async function checkQrcodeStatus() {
  if (qrState.status === 'idle') {
    return { code: 400, message: '请先生成二维码' };
  }

  // QQ 服务端二维码有效期约 60~120 秒，后端 120 秒硬超时兜底
  if (Date.now() - qrState.startTime > 120000) {
    qrState.status = 'expired';
    return { code: 200, data: { status: 'expired' } };
  }

  // 只缓存终态(success/expired)，scanned 仍需继续轮询等待用户确认
  if (qrState.status === 'success' || qrState.status === 'expired') {
    return { code: 200, data: { status: qrState.status } };
  }

  try {
    const ptqrtoken = hash33(qrState.qrsig);
    const ts = Date.now();
    const cookieStr = buildCookieStr();

    const resp = await browserAxios.get('https://ssl.ptlogin2.qq.com/ptqrlogin', {
      params: {
        u1: 'https://y.qq.com/',
        ptqrtoken,
        ptredirect: '0',
        h: '1',
        t: '1',
        g: '1',
        from_ui: '1',
        ptlang: '2052',
        action: `0-0-${ts}`,
        js_ver: '21060411',
        js_type: '1',
        login_sig: qrState.loginSig || '',
        pt_uistyle: '40',
        aid: '716027609',
        daid: '383',
      },
      headers: {
        'Referer': 'https://ssl.ptlogin2.qq.com/',
        'Cookie': cookieStr,
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Dest': 'iframe',
      },
      maxRedirects: 0,
      validateStatus: (s) => s < 400,
      timeout: 8000,
    });

    // 合并新 cookie
    mergeCookies(resp.headers['set-cookie']);

    const text = resp.data;
    const callback = parsePtuiCallback(text);
    if (!callback || Number.isNaN(callback.code)) {
      return { code: 200, data: { status: 'waiting' } };
    }

    const code = callback.code;
    const qrStatus = mapPtuiCodeToQrStatus(code);

    if (qrStatus === 'expired') {
      qrState.status = 'expired';
      return { code: 200, data: { status: 'expired' } };
    }

    if (qrStatus === 'scanned') {
      qrState.status = 'scanned';
      return { code: 200, data: { status: 'scanned' } };
    }

    if (qrStatus === 'success') {
      // 登录成功 - 收集所有 cookie
      mergeCookies(resp.headers['set-cookie']);
      console.log('[QQMusic] Login code 67, cookies so far:', 
        Object.keys(sessionCookies).filter(k => ['uin','skey','p_skey','p_uin','pt2gguin','superuin','superkey'].includes(k)).join(','));

      // 通过登录回调链接获取 y.qq.com 域下的完整 cookie
      try {
        if (callback.redirectUrl) {
          const checkUrl = callback.redirectUrl;
          console.log('[QQMusic] Following login redirect:', checkUrl.substring(0, 80) + '...');

          // Manual redirect following to capture cookies at each hop.
          // CRITICAL: Pass accumulated cookies on each hop so QQ's intermediate
          // servers can authenticate the login session and set domain-specific
          // session cookies (skey/p_skey for .qq.com → qqmusic_key for .y.qq.com).
          let redirectUrl = checkUrl;
          for (let hop = 0; hop < 8; hop++) {
            const currentCookieStr = buildCookieStr();
            console.log('[QQMusic] Redirect hop', hop, 'cookies count:', Object.keys(sessionCookies).length);
            const hopResp = await browserAxios.get(redirectUrl, {
              headers: {
                'Referer': 'https://ssl.ptlogin2.qq.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Cookie': currentCookieStr || undefined,
              },
              maxRedirects: 0,
              validateStatus: (s) => s >= 200 && s < 400,
              timeout: 10000,
            });
            
            // Capture cookies from this hop
            mergeCookies(hopResp.headers['set-cookie']);
            
            const location = hopResp.headers['location'];
            if (!location) break;
            redirectUrl = location.startsWith('http') ? location : new URL(location, redirectUrl).href;
            console.log('[QQMusic] Redirect hop', hop + 1, '→', redirectUrl.substring(0, 60) + '...');
          }

          console.log('[QQMusic] Redirect chain complete, key cookies:', 
            Object.keys(sessionCookies).filter(k => 
              ['uin','skey','p_skey','p_uin','pt2gguin','superuin','superkey','qqmusic_key'].includes(k)
            ).map(k => k + '=' + (sessionCookies[k] ? 'present' : '')).join(','));
        }
      } catch (e2) {
        console.log('[QQMusic] Login redirect chain error:', e2.message);
      }

      // Request y.qq.com homepage to establish QQ Music session from QQ login cookies
      try {
        const allCookieStr = buildCookieStr();
        console.log('[QQMusic] Requesting y.qq.com homepage to set session cookies...');
        const homeResp = await browserAxios.get('https://y.qq.com/', {
          headers: {
            'Referer': 'https://ssl.ptlogin2.qq.com/',
            'Cookie': allCookieStr,
          },
          maxRedirects: 3,
          timeout: 10000,
          validateStatus: (s) => s < 500,
        });
        mergeCookies(homeResp.headers['set-cookie']);
        console.log('[QQMusic] y.qq.com homepage status:', homeResp.status,
          '| new cookies:', 
          Object.keys(sessionCookies).filter(k => 
            ['uin','skey','p_skey','qqmusic_key','qqmusic_uin','p_uin','p_luin','p_lskey'].includes(k)
          ).map(k => k + '=' + (sessionCookies[k] ? 'present' : '')).join(','));
      } catch (e3) {
        console.log('[QQMusic] y.qq.com homepage request error:', e3.message);
      }

      // Validate login on y.qq.com user info API
      try {
        const allCookieStr = buildCookieStr();
        console.log('[QQMusic] Validating user info...');
        const valResp = await browserAxios.get('https://u.y.qq.com/cgi-bin/musicu.fcg', {
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
          headers: {
            'Referer': 'https://y.qq.com/',
            'Cookie': allCookieStr,
          },
          timeout: 8000,
        });
        mergeCookies(valResp.headers['set-cookie']);
        const userInfo = valResp.data?.req_0?.data?.userinfo;
        console.log('[QQMusic] User info validation:', valResp.status,
          '| code:', valResp.data?.req_0?.code,
          '| nickname:', userInfo?.nick || '(none)',
          '| final cookies:', Object.keys(sessionCookies).filter(k => 
            ['uin','skey','p_skey','qqmusic_key','qqmusic_uin','p_uin'].includes(k)).join(','));
      } catch (e4) {
        console.log('[QQMusic] User info validation error:', e4.message);
      }

      const finalCookieStr = buildCookieStr();
      setCookie(finalCookieStr);

      qrState.status = 'success';
      console.log('[QQMusic] QR Login success | uin:', extractUin(),
        '| skey:', sessionCookies['skey'] ? 'present' : 'MISSING',
        '| p_skey:', sessionCookies['p_skey'] ? 'present' : 'MISSING',
        '| qqmusic_key:', sessionCookies['qqmusic_key'] ? 'present' : 'MISSING',
        '| cookie length:', finalCookieStr.length);
      
      return {
        code: 200,
        data: {
          status: 'success',
          nickname: callback.nickname || '',
          uin: extractUin(),
        },
      };
    }

    return { code: 200, data: { status: 'waiting' } };
  } catch (err) {
    console.error('[QQMusic] QR check error:', err.message);
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

// ── QQ号+密码登录 (电脑端免扫码) ──

/**
 * QQ 密码加密: md5(md5(md5(password)).toUpperCase() + verifycode.toUpperCase())
 */
function encryptPassword(password, verifycode) {
  const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');
  const md5_3 = md5(md5(md5(password)));
  return md5(md5_3.toUpperCase() + String(verifycode).toUpperCase()).toUpperCase();
}

/**
 * 获取登录验证码
 * @param {string} uin - QQ号
 * @returns {Promise<{needCaptcha: boolean, captchaUrl: string|null, verifycode: string}>}
 */
async function checkLogin(uin) {
  try {
    const resp = await browserAxios.get('https://ssl.ptlogin2.qq.com/check', {
      params: {
        uin,
        appid: '716027609',
        pt_3rd_aid: '0',
        daid: '383',
        js_ver: '21060411',
        js_type: '1',
        login_sig: '',
        pt_uistyle: '40',
        r: Math.random(),
      },
      timeout: 8000,
      validateStatus: (s) => s < 500,
    });

    const text = String(resp.data);
    // Response format: ptui_checkVC('0','!ABC','xxxx','...','...');
    // code=0: no captcha, verifycode returned; code=1: need captcha
    const match = text.match(/ptui_checkVC\('(\d+)','([^']*)','([^']*)'/);
    if (!match) return { needCaptcha: false, captchaUrl: null, verifycode: '' };

    const code = match[1];
    const verifycode = match[2];
    if (code === '0') {
      return { needCaptcha: false, captchaUrl: null, verifycode };
    }
    // Need captcha
    const captchaUrl = `https://ssl.ptlogin2.qq.com/ptcaptcha?aid=716027609&u1=https://y.qq.com/&pt_3rd_aid=0&ptlang=2052&sid=&uin=${uin}&cap_cd=${verifycode}`;
    return { needCaptcha: true, captchaUrl, verifycode };
  } catch (err) {
    console.error('[QQMusic] checkLogin error:', err.message);
    return { needCaptcha: false, captchaUrl: null, verifycode: '' };
  }
}

/**
 * QQ号+密码登录 (ptlogin2 密码登录流程)
 * @param {string} uin - QQ号
 * @param {string} password - 明文密码
 * @param {string} verifycode - 验证码 (如果不需要可传空)
 * @param {object} options - { loginSig: '', pt_verifysession: '' }
 */
async function loginByAccount(uin, password, verifycode = '', options = {}) {
  try {
    const { loginSig, ptVerifysession } = options;
    const pwdEncrypted = encryptPassword(password, verifycode);
    const ts = Date.now();

    const resp = await browserAxios.get('https://ssl.ptlogin2.qq.com/login', {
      params: {
        u: uin,
        p: pwdEncrypted,
        pt_verifysession: ptVerifysession || '1',
        verifycode,
        u1: 'https://y.qq.com/',
        ptredirect: '1',
        h: '1',
        t: '1',
        g: '1',
        from_ui: '1',
        ptlang: '2052',
        action: `0-0-${ts}`,
        js_ver: '21060411',
        js_type: '1',
        login_sig: loginSig || '',
        pt_uistyle: '40',
        aid: '716027609',
        daid: '383',
      },
      headers: {
        'Referer': 'https://xui.ptlogin2.qq.com/',
        'Cookie': loginSig ? `pt_login_sig=${loginSig};` : '',
      },
      maxRedirects: 0,
      validateStatus: (s) => s < 500,
      timeout: 10000,
    });

    const text = String(resp.data);
    // ptuiCB('0','0','https://ptlogin.qq.com/...','...','登录成功','...')
    // ptuiCB('4','0','','','','') - 密码错误
    // ptuiCB('3','0','','','','') - 验证码错误
    const callback = parsePtuiCallback(text);
    if (!callback) {
      return { success: false, message: '登录返回格式异常', raw: text };
    }

    if (callback.code !== 0) {
      const messages = {
        1: '密码错误或账号异常',
        2: '账号存在风险，需要验证',
        3: '验证码错误',
        4: '密码错误',
        5: '需要安全验证',
      };
      return { success: false, message: messages[callback.code] || `登录失败(code:${callback.code})`, raw: text };
    }

    // Login successful - follow redirect to collect cookies
    if (!callback.redirectUrl) {
      return { success: false, message: '登录成功但未获取到跳转地址' };
    }

    // Reset session cookies
    sessionCookies = {};

    let redirectUrl = callback.redirectUrl;
    for (let hop = 0; hop < 8; hop++) {
      const hopResp = await browserAxios.get(redirectUrl, {
        headers: {
          'Referer': 'https://xui.ptlogin2.qq.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        maxRedirects: 0,
        validateStatus: (s) => s >= 200 && s < 400,
        timeout: 10000,
      });

      mergeCookies(hopResp.headers['set-cookie']);

      const location = hopResp.headers['location'];
      if (!location) break;
      redirectUrl = location.startsWith('http') ? location : new URL(location, redirectUrl).href;
    }

    // Visit y.qq.com to establish QQ Music session
    try {
      const cookieStr = buildCookieStr();
      const homeResp = await browserAxios.get('https://y.qq.com/', {
        headers: { 'Cookie': cookieStr },
        maxRedirects: 3,
        timeout: 10000,
        validateStatus: (s) => s < 500,
      });
      mergeCookies(homeResp.headers['set-cookie']);
    } catch (_) {}

    const finalCookieStr = buildCookieStr();
    setCookie(finalCookieStr);

    const hasUsableCookie = isUsableLoginCookie(finalCookieStr);
    console.log('[QQMusic] Account login success | uin:', uin,
      '| hasUsableCookie:', hasUsableCookie,
      '| cookie length:', finalCookieStr.length);

    return {
      success: true,
      message: '登录成功',
      uin: extractUin(finalCookieStr),
      cookie: finalCookieStr,
    };
  } catch (err) {
    console.error('[QQMusic] loginByAccount error:', err.message);
    return { success: false, message: '登录请求失败: ' + err.message };
  }
}

/**
 * 检查 cookie 是否是有效的登录态 (包含 uin 和 session key)
 */
function isUsableLoginCookie(cookie) {
  if (!cookie) return false;
  return /(?:^|;\s*)(?:uin|p_uin|qqmusic_uin|wxuin)=o?\d+/i.test(cookie) &&
    /(?:^|;\s*)(?:skey|p_skey|p_lskey|qqmusic_key|wxskey|wxsid)=/.test(cookie);
}

module.exports = {
  getCookie,
  setCookie,
  clearCookie,
  hasCookie,
  extractUin,
  parsePtuiCallback,
  mapPtuiCodeToQrStatus,
  getCookieValueFromSetCookieHeaders,
  validateCookie,
  getStatus,
  generateQrcode,
  checkQrcodeStatus,
  getQrStatus,
  // 密码登录
  checkLogin,
  loginByAccount,
  encryptPassword,
  isUsableLoginCookie,
};
