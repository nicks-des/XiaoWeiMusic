const assert = require('assert');

function freshPlatformBind(poolMock) {
  const bindPath = require.resolve('./platformBind');
  const dbPath = require.resolve('../config/db');
  delete require.cache[bindPath];
  delete require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: poolMock },
  };
  return require('./platformBind');
}

async function run() {
  const invalidNeteaseCookie = 'NMTID=visitor-session-only';
  const validNeteaseCookie = 'MUSIC_U=member-session; __csrf=token';
  const invalidQqCookie = 'pgv_pvid=visitor-only; ts_uid=anon';
  const validQqCookie = 'uin=o00123456; skey=member-session';

  let nextRows = [[{ cookie: invalidNeteaseCookie, expires_at: null }]];
  const bind = freshPlatformBind({
    query: async () => nextRows,
  });

  assert.strictEqual(await bind.getGlobalCookie('netease'), '');
  assert.strictEqual(await bind.getUserCookie(1, 'netease'), '');
  assert.strictEqual(bind.isUsablePlatformCookie('qqmusic', invalidQqCookie), false);
  assert.strictEqual(bind.isUsablePlatformCookie('qqmusic', validQqCookie), true);

  nextRows = [[{ cookie: validNeteaseCookie, expires_at: null }]];
  assert.strictEqual(await bind.getGlobalCookie('netease'), validNeteaseCookie);
  assert.strictEqual(await bind.getUserCookie(1, 'netease'), validNeteaseCookie);

  nextRows = [[
    {
      platform: 'netease',
      cookie: invalidNeteaseCookie,
      platform_uid: null,
      platform_nickname: 'Visitor Netease',
      platform_avatar: '',
      bound_at: null,
      expires_at: null,
    },
    {
      platform: 'qqmusic',
      cookie: invalidQqCookie,
      platform_uid: null,
      platform_nickname: 'Visitor QQ',
      platform_avatar: '',
      bound_at: null,
      expires_at: null,
    },
    {
      platform: 'qqmusic',
      cookie: validQqCookie,
      platform_uid: '123456',
      platform_nickname: 'Member QQ',
      platform_avatar: '',
      bound_at: null,
      expires_at: null,
    },
  ]];
  const bindings = await bind.listBindings(1);
  assert.deepStrictEqual(bindings.map((b) => b.platform_nickname), ['Member QQ']);

  console.log('platform bind cookie tests passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
