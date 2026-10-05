const assert = require('assert');

function freshSearchModule({ kugouMock, sharedMock }) {
  const searchPath = require.resolve('./search');
  const kugouPath = require.resolve('../platforms/kugou');
  const qqPath = require.resolve('../platforms/qqmusic');
  const kuwoPath = require.resolve('../platforms/kuwo');
  const sharedPath = require.resolve('./shared');
  const neteasePath = require.resolve('./neteaseUrl');
  const ncmPath = require.resolve('NeteaseCloudMusicApi');

  for (const p of [searchPath, kugouPath, qqPath, kuwoPath, sharedPath, neteasePath, ncmPath]) {
    delete require.cache[p];
  }

  require.cache[kugouPath] = {
    id: kugouPath,
    filename: kugouPath,
    loaded: true,
    exports: kugouMock,
  };
  require.cache[qqPath] = {
    id: qqPath,
    filename: qqPath,
    loaded: true,
    exports: { search: async () => ({ songs: [], total: 0 }), getSongUrl: async () => ({ url: '' }) },
  };
  require.cache[kuwoPath] = {
    id: kuwoPath,
    filename: kuwoPath,
    loaded: true,
    exports: { search: async () => ({ songs: [], total: 0 }), getSongUrl: async () => ({ url: '' }) },
  };
  require.cache[sharedPath] = {
    id: sharedPath,
    filename: sharedPath,
    loaded: true,
    exports: sharedMock,
  };
  require.cache[neteasePath] = {
    id: neteasePath,
    filename: neteasePath,
    loaded: true,
    exports: { fetchNeteaseUrl: async () => null },
  };
  require.cache[ncmPath] = {
    id: ncmPath,
    filename: ncmPath,
    loaded: true,
    exports: {
      search: async () => ({ status: 200, body: { result: { songs: [], songCount: 0 } } }),
      song_detail: async () => ({ status: 200, body: { songs: [] } }),
      mv_url: async () => ({ status: 200, body: { data: {} } }),
    },
  };

  return require('./search');
}

function createRouter() {
  const routes = {};
  return {
    routes,
    get(path, handler) {
      routes[`GET ${path}`] = handler;
    },
  };
}

async function call(handler, req = {}) {
  let statusCode = 200;
  let body;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return payload;
    },
  };
  await handler({ query: {}, params: {}, headers: {}, ...req }, res);
  return { statusCode, body };
}

async function run() {
  const calls = [];
  const sharedMock = {
    getUserIdFromReq: () => null,
    getPlatformCookie: async () => '',
    urlCache: new Map(),
    URL_CACHE_TTL: 30000,
    songMetaCache: new Map(),
    parsePlatformId: (id) => {
      const match = String(id).match(/^(kg)_(.+)$/);
      return match ? { platform: match[1], rawId: match[2] } : null;
    },
    PLATFORM_MAP: { kg: 'kugou' },
    mapSearchSong: () => ({}),
    ncmAuth: { getCookie: () => '' },
  };

  const registerSearchRoutes = freshSearchModule({
    sharedMock,
    kugouMock: {
      search: async () => ({
        songs: [{
          id: 'kg_hash-one',
          title: 'Needs album audio id',
          source: 'kugou',
          _albumAudioId: 9988,
        }],
        total: 1,
      }),
      getSongUrl: async (...args) => {
        calls.push(args);
        return { url: 'https://audio.example/kugou.mp3' };
      },
    },
  });

  const router = createRouter();
  registerSearchRoutes(router);

  await call(router.routes['GET /search'], {
    query: { keyword: 'test', platform: 'kugou', page: '1', limit: '1' },
  });
  const getUrl = await call(router.routes['GET /get-url/:id'], {
    params: { id: 'kg_hash-one' },
  });

  assert.strictEqual(getUrl.statusCode, 200);
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], ['hash-one', '', 9988]);
  console.log('kugou album_audio_id test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
