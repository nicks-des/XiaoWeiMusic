const { ncmAuth, qqmusicAuth, kugouAuth, kuwoAuth, corsCookieApi, getUserIdFromReq } = require('./shared');
const platformBind = require('../../utils/platformBind');

async function mergeStatusWithBinding(status, platform, req) {
  if (status.hasCookie) return status;

  const userId = getUserIdFromReq(req);
  if (userId) {
    const userCookie = await platformBind.getUserCookie(userId, platform);
    if (userCookie) {
      return {
        ...status,
        hasCookie: true,
        source: 'binding',
      };
    }
  }

  const dbCookie = await platformBind.getGlobalCookie(platform);
  return {
    ...status,
    hasCookie: Boolean(dbCookie),
    source: dbCookie ? 'binding' : status.source,
  };
}

async function persistCookieBinding(req, platform, cookie) {
  const userId = getUserIdFromReq(req);
  if (!cookie) return;
  if (userId) {
    await platformBind.saveBinding(userId, platform, {
      cookie,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  } else {
    // No logged-in user: save as global cookie so it persists across restarts
    await platformBind.saveGlobalCookie(platform, cookie);
  }
}

function registerAuthRoutes(router) {
  // ── 网易云会员认证管理 ──

  // GET /api/music-source/auth/status - 查看 cookie 状态
  router.get('/auth/status', async (req, res) => {
    const status = await mergeStatusWithBinding(ncmAuth.getStatus(), 'netease', req);
    res.json({ code: 200, message: 'success', data: status });
  });

  // POST /api/music-source/auth/login - 通过手机号或邮箱登录
  router.post('/auth/login', async (req, res) => {
    try {
      const { phone, email, password } = req.body;
      if (!password) {
        return res.status(400).json({ code: 400, message: '请输入密码' });
      }

      let result;
      if (phone) {
        result = await ncmAuth.loginByPhone(String(phone), password);
      } else if (email) {
        result = await ncmAuth.loginByEmail(email, password);
      } else {
        return res.status(400).json({ code: 400, message: '请输入手机号或邮箱' });
      }

      if (result.success) {
        res.json({ code: 200, message: '登录成功', data: { cookieSet: true, status: ncmAuth.getStatus() } });
      } else {
        res.status(400).json({ code: 400, message: result.message || '登录失败' });
      }
    } catch (err) {
      res.status(500).json({ code: 500, message: '登录失败: ' + err.message });
    }
  });

  // POST /api/music-source/auth/cookie - 直接设置 cookie (从浏览器复制)
  router.post('/auth/cookie', corsCookieApi, async (req, res) => {
    const { cookie } = req.body;
    if (!cookie) {
      return res.status(400).json({ code: 400, message: '请输入 cookie 字符串' });
    }
    if (!platformBind.isUsablePlatformCookie('netease', cookie)) {
      return res.status(400).json({ code: 400, message: 'NetEase cookie is missing MUSIC_U. Please copy the logged-in cookie after opening music.163.com.' });
    }
    await ncmAuth.setCookie(cookie);
    await persistCookieBinding(req, 'netease', cookie);
    res.json({ code: 200, message: 'Cookie 已设置', data: { status: ncmAuth.getStatus() } });
  });

  // POST /api/music-source/auth/refresh - 刷新 cookie 有效期
  router.post('/auth/refresh', async (req, res) => {
    const result = await ncmAuth.refreshCookie();
    if (result.success) {
      res.json({ code: 200, message: 'Cookie 已刷新', data: { status: ncmAuth.getStatus() } });
    } else {
      res.status(400).json({ code: 400, message: result.message });
    }
  });

  // DELETE /api/music-source/auth/cookie - 清除 cookie
  router.delete('/auth/cookie', (_req, res) => {
    ncmAuth.clearCookie();
    res.json({ code: 200, message: 'Cookie 已清除', data: { status: ncmAuth.getStatus() } });
  });

  // ── QQ音乐会员认证管理 ──

  // GET /api/music-source/qq-auth/status
  router.get('/qq-auth/status', async (req, res) => {
    const status = await mergeStatusWithBinding(qqmusicAuth.getStatus(), 'qqmusic', req);
    res.json({ code: 200, message: 'success', data: status });
  });

  // POST /api/music-source/qq-auth/cookie - 设置QQ音乐Cookie
  router.post('/qq-auth/cookie', corsCookieApi, async (req, res) => {
    const { cookie } = req.body;
    if (!cookie) {
      return res.status(400).json({ code: 400, message: '请输入QQ音乐 Cookie 字符串' });
    }
    if (!platformBind.isUsablePlatformCookie('qqmusic', cookie)) {
      return res.status(400).json({
        code: 400,
        message: 'QQ Music cookie is missing a logged-in uin and session key. Please copy cookie after logging in at y.qq.com.',
      });
    }
    qqmusicAuth.setCookie(cookie);
    await persistCookieBinding(req, 'qqmusic', cookie);
    res.json({ code: 200, message: 'QQ音乐 Cookie 已设置', data: { status: qqmusicAuth.getStatus() } });
  });

  // DELETE /api/music-source/qq-auth/cookie - 清除QQ音乐Cookie
  router.delete('/qq-auth/cookie', (_req, res) => {
    qqmusicAuth.clearCookie();
    res.json({ code: 200, message: 'QQ音乐 Cookie 已清除', data: { status: qqmusicAuth.getStatus() } });
  });

  // POST /api/music-source/qq-auth/login - QQ号+密码登录 (电脑端免扫码)
  router.post('/qq-auth/login', async (req, res) => {
    try {
      const { uin, password, verifycode, captcha } = req.body;
      if (!uin || !password) {
        return res.status(400).json({ code: 400, message: '请输入QQ号和密码' });
      }

      // 如果是首次请求，先检查是否需要验证码
      if (verifycode === undefined || captcha) {
        const checkResult = await qqmusicAuth.checkLogin(uin);
        if (checkResult.needCaptcha) {
          return res.json({
            code: 200,
            message: 'need_captcha',
            data: {
              needCaptcha: true,
              captchaUrl: checkResult.captchaUrl,
              verifycode: checkResult.verifycode,
            },
          });
        }
        // No captcha needed, proceed with login
        const result = await qqmusicAuth.loginByAccount(uin, password, checkResult.verifycode || verifycode || '');
        if (result.success) {
          await persistCookieBinding(req, 'qqmusic', result.cookie);
          res.json({ code: 200, message: result.message, data: { cookieSet: true, status: qqmusicAuth.getStatus() } });
        } else {
          res.status(400).json({ code: 400, message: result.message });
        }
      } else {
        // Has verifycode from captcha, login directly
        const result = await qqmusicAuth.loginByAccount(uin, password, verifycode, {
          ptVerifysession: captcha || undefined,
        });
        if (result.success) {
          await persistCookieBinding(req, 'qqmusic', result.cookie);
          res.json({ code: 200, message: result.message, data: { cookieSet: true, status: qqmusicAuth.getStatus() } });
        } else {
          res.status(400).json({ code: 400, message: result.message });
        }
      }
    } catch (err) {
      res.status(500).json({ code: 500, message: '登录失败: ' + err.message });
    }
  });

  // POST /api/music-source/qq-auth/validate - 验证Cookie有效性
  router.post('/qq-auth/validate', async (_req, res) => {
    try {
      const valid = await qqmusicAuth.validateCookie();
      res.json({ code: 200, message: valid ? 'Cookie 有效' : 'Cookie 已失效', data: { valid } });
    } catch (err) {
      res.json({ code: 200, message: '验证失败', data: { valid: false } });
    }
  });

  // ── 酷狗音乐会员认证管理 (仅支持Cookie粘贴) ──

  // GET /api/music-source/kg-auth/status
  router.get('/kg-auth/status', async (req, res) => {
    const status = await mergeStatusWithBinding(kugouAuth.getStatus(), 'kugou', req);
    res.json({ code: 200, message: 'success', data: status });
  });

  // POST /api/music-source/kg-auth/cookie - 设置酷狗Cookie
  router.post('/kg-auth/cookie', corsCookieApi, async (req, res) => {
    const { cookie } = req.body;
    if (!cookie) {
      return res.status(400).json({ code: 400, message: '请输入酷狗 Cookie 字符串' });
    }
    kugouAuth.setCookie(cookie);
    await persistCookieBinding(req, 'kugou', cookie);
    res.json({ code: 200, message: '酷狗 Cookie 已设置', data: { status: kugouAuth.getStatus() } });
  });

  // DELETE /api/music-source/kg-auth/cookie - 清除酷狗Cookie
  router.delete('/kg-auth/cookie', (_req, res) => {
    kugouAuth.clearCookie();
    res.json({ code: 200, message: '酷狗 Cookie 已清除', data: { status: kugouAuth.getStatus() } });
  });

  // ── 酷我音乐会员认证管理 (仅支持Cookie粘贴) ──

  // GET /api/music-source/kw-auth/status
  router.get('/kw-auth/status', async (req, res) => {
    const status = await mergeStatusWithBinding(kuwoAuth.getStatus(), 'kuwo', req);
    res.json({ code: 200, message: 'success', data: status });
  });

  // POST /api/music-source/kw-auth/cookie - 设置酷我Cookie
  router.post('/kw-auth/cookie', corsCookieApi, async (req, res) => {
    const { cookie } = req.body;
    if (!cookie) {
      return res.status(400).json({ code: 400, message: '请输入酷我 Cookie 字符串' });
    }
    kuwoAuth.setCookie(cookie);
    await persistCookieBinding(req, 'kuwo', cookie);
    res.json({ code: 200, message: '酷我 Cookie 已设置', data: { status: kuwoAuth.getStatus() } });
  });

  // DELETE /api/music-source/kw-auth/cookie - 清除酷我Cookie
  router.delete('/kw-auth/cookie', (_req, res) => {
    kuwoAuth.clearCookie();
    res.json({ code: 200, message: '酷我 Cookie 已清除', data: { status: kuwoAuth.getStatus() } });
  });
}

module.exports = registerAuthRoutes;
