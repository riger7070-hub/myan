// 안도령 부풀리기 테스트.
//
// 두드린 횟수로 토큰을 주는 놀이다. 클라이언트가 "다 두드렸다"고 말하는 걸 그대로
// 믿으면, 앱을 고칠 것도 없이 보상 엔드포인트만 직접 부르면 토큰이 나온다.
// 그래서 서버가 목표 횟수와 발급 시각을 서명해 내려주고, 제출할 때 서명과
// 걸린 시간을 확인한다. 이 검증이 느슨해지면 토큰이 무제한으로 새어 나간다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const { handleMiniPopStart, handleMiniPopClaim, createSessionToken, hmacSign } = await loadWorker([
  'handleMiniPopStart', 'handleMiniPopClaim', 'createSessionToken', 'hmacSign',
]);

const SECRET = 'mini-pop-test-secret';
const USER = 'UK-POP';

async function setup() {
  const { db, DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET };
  const session = await createSessionToken(`mini:${USER}`, env);
  const auth = { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' };
  const start = () => handleMiniPopStart(new Request('https://x/mini/api/pop', { headers: auth }), env);
  const claim = (body) => handleMiniPopClaim(new Request('https://x/mini/api/pop', {
    method: 'POST', headers: auth, body: JSON.stringify(body),
  }), env);
  const balance = () => Number(db.prepare(
    `SELECT COALESCE(SUM(tokens),0) b FROM mini_payment_requests WHERE user_key=? AND status='approved'`
  ).get(USER).b);
  return { db, start, claim, balance };
}

/**
 * "ms 밀리초 전에 발급받은 것"을 만든다.
 * issuedAt 만 바꾸면 서명이 깨지므로(그 자체가 이 설계의 요점이다),
 * 서버가 그때 만들었을 서명을 같은 방식으로 다시 만들어 준다.
 */
async function aged(s, ms) {
  const issuedAt = s.issuedAt - ms;
  const sig = await hmacSign(SECRET, `pop:${USER}:${s.taps}:${issuedAt}`);
  return { issuedAt, sig, taps: s.taps };
}

test('다 두드리면 토큰을 준다', async () => {
  const { start, claim, balance } = await setup();
  const s = await (await start()).json();
  assert.ok(s.taps >= 10 && s.sig && s.issuedAt, '발급 값이 이상하다');

  const r = await (await claim({ ...(await aged(s, 8000)), taps: s.taps })).json();
  assert.equal(r.granted, true);
  assert.equal(balance(), 1);
});

test('덜 두드리고 보상을 요구하면 거절한다', async () => {
  const { start, claim, balance } = await setup();
  const s = await (await start()).json();
  const res = await claim({ ...(await aged(s, 8000)), taps: s.taps - 1 });
  assert.equal(res.status, 400);
  assert.equal(balance(), 0);
});

test('사람 손으로 불가능한 속도면 거절한다', async () => {
  // 30번을 순식간에 = 자동화다. 이걸 막지 않으면 토큰이 무제한으로 나간다.
  const { start, claim, balance } = await setup();
  const s = await (await start()).json();
  const res = await claim({ ...s, taps: s.taps });   // 발급 직후 즉시 제출
  assert.equal(res.status, 400);
  assert.equal(balance(), 0);
});

test('오래된 발급은 다시 쓸 수 없다', async () => {
  const { start, claim, balance } = await setup();
  const s = await (await start()).json();
  const res = await claim({ ...(await aged(s, 10 * 60 * 1000)), taps: s.taps });
  assert.equal(res.status, 400);
  assert.equal(balance(), 0);
});

test('서명이 없거나 변조되면 거절한다', async () => {
  const { start, claim, balance } = await setup();
  const s = await (await start()).json();

  for (const body of [
    { ...(await aged(s, 8000)), sig: 'deadbeef', taps: s.taps },
    { ...(await aged(s, 8000)), sig: undefined, taps: s.taps },
    // 발급 시각을 바꾸면 서명이 안 맞는다 — 시간 검사를 우회할 수 없다.
    { issuedAt: s.issuedAt - 8000, sig: s.sig, taps: s.taps },
  ]) {
    const res = await claim(body);
    assert.equal(res.status, 400, `${JSON.stringify(body).slice(0, 50)} 가 통과했다`);
  }
  assert.equal(balance(), 0);
});

test('하루 상한을 넘겨 받을 수 없다', async () => {
  const { start, claim, balance } = await setup();
  const play = async () => {
    const s = await (await start()).json();
    return (await claim({ ...(await aged(s, 8000)), taps: s.taps })).json();
  };

  const got = [];
  for (let i = 0; i < 5; i++) got.push((await play()).granted);

  const granted = got.filter(Boolean).length;
  assert.ok(granted >= 1 && granted <= 3, `${granted}번 지급됐다 — 상한이 안 먹는다`);
  assert.equal(balance(), granted);
  assert.equal(got.slice(granted).every(g => g === false), true, '상한 뒤에도 지급됐다');
});

test('로그인하지 않았으면 시작도 보상도 못 한다', async () => {
  const { DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET };
  const web = await createSessionToken('user@example.com', env);   // 웹 세션

  for (const auth of [null, `Bearer ${web}`]) {
    const h = auth ? { Authorization: auth } : {};
    assert.equal((await handleMiniPopStart(new Request('https://x/mini/api/pop', { headers: h }), env)).status, 401);
    assert.equal((await handleMiniPopClaim(new Request('https://x/mini/api/pop', {
      method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}',
    }), env)).status, 401);
  }
});
