// 앱인토스 미니앱과 웹 서비스의 분리 테스트.
//
// 둘은 같은 worker.js 를 쓰지만 "완전히 별개 서비스"다 — 계정도 토큰도 서로 통하면 안 된다.
// 웹은 구글 로그인(이메일이 키), 미니앱은 토스 로그인(userKey 가 키)이고 세션 subject 로 구분한다.
//
// 위험한 지점은 getEmailFromToken 이다. 이 함수는 자체 세션 토큰이면 subject 를 그대로
// 돌려주는데, 미니앱 세션('mini:<userKey>')을 걸러내지 않으면 미니앱 사용자가 웹 유료
// 엔드포인트를 호출할 수 있다. 그러면 웹 원장(payment_requests.user_email)에
// 'mini:...' 행이 생겨 두 서비스의 회계가 섞인다.
//
// 아래 테스트는 그 차단을 계약으로 고정한다. 차단 코드를 지우면 실패한다.
//
// 연결 끊기(unlink) 콜백도 여기서 함께 지킨다. 인증이 뚫리면 userKey 만 아는 누구나
// 남의 계정 정보를 지울 수 있어서, 시크릿 미설정 시 "전부 거부"가 기본값이어야 한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const {
  createSessionToken, verifySessionToken, getEmailFromToken,
  getMiniUserKeyFromRequest, _parseTossBirthday, _tossFetch,
  handleMiniUnlink, _timingSafeEqual, _normalizeGender,
} = await loadWorker([
  'createSessionToken', 'verifySessionToken', 'getEmailFromToken',
  'getMiniUserKeyFromRequest', '_parseTossBirthday', '_tossFetch',
  'handleMiniUnlink', '_timingSafeEqual', '_normalizeGender',
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

test('웹 세션은 미니앱 인증(getMiniUserKeyFromRequest)을 통과하지 못한다', async () => {
  const token = await createSessionToken('user@example.com', ENV);
  assert.equal(await getMiniUserKeyFromRequest(req(token), ENV), null);
});

test('각자의 인증 경로로는 정상 통과한다', async () => {
  const web = await createSessionToken('user@example.com', ENV);
  assert.equal(await getEmailFromToken(web, ENV), 'user@example.com');

  const mini = await createSessionToken('mini:CI-ABC', ENV);
  assert.equal(await getMiniUserKeyFromRequest(req(mini), ENV), 'CI-ABC');
});

test('토큰이 없거나 다른 시크릿으로 서명되면 미니앱 인증이 거부된다', async () => {
  assert.equal(await getMiniUserKeyFromRequest(req(null), ENV), null);
  const forged = await createSessionToken('mini:CI-ABC', { SESSION_SECRET: 'other' });
  assert.equal(await getMiniUserKeyFromRequest(req(forged), ENV), null);
});

test("userKey 에 콜론이 들어가도 접두사만 벗겨낸다", async () => {
  const token = await createSessionToken('mini:a:b:c', ENV);
  assert.equal(await getMiniUserKeyFromRequest(req(token), ENV), 'a:b:c');
});

test('mini 를 흉내 낸 이메일은 미니앱으로 인정되지 않는다', async () => {
  // 'mini' 로 시작하는 정상 이메일이 접두사 검사에 걸리면 안 된다.
  const token = await createSessionToken('mini@example.com', ENV);
  assert.equal(await getMiniUserKeyFromRequest(req(token), ENV), null);
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

// ── 연결 끊기 콜백 ──

const AUTH = 'Basic dG9zcy11bmxpbms6c2VjcmV0';

/** UPDATE 로 넘어온 바인딩을 기록하는 최소 D1 스텁. */
function unlinkEnv(extra = {}) {
  const calls = [];
  return {
    env: {
      TOSS_UNLINK_AUTH: AUTH,
      DB: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => { calls.push({ sql, args }); return {}; } }) }) },
      ...extra,
    },
    calls,
  };
}

const unlinkReq = (url, auth, body) => new Request(url, {
  method: body ? 'POST' : 'GET',
  headers: {
    ...(auth ? { Authorization: auth } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test('연결 끊기: Basic Auth 가 맞으면 해당 userKey 의 개인정보를 지운다', async () => {
  const { env, calls } = unlinkEnv();
  const res = await handleMiniUnlink(
    unlinkReq('https://x/mini/api/auth/unlink?userKey=UK-1&referrer=UNLINK', AUTH), env);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE mini_users/);
  assert.deepEqual(calls[0].args, ['UK-1']);
  // 결제 원장은 건드리지 않는다(거래기록 보관 의무).
  assert.doesNotMatch(calls[0].sql, /mini_payment_requests/);
});

test('연결 끊기: POST JSON 으로 와도 동일하게 처리한다', async () => {
  const { env, calls } = unlinkEnv();
  const res = await handleMiniUnlink(
    unlinkReq('https://x/mini/api/auth/unlink', AUTH, { userKey: 'UK-2', referrer: 'WITHDRAWAL_TOSS' }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(calls[0].args, ['UK-2']);
});

test('연결 끊기: 인증 헤더가 없거나 틀리면 401 이고 DB 를 건드리지 않는다', async () => {
  for (const bad of [null, 'Basic wrong', AUTH.slice(0, -1), AUTH + 'x']) {
    const { env, calls } = unlinkEnv();
    const res = await handleMiniUnlink(
      unlinkReq('https://x/mini/api/auth/unlink?userKey=UK-1', bad), env);
    assert.equal(res.status, 401, `${bad} 는 거부되어야 한다`);
    assert.equal(calls.length, 0, `${bad} 인데 DB 를 건드렸다`);
  }
});

test('연결 끊기: 시크릿이 설정 안 됐으면 열어두지 않고 전부 거부한다', async () => {
  // 폴백으로 통과시키면 userKey 만 아는 누구나 남의 계정을 지울 수 있다.
  for (const missing of [undefined, '', null]) {
    const { env, calls } = unlinkEnv({ TOSS_UNLINK_AUTH: missing });
    const res = await handleMiniUnlink(
      unlinkReq('https://x/mini/api/auth/unlink?userKey=UK-1', AUTH), env);
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
  }
});

test('연결 끊기: userKey 가 없으면 400', async () => {
  const { env, calls } = unlinkEnv();
  const res = await handleMiniUnlink(unlinkReq('https://x/mini/api/auth/unlink', AUTH), env);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('상수 시간 비교가 길이·내용 차이를 모두 잡는다', () => {
  assert.equal(_timingSafeEqual('abc', 'abc'), true);
  assert.equal(_timingSafeEqual('abc', 'abd'), false);
  assert.equal(_timingSafeEqual('abc', 'abcd'), false);   // 접두사가 같아도 다르다
  assert.equal(_timingSafeEqual('abc', 'ab'), false);
  assert.equal(_timingSafeEqual('', ''), true);
  assert.equal(_timingSafeEqual(null, ''), true);          // 둘 다 빈 값
  assert.equal(_timingSafeEqual(null, 'x'), false);
});

// ── 계정 키가 갈리지 않게 ──

test('숫자로 온 userKey 도 세션과 같은 문자열이 된다', async () => {
  // 토스는 userKey 를 숫자로 준다. 그대로 bind 하면 SQLite 가 REAL 로 받아
  // TEXT 컬럼에 '307515147.0' 으로 저장하는데, 세션 subject 는 `mini:${userKey}` 라
  // '307515147' 이다. 그러면 로그인은 한 행에 쓰고 나머지 요청은 다른 행을 읽어
  // 같은 사람이 두 계정으로 갈린다. 실제로 프로덕션에서 그 상태가 만들어졌다.
  const numeric = 307515147;
  const token = await createSessionToken(`mini:${numeric}`, ENV);
  const fromSession = await getMiniUserKeyFromRequest(req(token), ENV);

  assert.equal(fromSession, '307515147');
  assert.equal(String(numeric), fromSession, '로그인이 저장할 키와 세션 키가 달라졌다');
  assert.doesNotMatch(String(numeric), /\./, '키에 소수점이 들어갔다');
});

test('성별 표기를 M/F 로 맞춘다', () => {
  // 토스는 MALE/FEMALE, 앱 폼은 M/F 를 보낸다. 대운은 남녀에 따라 순행·역행이
  // 갈려서 여기가 어긋나면 풀이가 통째로 반대가 된다.
  for (const v of ['MALE', 'male', 'M', '남', '남성']) assert.equal(_normalizeGender(v), 'M', v);
  for (const v of ['FEMALE', 'female', 'F', '여', '여성']) assert.equal(_normalizeGender(v), 'F', v);
  // 모르는 값은 틀린 성별로 계산하느니 비워 두고 사용자에게 받는다.
  for (const v of ['', null, undefined, 'X', 'OTHER', 'U']) assert.equal(_normalizeGender(v), null, String(v));
});

test('mTLS 바인딩이 없으면 조용히 넘어가지 않고 던진다', () => {
  // 일반 fetch 로 폴백하면 인증서 없이 호출해 실패하는데, 그 실패가
  // "로그인 실패"로만 보여 원인을 못 찾게 된다. 바인딩 부재를 명시적으로 알린다.
  assert.throws(() => _tossFetch({}, 'https://x', {}), /TOSS_MTLS/);
  assert.throws(() => _tossFetch({ TOSS_MTLS: {} }, 'https://x', {}), /TOSS_MTLS/);
});
