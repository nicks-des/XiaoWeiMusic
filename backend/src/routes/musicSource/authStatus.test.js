const assert = require('assert');

function freshAuthModule(sharedMock, bindMock) {
  const authPath = require.resolve('./auth');
  const sharedPath = require.resolve('./shared');
  const bindPath = require.resolve('../../utils/platformBind');

  delete require.cache[authPath];
  delete require.cache[sharedPath];
  delete require.cache[bindPath];

  require.cache[sharedPath] = {
    id: sharedPath,
    filename: sharedPath,
    loaded: true,
    exports: sharedMock,
  };
  require.cache[bindPath] = {
    id: bindPath,
    filename: bindPath,
    loaded: true,
    exports: bindMock,
  };

  return require('./auth');
}

function createRouter() {
  const routes = {};
  return {
    routes,
    get(path, ...handlers) {
      routes[`GET ${path}`] = handlers;
    },
    post(path, ...handlers) {
      routes[`POST ${path}`] = handlers;
    },
    delete(path, ...handlers) {
      routes[`DELETE ${path}`] = handlers;
    },
  };
}

async function callHandler(handler, req = {}) {
  let payload;
  const res = {
    json(body) {
      payload = body;
      return body;
    },
    status() {
      return this;
    },
  };
  await handler({ headers: {}, ...req }, res);
  return payload;
}

async function testStatusUsesCurrentUserBindingBeforeGlobalBinding() {
  const calls = [];
  const registerAuthRoutes = freshAuthModule(
    {
      getUserIdFromReq: () => 7,
      corsCookieApi: (_req, _res, next) => next(),
      ncmAuth: { getStatus: () => ({ hasCookie: false, source: 'memory' }) },
      qqmusicAuth: { getStatus: () => ({ hasCookie: false }) },
      kugouAuth: { getStatus: () => ({ hasCookie: false }) },
      kuwoAuth: { getStatus: () => ({ hasCookie: false }) },
    },
    {
      getUserCookie: async (userId, platform) => {
        calls.push(['user', userId, platform]);
        return platform === 'netease' ? 'MUSIC_U=bound-user-cookie' : '';
      },
      getGlobalCookie: async (platform) => {
        calls.push(['global', platform]);
        return 'MUSIC_U=global-cookie';
      },
    }
  );

  const router = createRouter();
  registerAuthRoutes(router);

  const payload = await callHandler(router.routes['GET /auth/status'][0], {
    headers: { authorization: 'Bearer token' },
  });

  assert.deepStrictEqual(calls, [['user', 7, 'netease']]);
  assert.strictEqual(payload.data.hasCookie, true);
  assert.strictEqual(payload.data.source, 'binding');
}

async function testStatusFallsBackToGlobalBindingWhenUserHasNoBinding() {
  const calls = [];
  const registerAuthRoutes = freshAuthModule(
    {
      getUserIdFromReq: () => 7,
      corsCookieApi: (_req, _res, next) => next(),
      ncmAuth: { getStatus: () => ({ hasCookie: false, source: 'memory' }) },
      qqmusicAuth: { getStatus: () => ({ hasCookie: false }) },
      kugouAuth: { getStatus: () => ({ hasCookie: false }) },
      kuwoAuth: { getStatus: () => ({ hasCookie: false }) },
    },
    {
      getUserCookie: async (userId, platform) => {
        calls.push(['user', userId, platform]);
        return '';
      },
      getGlobalCookie: async (platform) => {
        calls.push(['global', platform]);
        return platform === 'netease' ? 'MUSIC_U=global-cookie' : '';
      },
    }
  );

  const router = createRouter();
  registerAuthRoutes(router);

  const payload = await callHandler(router.routes['GET /auth/status'][0]);

  assert.deepStrictEqual(calls, [
    ['user', 7, 'netease'],
    ['global', 'netease'],
  ]);
  assert.strictEqual(payload.data.hasCookie, true);
  assert.strictEqual(payload.data.source, 'binding');
}

async function testAllPlatformStatusesUseBindingFallback() {
  const calls = [];
  const registerAuthRoutes = freshAuthModule(
    {
      getUserIdFromReq: () => null,
      corsCookieApi: (_req, _res, next) => next(),
      ncmAuth: { getStatus: () => ({ hasCookie: false, source: 'memory' }) },
      qqmusicAuth: { getStatus: () => ({ hasCookie: false }) },
      kugouAuth: { getStatus: () => ({ hasCookie: false }) },
      kuwoAuth: { getStatus: () => ({ hasCookie: false }) },
    },
    {
      getUserCookie: async () => '',
      getGlobalCookie: async (platform) => {
        calls.push(platform);
        return `${platform}=cookie`;
      },
    }
  );

  const router = createRouter();
  registerAuthRoutes(router);

  const routes = [
    ['GET /auth/status', 'netease'],
    ['GET /qq-auth/status', 'qqmusic'],
    ['GET /kg-auth/status', 'kugou'],
    ['GET /kw-auth/status', 'kuwo'],
  ];

  for (const [routeKey] of routes) {
    const payload = await callHandler(router.routes[routeKey][0]);
    assert.strictEqual(payload.data.hasCookie, true, `${routeKey} should report bound cookie`);
    assert.strictEqual(payload.data.source, 'binding', `${routeKey} should mark binding source`);
  }

  assert.deepStrictEqual(calls, routes.map(([, platform]) => platform));
}

async function run() {
  await testStatusUsesCurrentUserBindingBeforeGlobalBinding();
  await testStatusFallsBackToGlobalBindingWhenUserHasNoBinding();
  await testAllPlatformStatusesUseBindingFallback();
  console.log('authStatus tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
