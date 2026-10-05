const assert = require('assert');

const {
  parsePtuiCallback,
  mapPtuiCodeToQrStatus,
  extractUin,
  getCookieValueFromSetCookieHeaders,
} = require('./qqmusicAuth');

function run() {
  const success = parsePtuiCallback("ptuiCB('0','0','https://graph.qq.com/callback','0','登录成功！','nickname');");
  assert.strictEqual(success.code, 0, 'ptui code 0 should be parsed as numeric success code');
  assert.strictEqual(success.redirectUrl, 'https://graph.qq.com/callback', 'success redirect URL should be extracted');
  assert.strictEqual(mapPtuiCodeToQrStatus(0), 'success', 'ptui code 0 is login success');
  assert.strictEqual(mapPtuiCodeToQrStatus(66), 'waiting', 'ptui code 66 is still waiting');
  assert.strictEqual(mapPtuiCodeToQrStatus(67), 'scanned', 'ptui code 67 is scanned/confirming');
  assert.strictEqual(mapPtuiCodeToQrStatus(65), 'expired', 'ptui code 65 is expired');
  assert.strictEqual(extractUin('uin=o00123456; skey=abc'), '123456', 'extractUin should support explicit cookie strings');
  assert.strictEqual(
    getCookieValueFromSetCookieHeaders([
      'pt_user_id=6143931354220724436; Path=/; Domain=.qq.com',
      'pt_login_sig=login-sig-value; Path=/; Domain=.qq.com; Secure',
    ], 'pt_login_sig'),
    'login-sig-value',
    'xlogin pt_login_sig should be extracted from Set-Cookie headers'
  );
}

run();
console.log('qqmusicAuth tests passed');
