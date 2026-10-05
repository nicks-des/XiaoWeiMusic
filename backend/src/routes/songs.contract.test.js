const assert = require('assert');

function freshSongsRouter(poolMock) {
  const routePath = require.resolve('./songs');
  const dbPath = require.resolve('../config/db');
  delete require.cache[routePath];
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: poolMock },
  };
  return require('./songs');
}

function freshPlaylistsRouter(poolMock) {
  const routePath = require.resolve('./playlists');
  const dbPath = require.resolve('../config/db');
  delete require.cache[routePath];
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: poolMock },
  };
  return require('./playlists');
}

function freshUsersRouter(poolMock) {
  const routePath = require.resolve('./users');
  const dbPath = require.resolve('../config/db');
  const authPath = require.resolve('../middleware/auth');
  delete require.cache[routePath];
  delete require.cache[dbPath];
  delete require.cache[authPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: poolMock },
  };
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req, _res, next) => {
      req.user = { id: 1 };
      next();
    },
  };
  return require('./users');
}

function routeHandler(router, method, path) {
  const layer = router.stack.find((item) => {
    return item.route?.path === path && item.route.methods[method.toLowerCase()];
  });
  assert(layer, `${method} ${path} route should be registered`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function call(handler, req = {}) {
  const res = {
    statusCode: 200,
    body: undefined,
    redirected: undefined,
    downloaded: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    },
    redirect(code, url) {
      this.redirected = { code, url };
      return this;
    },
    download(filePath, fileName) {
      this.downloaded = { filePath, fileName };
      return this;
    },
  };
  await handler({ params: {}, query: {}, body: {}, user: { id: 1 }, ...req }, res);
  return res;
}

async function testQuickAddCreatesStableOnlineSongId() {
  const queries = [];
  let insertedSong = null;
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT * FROM songs WHERE id')) return [insertedSong ? [insertedSong] : []];
      if (sql.startsWith('SELECT id FROM songs WHERE id')) return [[]];
      if (sql.startsWith('INSERT INTO songs')) {
        insertedSong = {
          id: params[0],
          title: params[1],
          artist: params[2],
          album: params[3],
          duration: params[4],
          genre: params[5],
          audio_url: params[6],
          cover_url: params[7],
          source: params[8],
          netease_id: params[9],
          features: null,
        };
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const router = freshSongsRouter(pool);
  const res = await call(routeHandler(router, 'POST', '/quick-add'), {
    body: {
      title: 'Song A',
      artist: 'Artist A',
      album: 'Album A',
      duration: 188,
      cover_url: 'cover.jpg',
      netease_id: 'wy_12345',
    },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.id, 'wy_12345');
  assert(queries.some((q) => q.sql.startsWith('INSERT INTO songs')));
}

async function testDetailAndUpdateRoutesExistAndReturnSong() {
  const pool = {
    query: async (sql, params) => {
      if (sql.startsWith('SELECT * FROM songs WHERE id')) {
        return [[{
          id: params[0],
          title: 'Old',
          artist: 'Artist',
          album: '',
          duration: 1,
          audio_url: '',
          cover_url: '',
          source: 'netease',
          features: null,
        }]];
      }
      if (sql.startsWith('UPDATE songs SET')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const router = freshSongsRouter(pool);

  const detail = await call(routeHandler(router, 'GET', '/:id'), {
    params: { id: 'wy_12345' },
  });
  assert.strictEqual(detail.statusCode, 200);
  assert.strictEqual(detail.body.data.id, 'wy_12345');

  const updated = await call(routeHandler(router, 'PUT', '/:id'), {
    params: { id: 'wy_12345' },
    body: { lyrics: 'line one', video_url: 'video.mp4' },
  });
  assert.strictEqual(updated.statusCode, 200);
  assert.strictEqual(updated.body.data.id, 'wy_12345');
}

async function testPlaylistAcceptsPrefixedOnlineSongIds() {
  const inserted = [];
  const conn = {
    query: async (sql, params) => {
      if (sql.startsWith('INSERT INTO playlist_songs')) {
        inserted.push(params);
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
  const pool = {
    query: async (sql, params) => {
      if (sql.startsWith('SELECT * FROM playlists')) return [[{ id: params[0], user_id: 1 }]];
      if (sql.startsWith('SELECT * FROM playlist_songs')) return [[]];
      if (sql.startsWith('SELECT MAX(position)')) return [[{ maxPos: 0 }]];
      if (sql.startsWith('INSERT INTO playlist_songs')) {
        inserted.push(params);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    getConnection: async () => conn,
  };
  const router = freshPlaylistsRouter(pool);
  const res = await call(routeHandler(router, 'POST', '/:id/songs'), {
    params: { id: '10' },
    body: { songId: 'wy_12345' },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(inserted[0], ['10', 'wy_12345', 1]);
}

async function testHistoryAutoCreatesMissingOnlineSongRecord() {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT id FROM songs WHERE id')) return [[]];
      if (sql.startsWith('INSERT INTO songs')) return [{ affectedRows: 1 }];
      if (sql.startsWith('INSERT INTO play_history')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const router = freshUsersRouter(pool);
  const res = await call(routeHandler(router, 'POST', '/history/:songId'), {
    params: { songId: 'wy_12345' },
    body: {},
  });

  assert.strictEqual(res.statusCode, 200);
  assert(queries.some((q) => q.sql.startsWith('INSERT INTO songs')));
  assert(queries.some((q) => q.sql.startsWith('INSERT INTO play_history')));
}

async function run() {
  await testQuickAddCreatesStableOnlineSongId();
  await testDetailAndUpdateRoutesExistAndReturnSong();
  await testPlaylistAcceptsPrefixedOnlineSongIds();
  await testHistoryAutoCreatesMissingOnlineSongRecord();
  console.log('songs contract tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
