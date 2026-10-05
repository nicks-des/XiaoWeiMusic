const assert = require('assert');

function createRouter() {
  const routes = {};
  return {
    routes,
    get(path, ...handlers) { routes[`GET ${path}`] = handlers; },
    post(path, ...handlers) { routes[`POST ${path}`] = handlers; },
    delete(path, ...handlers) { routes[`DELETE ${path}`] = handlers; },
  };
}

function freshPlatformLoginRoute({ cookie, checkStatus = 'success' }) {
  const routePath = require.resolve('./platformLogin');
  const expressPath = require.resolve('express');
  const authPath = require.resolve('../middleware/auth');
  const loginPath = require.resolve('../utils/platformLogin');
  const bindPath = require.resolve('../utils/platformBind');

  delete require.cache[routePath];
  delete require.cache[expressPath];
  delete require.cache[authPath];
  delete require.cache[loginPath];
  delete require.cache[bindPath];

  const router = createRouter();
  const saves = [];

  require.cache[expressPath] = {
    id: expressPath,
    filename: expressPath,
    loaded: true,
    exports: { Router: () => router },
  };
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req, _res, next) => {
      req.user = { id: 9 };
      next();
    },
  };
  require.cache[loginPath] = {
    id: loginPath,
    filename: loginPath,
    loaded: true,
    exports: {
      listPlatforms: () => [{ key: 'qqmusic', label: 'QQ Music' }],
      PLATFORMS: {
        qqmusic: {
          label: 'QQ Music',
          check: async () => ({ code: 200, data: { status: checkStatus } }),
          extractCookie: () => cookie,
          getProfile: async () => ({ platform_uid: '123456', platform_nickname: 'QQ User' }),
        },
      },
    },
  };
  require.cache[bindPath] = {
    id: bindPath,
    filename: bindPath,
    loaded: true,
    exports: {
      isUsablePlatformCookie: (platform, value) => (
        platform !== 'qqmusic' || /(?:^|;\s*)uin=o?\d+/i.test(value || '')
      ),
      saveBinding: async (userId, platform, data) => saves.push([userId, platform, data.cookie]),
      listBindings: async () => [],
      removeBinding: async () => {},
    },
  };

  require('./platformLogin');
  return { router, saves };
}

async function callHandlers(handlers, req = {}) {
  let idx = 0;
  let payload;
  let statusCode = 200;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return body; },
  };
  const next = async () => {
    const handler = handlers[idx++];
    if (handler) await handler(req, res, next);
  };
  await next();
  return { statusCode, payload };
}

async function run() {
  {
    const { router, saves } = freshPlatformLoginRoute({ cookie: 'pgv_pvid=visitor-only' });
    const result = await callHandlers(router.routes['POST /:platform/bind'], {
      params: { platform: 'qqmusic' },
    });

    assert.strictEqual(result.statusCode, 400);
    assert.match(result.payload.message, /凭证|cookie|Cookie|登录/);
    assert.deepStrictEqual(saves, []);
  }

  {
    const { router, saves } = freshPlatformLoginRoute({ cookie: 'uin=o00123456; skey=member-session' });
    const result = await callHandlers(router.routes['POST /:platform/bind'], {
      params: { platform: 'qqmusic' },
    });

    assert.strictEqual(result.statusCode, 200);
    assert.deepStrictEqual(saves, [[9, 'qqmusic', 'uin=o00123456; skey=member-session']]);
  }

  console.log('platformLogin bind tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
