// 세션 토큰 서명 키 테스트.
//
// _sessionSecret() 은 예전에 이렇게 폴백했다:
//   env.SESSION_SECRET || env.ADMIN_SECRET || env.GEMINI_API_KEY || 'myan-dev-secret'
// 마지막 값은 이 **공개 저장소**에 그대로 박힌 상수라, 시크릿이 비는 순간 누구나
// 임의 이메일로 세션 JWT 를 위조할 수 있었다(전 계정 탈취 + 토큰 무한 지급).
// 지금은 SESSION_SECRET 이 없으면 던지도록 바뀌었고, 이 테스트가 그 계약을 고정한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { _sessionSecret, createSessionToken, verifySessionToken, hmacSign } =
  await loadWorker(['_sessionSecret', 'createSessionToken', 'verifySessionToken', 'hmacSign']);

const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');

test('SESSION_SECRET 이 없으면 던진다 (조용한 폴백 금지)', () => {
  assert.throws(() => _sessionSecret({}), /SESSION_SECRET/);
});

test('다른 시크릿으로 대체 서명하지 않는다', () => {
  // 예전 폴백 체인이 되살아나면 여기서 걸린다.
  assert.throws(() => _sessionSecret({ ADMIN_SECRET: 'a' }), /SESSION_SECRET/);
  assert.throws(() => _sessionSecret({ GEMINI_API_KEY: 'g' }), /SESSION_SECRET/);
});

test('SESSION_SECRET 이 있으면 그 값을 그대로 쓴다', () => {
  assert.equal(_sessionSecret({ SESSION_SECRET: 's3cr3t', GEMINI_API_KEY: 'g' }), 's3cr3t');
});

test('발급한 세션 토큰은 같은 시크릿으로 검증된다', async () => {
  const env = { SESSION_SECRET: 'test-secret-A' };
  const token = await createSessionToken('user@example.com', env);
  assert.equal(await verifySessionToken(token, env), 'user@example.com');
});

test('다른 시크릿으로 서명된 토큰은 거부된다', async () => {
  const token = await createSessionToken('attacker@example.com', { SESSION_SECRET: 'secret-A' });
  assert.equal(await verifySessionToken(token, { SESSION_SECRET: 'secret-B' }), null);
});

test('서명 없이 페이로드만 조작한 토큰은 거부된다', async () => {
  const env = { SESSION_SECRET: 'test-secret-A' };
  const token = await createSessionToken('user@example.com', env);
  const [h, , s] = token.split('.');
  // 이메일만 바꿔치기한 페이로드를 원래 서명에 붙여본다
  const forgedPayload = Buffer
    .from(JSON.stringify({ email: 'admin@example.com', iat: 0, exp: 9999999999, t: 's' }))
    .toString('base64url');
  assert.equal(await verifySessionToken(`${h}.${forgedPayload}.${s}`, env), null);
});

test('만료된 토큰은 서명이 유효해도 거부된다', async () => {
  // 서명까지 제대로 맞춘 뒤 exp 만 과거로 둔다 — 만료 검사 분기를 실제로 태우기 위해서다.
  const env = { SESSION_SECRET: 'test-secret-A' };
  const header  = b64url({ alg: 'HS256', typ: 'JWT' });
  const expired = b64url({ email: 'user@example.com', iat: 0, exp: 1, t: 's' });
  const sig     = await hmacSign(env.SESSION_SECRET, `${header}.${expired}`);

  assert.equal(await verifySessionToken(`${header}.${expired}.${sig}`, env), null);
});

test('alg 를 none 으로 바꾼 토큰은 거부된다', async () => {
  // 서명 검증을 건너뛰게 만드는 고전적인 JWT 우회.
  const env = { SESSION_SECRET: 'test-secret-A' };
  const header  = b64url({ alg: 'none', typ: 'JWT' });
  const payload = b64url({ email: 'admin@example.com', iat: 0, exp: 9999999999, t: 's' });

  assert.equal(await verifySessionToken(`${header}.${payload}.`, env), null);
});
