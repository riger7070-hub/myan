// 토큰 지급 경로의 멱등성 — "한 번만 받을 수 있는 것"이 정말 한 번만 나가는지.
//
// 이 저장소의 지급 핸들러는 대부분 같은 모양이다: SELECT 로 "이미 받았나" 확인 → 통과하면
// payment_requests 에 지급 행을 INSERT. 그런데 그 사이에 await 가 있으므로 요청 두 개가 나란히
// 들어오면 **둘 다** 검사를 통과해 두 번 지급된다. D1 은 네트워크 너머라 이 창은 실제로 열린다
// (버튼 두 번 누르기, 느린 네트워크에서의 재시도, 오프라인 큐 재전송, 탭 두 개).
//
// 각 테스트는 같은 요청을 동시에 두 번 보내고 잔액이 1회분인지만 본다.
// (검증: 고정 id / 조건부 UPDATE 를 예전의 랜덤 id 로 되돌리면 전부 실패한다.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1, balanceOf } from './d1-sqlite.mjs';

const {
  handleSignupGrant, handleMigrateTokens, handlePromoClaim, createSessionToken,
} = await loadWorker([
  'handleSignupGrant', 'handleMigrateTokens', 'handlePromoClaim', 'createSessionToken',
]);

const SECRET = 'test-secret';

function setup() {
  const { db, DB } = createD1();
  return { db, env: { SESSION_SECRET: SECRET, DB } };
}

const post = (url, token, body = {}) => new Request(`https://x${url}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

const rowsOf = (db, email, pkg) =>
  db.prepare(`SELECT id FROM payment_requests WHERE user_email=? AND pkg=?`).all(email, pkg);

test('가입 축하 토큰은 동시 요청에도 3개만 지급된다', async () => {
  const { db, env } = setup();
  const email = 'signup@example.com';
  const token = await createSessionToken(email, env);

  await Promise.all([
    handleSignupGrant(post('/signup-grant', token), env),
    handleSignupGrant(post('/signup-grant', token), env),
  ]);

  assert.equal(rowsOf(db, email, 'signup_grant').length, 1, '가입 지급 행이 두 개 생겼다');
  assert.equal(balanceOf(db, email), 3);
});

test('로컬 토큰 이관은 동시 요청에도 한 번만 반영된다', async () => {
  const { db, env } = setup();
  const email = 'migrate@example.com';
  const token = await createSessionToken(email, env);

  await Promise.all([
    handleMigrateTokens(post('/migrate-tokens', token, { tokens: 30 }), env),
    handleMigrateTokens(post('/migrate-tokens', token, { tokens: 30 }), env),
  ]);

  assert.equal(rowsOf(db, email, 'migration').length, 1, '이관 행이 두 개 생겼다');
  assert.equal(balanceOf(db, email), 30, '30개가 두 번 들어오면 60이 된다');
});

test('프로모 코드는 계정당 1회 — 동시 요청에도 3개만 지급된다', async () => {
  const { db, env } = setup();
  const email = 'promo@example.com';
  const token = await createSessionToken(email, env);

  await Promise.all([
    handlePromoClaim(post('/api/promo/claim', token, { code: 'MYAN_CAFE' }), env),
    handlePromoClaim(post('/api/promo/claim', token, { code: 'MYAN_CAFE' }), env),
  ]);

  const claims = db.prepare(
    `SELECT id FROM promo_claims WHERE user_email=? AND promo_code='MYAN_CAFE'`
  ).all(email);
  assert.equal(claims.length, 1, '클레임 기록이 두 개 생겼다');
  assert.equal(balanceOf(db, email), 3);
});

test('두 번째 프로모 클레임은 409 로 거절된다 (순차 요청)', async () => {
  const { db, env } = setup();
  const email = 'promo2@example.com';
  const token = await createSessionToken(email, env);

  const first = await handlePromoClaim(post('/api/promo/claim', token, { code: 'MYAN_CAFE' }), env);
  const second = await handlePromoClaim(post('/api/promo/claim', token, { code: 'MYAN_CAFE' }), env);

  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  assert.equal(balanceOf(db, email), 3);
});

test('1회용 다이나믹 프로모 토큰은 서로 다른 두 계정이 동시에 써도 한 명만 받는다', async () => {
  const { db, env } = setup();
  const promoToken = 'ABCD2345';
  db.prepare(
    `INSERT INTO dynamic_promo_tokens (token, created_at, tokens_given) VALUES (?, unixepoch(), 5)`
  ).run(promoToken);

  const a = 'dyn-a@example.com', b = 'dyn-b@example.com';
  const [ta, tb] = await Promise.all([createSessionToken(a, env), createSessionToken(b, env)]);

  await Promise.all([
    handlePromoClaim(post('/api/promo/claim', ta, { promo_token: promoToken }), env),
    handlePromoClaim(post('/api/promo/claim', tb, { promo_token: promoToken }), env),
  ]);

  const total = balanceOf(db, a) + balanceOf(db, b);
  assert.equal(total, 5, '1회용 코드인데 두 계정이 각각 받았다');
  assert.equal(
    db.prepare(`SELECT id FROM promo_claims WHERE promo_code='DYNAMIC'`).all().length, 1);
});

test('같은 계정이 1회용 토큰을 동시에 두 번 써도 한 번만 지급된다', async () => {
  const { db, env } = setup();
  const promoToken = 'EFGH6789';
  db.prepare(
    `INSERT INTO dynamic_promo_tokens (token, created_at, tokens_given) VALUES (?, unixepoch(), 5)`
  ).run(promoToken);

  const email = 'dyn-same@example.com';
  const token = await createSessionToken(email, env);

  await Promise.all([
    handlePromoClaim(post('/api/promo/claim', token, { promo_token: promoToken }), env),
    handlePromoClaim(post('/api/promo/claim', token, { promo_token: promoToken }), env),
  ]);

  assert.equal(balanceOf(db, email), 5);
});
