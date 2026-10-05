/**
 * 平台扫码登录 & 账号绑定管理
 * 端点:
 *   GET  /api/platform-login/platforms            - 平台列表
 *   POST /api/platform-login/:platform/qrcode     - 生成二维码
 *   GET  /api/platform-login/:platform/qrcode/status - 检查扫码状态
 *   POST /api/platform-login/:platform/bind       - 绑定到当前用户
 *   GET  /api/platform-login/me/bindings          - 当前用户的所有绑定
 *   DELETE /api/platform-login/:platform/unbind  - 解绑
 *   POST /api/platform-login/:platform/refresh   - 刷新有效期
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const platformLogin = require('../utils/platformLogin');
const platformBind = require('../utils/platformBind');

const VALID_PLATFORMS = ['netease', 'qqmusic', 'kugou', 'kuwo'];

function checkPlatform(req, res, next) {
  const platform = req.params.platform;
  if (!VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({ code: 400, message: '不支持的平台: ' + platform });
  }
  next();
}

// GET /api/platform-login/platforms
router.get('/platforms', (req, res) => {
  res.json({
    code: 200,
    message: 'success',
    data: platformLogin.listPlatforms().concat([{ key: '__placeholder', label: '' }]).filter(p => p.label),
  });
});

// POST /api/platform-login/:platform/qrcode
router.post('/:platform/qrcode', checkPlatform, async (req, res) => {
  try {
    const platform = req.params.platform;
    const fn = platformLogin.PLATFORMS[platform].generate;
    const result = await fn();
    res.json(result);
  } catch (err) {
    console.error(`[PlatformLogin] ${req.params.platform} qrcode error:`, err.message);
    res.status(500).json({ code: 500, message: '生成二维码失败: ' + err.message });
  }
});

// GET /api/platform-login/:platform/qrcode/status
router.get('/:platform/qrcode/status', checkPlatform, async (req, res) => {
  try {
    const platform = req.params.platform;
    const fn = platformLogin.PLATFORMS[platform].check;
    const result = await fn();
    res.json(result);
  } catch (err) {
    res.status(500).json({ code: 500, message: '检查状态失败: ' + err.message });
  }
});

// POST /api/platform-login/:platform/bind
router.post('/:platform/bind', auth, checkPlatform, async (req, res) => {
  try {
    const platform = req.params.platform;
    const userId = req.user.id;

    // 获取 cookie
    const checker = platformLogin.PLATFORMS[platform];
    const checkResult = await checker.check();
    if (checkResult?.data?.status !== 'success') {
      return res.status(400).json({
        code: 400,
        message: '扫码未成功，请重新扫码',
      });
    }

    const cookie = checker.extractCookie(checkResult);
    if (!cookie) {
      return res.status(400).json({
        code: 400,
        message: '未获取到平台凭证，请重试扫码',
      });
    }
    if (!platformBind.isUsablePlatformCookie(platform, cookie)) {
      return res.status(400).json({
        code: 400,
        message: `${checker.label} 扫码登录未获取到有效凭证（可能触发了安全验证），请重新扫码或使用 Cookie 粘贴方式登录`,
      });
    }

    // 获取用户信息
    let profile = { platform_uid: null, platform_nickname: '已绑定用户' };
    try {
      profile = await checker.getProfile(cookie);
    } catch (e) {
      console.warn(`[PlatformLogin] getProfile(${platform}) warn:`, e.message);
    }

    await platformBind.saveBinding(userId, platform, {
      cookie,
      platform_uid: profile.platform_uid,
      platform_nickname: profile.platform_nickname,
      platform_avatar: profile.platform_avatar,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天默认
    });

    // Ensure in-memory auth is also set for APIs that don't have a userId (e.g. audio proxy)
    if (platform === 'netease') {
      const ncmAuth = require('../utils/ncmAuth');
      ncmAuth.setCookie(cookie);
    }
    if (platform === 'qqmusic') {
      const qqmusicAuth = require('../utils/qqmusicAuth');
      qqmusicAuth.setCookie(cookie);
    }

    res.json({
      code: 200,
      message: `${checker.label} 绑定成功`,
      data: {
        platform,
        platform_nickname: profile.platform_nickname,
        platform_avatar: profile.platform_avatar,
        platform_uid: profile.platform_uid,
      },
    });
  } catch (err) {
    console.error(`[PlatformLogin] bind error:`, err);
    res.status(500).json({ code: 500, message: '绑定失败: ' + err.message });
  }
});

// GET /api/platform-login/me/bindings
router.get('/me/bindings', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const bindings = await platformBind.listBindings(userId);
    res.json({ code: 200, message: 'success', data: bindings });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取绑定列表失败' });
  }
});

// DELETE /api/platform-login/:platform/unbind
router.delete('/:platform/unbind', auth, checkPlatform, async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = req.params.platform;
    await platformBind.removeBinding(userId, platform);
    res.json({ code: 200, message: '已解绑' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '解绑失败: ' + err.message });
  }
});

// POST /api/platform-login/:platform/refresh
router.post('/:platform/refresh', auth, checkPlatform, async (req, res) => {
  try {
    const userId = req.user.id;
    const platform = req.params.platform;
    // 续期: 把 expires_at 延后 30 天
    await require('../config/db').pool.query(
      'UPDATE user_platforms SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE user_id = ? AND platform = ?',
      [userId, platform]
    );
    res.json({ code: 200, message: '已续期' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '续期失败' });
  }
});

module.exports = router;
