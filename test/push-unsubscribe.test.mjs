// 푸시 구독 해제 권한 테스트.
//
// 예전엔 endpoint 만 맞으면 누구든 DELETE 할 수 있었다. 푸시 엔드포인트 URL 은 비밀번호가
// 아니라서(로그·확장프로그램·프록시 어디서든 새어나갈 수 있다) 값을 아는 사람이 남의 알림을
// 조용히 끊을 수 있었다. 클라이언트는 예전부터 Authorization 을 보내고 있었는데 서버가
// 무시하고 있었던 것 — 구독(subscribe) 쪽과 똑같은 문제였다.
//
// D1 을 흉내낸 최소 스텁으로 핸들러를 직접 돌려 계약을 고정한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { handlePushUnsubscribe, createSessionToken } =
  await loadWorker(['handlePushUnsubscribe', 'createSessionToken']);

const SECRET = 'test-secret';

/** push_subscriptions 한 행만 흉내내는 아주 작은 D1 스텁 */
function makeEnv(row) {
  const state = { row, deleted: false };
  const env = {
    SESSION_SECRET: SECRET,
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() { return state.row ? { user_email: state.row.user_email } : null; },
          async run() {
            if (/DELETE/i.test(sql)) { state.deleted = true; state.row = null; }
            return { meta: {} };
          },
        };
      },
    },
  };
  return { env, state };
}

const req = (headers = {}) => new Request('https://x/api/push/unsubscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({ endpoint: 'https://push.example.com/abc123' }),
});

test('소유자 본인은 해제할 수 있다', async () => {
  const { env, state } = makeEnv({ user_email: 'owner@example.com' });
  const token = await createSessionToken('owner@example.com', env);
  const res = await handlePushUnsubscribe(req({ Authorization: `Bearer ${token}` }), env);

  assert.equal(res.status, 200);
  assert.equal(state.deleted, true, '삭제됐어야 한다');
});

test('남의 구독은 해제할 수 없다', async () => {
  const { env, state } = makeEnv({ user_email: 'owner@example.com' });
  const token = await createSessionToken('attacker@example.com', env);
  const res = await handlePushUnsubscribe(req({ Authorization: `Bearer ${token}` }), env);

  assert.equal(res.status, 403);
  assert.equal(state.deleted, false, '남의 구독이 지워지면 안 된다');
});

test('토큰 없이 남의 구독을 해제할 수 없다', async () => {
  const { env, state } = makeEnv({ user_email: 'owner@example.com' });
  const res = await handlePushUnsubscribe(req(), env);

  assert.equal(res.status, 403);
  assert.equal(state.deleted, false);
});

test('소유자가 없는(비로그인) 구독은 endpoint 만으로 해제된다', async () => {
  // 로그인 전에 만들어진 구독은 소유자를 알 수 없다. 여기까지 막으면 영영 못 끊는다.
  const { env, state } = makeEnv({ user_email: null });
  const res = await handlePushUnsubscribe(req(), env);

  assert.equal(res.status, 200);
  assert.equal(state.deleted, true);
});

test('이미 없는 구독은 조용히 성공 처리한다', async () => {
  const { env } = makeEnv(null);
  const res = await handlePushUnsubscribe(req(), env);
  assert.equal(res.status, 200);
});

test('endpoint 가 없으면 400', async () => {
  const { env } = makeEnv({ user_email: null });
  const bad = new Request('https://x/api/push/unsubscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  const res = await handlePushUnsubscribe(bad, env);
  assert.equal(res.status, 400);
});
