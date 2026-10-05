const assert = require('assert');

const {
  chooseNeteaseUrlData,
  shouldUseCachedUrl,
} = require('./neteaseUrl');

function run() {
  assert.strictEqual(
    chooseNeteaseUrlData([
      { url: 'https://example.com/preview.mp3', freeTrialInfo: { start: 0, end: 45 } },
    ]),
    null,
    'preview URLs must not be selected as playable full-song URLs'
  );

  assert.deepStrictEqual(
    chooseNeteaseUrlData([
      { url: 'https://example.com/full.mp3', freeTrialInfo: null, level: 'higher' },
    ]),
    { url: 'https://example.com/full.mp3', freeTrialInfo: null, level: 'higher' },
    'full URLs should be selected'
  );

  assert.deepStrictEqual(
    chooseNeteaseUrlData([
      {
        url: 'https://example.com/full-with-privilege.mp3',
        freeTrialPrivilege: { resConsumable: false },
        level: 'standard',
      },
    ]),
    {
      url: 'https://example.com/full-with-privilege.mp3',
      freeTrialPrivilege: { resConsumable: false },
      level: 'standard',
    },
    'freeTrialPrivilege alone must not make a URL unplayable'
  );

  assert.strictEqual(
    shouldUseCachedUrl({ url: 'cached-preview', hasCookie: false, expires: Date.now() + 1000 }, true),
    false,
    'member playback must not reuse a URL fetched without cookies'
  );

  assert.strictEqual(
    shouldUseCachedUrl({ url: 'cached-member', hasCookie: true, expires: Date.now() + 1000 }, true),
    true,
    'member playback can reuse a URL fetched with cookies'
  );
}

run();
console.log('neteaseUrl tests passed');
