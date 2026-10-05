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
    get(path, ...handlers) { routes[`GET ${path}`] = handlers; },
    post(path, ...handlers) { routes[`POST ${path}`] = handlers; },
    delete(path, ...handlers) { routes[`DELETE ${path}`] = handlers; },
  };
}

async function callHandlers(handlers, req = {}) {
  let idx = 0;
  let payload;
  let statusCode = 200;
  const res = {
    header() { return this; },
    sendStatus(code) { statusCode = code; return this; },
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
  const saves = [];
  const setCookies = [];
  const authObj = (name) => ({
    getStatus: () => ({ hasCookie: false }),
    setCookie: (cookie) => setCookies.push([name, cookie]),
    clearCookie: () => {},
    validateCookie: async () => true,
  });

  const registerAuthRoutes = freshAuthModule(
    {
      getUserIdFromReq: () => 42,
      corsCookieApi: (_req, _res, next) => next(),
      ncmAuth: authObj('netease'),
      qqmusicAuth: authObj('qqmusic'),
      kugouAuth: authObj('kugou'),
      kuwoAuth: authObj('kuwo'),
    },
    {
      getUserCookie: async () => '',
      getGlobalCookie: async () => '',
      isUsablePlatformCookie: (platform, cookie) => {
        if (platform === 'netease') return /MUSIC_U=/.test(cookie);
        if (platform === 'qqmusic') return /(?:^|;\s*)uin=o?\d+/i.test(cookie || '');
        return true;
      },
      saveBinding: async (userId, platform, data) => saves.push([userId, platform, data.cookie]),
    }
  );

  const router = createRouter();
  registerAuthRoutes(router);

  const invalidNetease = await callHandlers(router.routes['POST /auth/cookie'], {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: { cookie: 'NMTID=visitor-only' },
  });
  assert.strictEqual(invalidNetease.statusCode, 400);

  const invalidQq = await callHandlers(router.routes['POST /qq-auth/cookie'], {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: { cookie: 'pgv_pvid=visitor-only' },
  });
  assert.strictEqual(invalidQq.statusCode, 400);

  await callHandlers(router.routes['POST /qq-auth/cookie'], {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: { cookie: 'uin=o123; skey=abc;' },
  });
  await callHandlers(router.routes['POST /kg-auth/cookie'], {
    method: 'POST',
    headers: { authorization: 'Bearer token' },
    body: { cookie: 'KuGoo=vip;' },
  });

  assert.deepStrictEqual(setCookies, [
    ['qqmusic', 'uin=o123; skey=abc;'],
    ['kugou', 'KuGoo=vip;'],
  ]);
  assert.deepStrictEqual(saves, [
    [42, 'qqmusic', 'uin=o123; skey=abc;'],
    [42, 'kugou', 'KuGoo=vip;'],
  ]);
  console.log('auth cookie persist test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
