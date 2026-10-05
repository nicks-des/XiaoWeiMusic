/**
 * 酷狗音乐认证管理
 * - 启动时从 .env 读取 KUGOU_COOKIE
 * - 运行时可通过 API 更新 cookie (手动粘贴)
 * - 酷狗官方扫码接口已下线，仅支持 Cookie 手动输入
 */
const axios = require('axios');

let currentCookie = process.env.KUGOU_COOKIE || '';
let loginTime = 0;

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
 * 验证 cookie 是否有效 (调用酷狗用户信息接口)
 */
async function validateCookie() {
  if (!currentCookie) return false;
  try {
    const resp = await axios.get('https://www.kugou.com/yy/index.php', {
      params: { r: 'user/basicInfo', _: Date.now() },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.kugou.com/',
        'Cookie': currentCookie,
      },
      timeout: 8000,
    });
    const data = resp.data;
    return data?.status === 1 || data?.data?.userid;
  } catch {
    return false;
  }
}

function getStatus() {
  return {
    hasCookie: !!currentCookie,
    loginTime: loginTime ? new Date(loginTime).toISOString() : null,
    cookieAge: loginTime ? Math.floor((Date.now() - loginTime) / 1000 / 60) : null,
  };
}

module.exports = {
  getCookie,
  setCookie,
  clearCookie,
  hasCookie,
  validateCookie,
  getStatus,
};
