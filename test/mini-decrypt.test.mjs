// 토스 개인정보 복호화 테스트.
//
// 토스는 이름·생년월일·성별·CI 를 평문이 아니라 AES-256-GCM 암호문으로 내려준다.
// 규격: base64 디코드하면 [IV 12바이트][암호문][인증태그 16바이트],
// 키는 base64, AAD 는 키와 함께 이메일로 받는다.
//
// 이 테스트는 규격대로 만든 암호문을 실제로 풀어보는 것으로 구현을 고정한다.
// 규격을 글로만 옮겨 적으면 IV 길이나 태그 위치를 한 칸 틀려도 알 수가 없다.
//
// 특히 중요한 건 실패했을 때의 동작이다 — 키가 없거나 틀렸을 때 예외로 터지면
// 로그인 전체가 죽는다. 그 경우엔 조용히 null 이 되어 사용자가 직접 입력하는
// 흐름으로 넘어가야 한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { tossDecrypt, _parseTossBirthday } = await loadWorker(['tossDecrypt', '_parseTossBirthday']);

const AAD = 'myan-test-aad';
const KEY_BYTES = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);   // 고정 키(재현 가능하게)
const KEY_B64 = Buffer.from(KEY_BYTES).toString('base64');

/** 토스가 보내는 형식 그대로 암호문을 만든다: base64(IV ‖ 암호문 ‖ 태그) */
async function encrypt(plaintext, { key = KEY_BYTES, aad = AAD, iv } = {}) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const nonce = iv ?? crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(aad), tagLength: 128 },
    k, new TextEncoder().encode(plaintext),
  );
  return Buffer.concat([Buffer.from(nonce), Buffer.from(body)]).toString('base64');
}

const ENV = { TOSS_DECRYPT_KEY: KEY_B64, TOSS_DECRYPT_AAD: AAD };

test('규격대로 만든 암호문을 푼다', async () => {
  for (const plain of ['19900515', '안태현', 'MALE', 'CI-0123456789abcdef']) {
    assert.equal(await tossDecrypt(ENV, await encrypt(plain)), plain, `${plain} 복호화 실패`);
  }
});

test('푼 생년월일이 사주 계산에 바로 들어간다', async () => {
  // 복호화만 되고 파싱에서 걸리면 결국 입력 칸이 또 뜬다. 끝까지 이어지는지 본다.
  const plain = await tossDecrypt(ENV, await encrypt('19900515'));
  assert.deepEqual(_parseTossBirthday(plain), { year: 1990, month: 5, day: 15 });
});

test('키가 등록 안 됐으면 터지지 않고 null 이다', async () => {
  // 이때는 사용자가 직접 입력하는 흐름으로 가야 한다. 예외가 나면 로그인이 통째로 죽는다.
  const cipher = await encrypt('19900515');
  for (const env of [{}, { TOSS_DECRYPT_AAD: AAD }, { TOSS_DECRYPT_KEY: '' }]) {
    assert.equal(await tossDecrypt(env, cipher), null);
  }
});

test('키나 AAD 가 틀리면 null 이다 (엉뚱한 평문을 내지 않는다)', async () => {
  const wrongKey = new Uint8Array(32).map((_, i) => (i * 11 + 1) & 0xff);
  assert.equal(await tossDecrypt(ENV, await encrypt('19900515', { key: wrongKey })), null);
  assert.equal(await tossDecrypt(ENV, await encrypt('19900515', { aad: 'other-aad' })), null);
});

test('암호문이 망가졌거나 너무 짧아도 null 이다', async () => {
  const good = await encrypt('19900515');
  const bad = [
    null, undefined, '', 'not-base64!!!',
    Buffer.from(new Uint8Array(10)).toString('base64'),        // IV 도 안 되는 길이
    Buffer.from(new Uint8Array(27)).toString('base64'),        // IV+태그 경계 바로 아래
    good.slice(0, -4),                                          // 뒷부분이 잘림
  ];
  for (const v of bad) {
    assert.equal(await tossDecrypt(ENV, v), null, `${String(v).slice(0, 20)} 는 null 이어야 한다`);
  }
});

test('키를 교체하면 새 키로 푼다 (캐시가 옛 키를 붙들지 않는다)', async () => {
  // importKey 결과를 캐시하는데, 캐시를 키 값에 묶어두지 않으면 시크릿을 바꿔도
  // 옛 키를 계속 써서 "키를 갈았는데 복호화가 안 되는" 상태가 된다.
  const key2 = new Uint8Array(32).map((_, i) => (i * 13 + 5) & 0xff);
  const env2 = { TOSS_DECRYPT_KEY: Buffer.from(key2).toString('base64'), TOSS_DECRYPT_AAD: AAD };

  const c1 = await encrypt('19900515');
  const c2 = await encrypt('20001231', { key: key2 });

  assert.equal(await tossDecrypt(ENV, c1), '19900515');
  assert.equal(await tossDecrypt(env2, c2), '20001231');
  assert.equal(await tossDecrypt(ENV, c1), '19900515', '되돌아왔을 때도 맞아야 한다');
});

test('IV 는 매번 달라도 같은 평문이 나온다', async () => {
  // IV 를 고정 위치에서 제대로 읽고 있는지 확인한다.
  const a = await encrypt('19900515');
  const b = await encrypt('19900515');
  assert.notEqual(a, b, '준비 상태가 잘못됐다 — IV 가 같다');
  assert.equal(await tossDecrypt(ENV, a), '19900515');
  assert.equal(await tossDecrypt(ENV, b), '19900515');
});
