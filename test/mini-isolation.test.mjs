// 앱인토스 미니앱과 웹 서비스의 분리 테스트.
//
// 둘은 같은 worker.js 를 쓰지만 "완전히 별개 서비스"다 — 계정도 토큰도 서로 통하면 안 된다.
// 웹은 구글 로그인(이메일이 키), 미니앱은 토스 로그인(CI 가 키)이고 세션 subject 로 구분한다.
//
// 위험한 지점은 getEmailFromToken 이다. 이 함수는 자체 세션 토큰이면 subject 를 그대로
// 돌려주는데, 미니앱 세션('mini:<CI>')을 걸러내지 않으면 미니앱 사용자가 웹 유료
// 엔드포인트를 호출할 수 있다. 그러면 웹 원장(payment_requests.user_email)에
// 'mini:...' 행이 생겨 두 서비스의 회계가 섞인다.
//
// 아래 테스트는 그 차단을 계약으로 고정한다. 차단 코드를 지우면 실패한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const {
  createSessionToken, verifySessionToken, getEmailFromToken,
  getMiniCiFromRequest, _parseTossBirthday, _tossFetch,
} = await loadWorker([
  'createSessionToken', 'verifySessionToken', 'getEmailFromToken',
  'getMiniCiFromRequest', '_parseTossBirthday', '_tossFetch',
]);

const ENV = { SESSION_SECRET: 'mini-isolation-test-secret' };
const req = (token) => new Request('https://x/mini/api/me', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

test('미니앱 세션은 웹 인증(getEmailFromToken)을 통과하지 못한다', async () => {
  const token = await createSessionToken('mini:CI-ABC', ENV);
  // 서명 자체는 유효하다 — 그래도 웹 사용자로는 인정하지 않아야 한다.
  assert.equal(await verifySessionToken(token, ENV), 'mini:CI-ABC');
  assert.equal(await getEmailFromToken(token, ENV), null);
});

test('웹 세션은 미니앱 인증(getMiniCiFromRequest)을 통과하지 못한다', async () => {
  const token = await createSessionToken('user@example.com', ENV);
  assert.equal(await getMiniCiFromRequest(req(token), ENV), null);
});

test('각자의 인증 경로로는 정상 통과한다', async () => {
  const web = await createSessionToken('user@example.com', ENV);
  assert.equal(await getEmailFromToken(web, ENV), 'user@example.com');

  const mini = await createSessionToken('mini:CI-ABC', ENV);
  assert.equal(await getMiniCiFromRequest(req(mini), ENV), 'CI-ABC');
});

test('토큰이 없거나 다른 시크릿으로 서명되면 미니앱 인증이 거부된다', async () => {
  assert.equal(await getMiniCiFromRequest(req(null), ENV), null);
  const forged = await createSessionToken('mini:CI-ABC', { SESSION_SECRET: 'other' });
  assert.equal(await getMiniCiFromRequest(req(forged), ENV), null);
});

test("CI 에 콜론이 들어가도 접두사만 벗겨낸다", async () => {
  const token = await createSessionToken('mini:a:b:c', ENV);
  assert.equal(await getMiniCiFromRequest(req(token), ENV), 'a:b:c');
});

test('mini 를 흉내 낸 이메일은 미니앱으로 인정되지 않는다', async () => {
  // 'mini' 로 시작하는 정상 이메일이 접두사 검사에 걸리면 안 된다.
  const token = await createSessionToken('mini@example.com', ENV);
  assert.equal(await getMiniCiFromRequest(req(token), ENV), null);
  assert.equal(await getEmailFromToken(token, ENV), 'mini@example.com');
});

test('토스 생일 표기를 연·월·일로 나눈다', () => {
  assert.deepEqual(_parseTossBirthday('19900515'), { year: 1990, month: 5, day: 15 });
  assert.deepEqual(_parseTossBirthday('1990-05-15'), { year: 1990, month: 5, day: 15 });
  // 값이 없거나 형식이 어긋나면 사주를 잘못 계산하느니 비워 두고 사용자에게 받는다.
  for (const bad of [null, undefined, '', '199005', '19901315', '18991231']) {
    assert.equal(_parseTossBirthday(bad), null, `${bad} 는 거부되어야 한다`);
  }
});

test('mTLS 바인딩이 없으면 조용히 넘어가지 않고 던진다', () => {
  // 일반 fetch 로 폴백하면 인증서 없이 호출해 실패하는데, 그 실패가
  // "로그인 실패"로만 보여 원인을 못 찾게 된다. 바인딩 부재를 명시적으로 알린다.
  assert.throws(() => _tossFetch({}, 'https://x', {}), /TOSS_MTLS/);
  assert.throws(() => _tossFetch({ TOSS_MTLS: {} }, 'https://x', {}), /TOSS_MTLS/);
});
