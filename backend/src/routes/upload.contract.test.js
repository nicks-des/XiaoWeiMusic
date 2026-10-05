const assert = require('assert');

function freshApp(poolMock) {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
  process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';

  const appPath = require.resolve('../../app');
  const dbPath = require.resolve('../config/db');
  delete require.cache[appPath];
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: poolMock },
  };
  return require('../../app');
}

function uploadHandler(app) {
  const layer = app._router.stack.find((item) => item.route?.path === '/api/songs/upload');
  assert(layer, 'POST /api/songs/upload route should be registered');
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

async function call(handler, req = {}) {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    },
  };
  await handler({ files: [], body: {}, ...req }, res);
  return res;
}

async function testUploadUsesMetadataFromMetaField() {
  const inserts = [];
  const pool = {
    query: async (sql, params) => {
      if (sql.includes('MAX(CAST(id AS UNSIGNED))')) return [[{ max_id: 40 }]];
      if (sql.startsWith('INSERT INTO songs')) {
        inserts.push(params);
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
  const app = freshApp(pool);
  const handler = uploadHandler(app);
  const res = await call(handler, {
    files: [{
      originalname: Buffer.from('fallback.mp3', 'utf8').toString('latin1'),
      filename: 'stored.mp3',
    }],
    body: {
      meta: JSON.stringify([{
        title: 'Meta Title',
        artist: 'Meta Artist',
        album: 'Meta Album',
        duration: 233,
        genre: 'Meta Genre',
        cover_url: 'https://example.test/cover.jpg',
      }]),
    },
  });

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(inserts.length, 1);
  assert.strictEqual(inserts[0][1], 'Meta Title');
  assert.strictEqual(inserts[0][2], 'Meta Artist');
  assert.strictEqual(inserts[0][3], 'Meta Album');
  assert.strictEqual(inserts[0][4], 233);
  assert.strictEqual(inserts[0][5], 'Meta Genre');
  assert.strictEqual(inserts[0][7], 'https://example.test/cover.jpg');
  assert.strictEqual(res.body.data[0].title, 'Meta Title');
}

async function run() {
  await testUploadUsesMetadataFromMetaField();
  console.log('upload contract tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
