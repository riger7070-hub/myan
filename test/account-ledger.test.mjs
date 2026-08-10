// 계정 계층 테스트 — 웹과 미니앱을 한 코드로 다루되 원장은 절대 섞이지 않는다.
//
// 유료 콘텐츠 핸들러는 원래 이메일만 알아서 미니앱이 같은 콘텐츠를 하나도 쓸 수 없었다.
// resolveAccount/accountSpend/accountRefund 가 그 사이를 메운다.
//
// 여기서 지켜야 할 계약은 두 가지다.
//   1) 미니앱 요청은 mini_payment_requests 만 건드린다. 웹 원장에 한 행이라도 생기면
//      두 서비스의 회계가 섞이고, 그건 되돌리기 어렵다.
//   2) 차감은 원자적이다. 잔액을 읽고 나서 쓰는 2단계면 동시 요청이 같은 잔액을 보고
//      둘 다 통과해서, 잔액 1개로 두 번 볼 수 있다.
//
// 스텁이 아니라 worker.js 의 진짜 DDL 이 올라간 SQLite 로 돌린다 — 원자성은 SQL 이
// 지켜주는 계약이라 SQL 을 실행하지 않는 스텁으로는 검증했다고 할 수 없다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const { resolveAccount, accountBalance, accountSpend, accountRefund, createSessionToken } =
  await loadWorker([
    'resolveAccount', 'accountBalance', 'accountSpend', 'accountRefund', 'createSessionToken',
  ]);

const SECRET = 'account-ledger-test-secret';
const WEB = { kind: 'web', key: 'user@example.com' };
const MINI = { kind: 'mini', key: 'UK-1' };

function setup() {
  const { db, DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET };
  const grant = (acct, tokens) => {
    const t = acct.kind === 'web'
      ? ['payment_requests', 'user_email'] : ['mini_payment_requests', 'user_key'];
    db.prepare(
      `INSERT INTO ${t[0]} (id, ${t[1]}, pkg, amount, tokens, status, approved_at)
       VALUES (?, ?, 'grant', 0, ?, 'approved', unixepoch())`
    ).run(`grant-${acct.kind}-${tokens}-${Math.random()}`, acct.key, tokens);
  };
  const count = (table) => db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
  return { db, env, grant, count };
}

const req = (token) => new Request('https://x/api/tarot-draw', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

// ── 계정 해석 ──

test('웹 세션은 web 계정으로, 미니앱 세션은 mini 계정으로 해석된다', async () => {
  const { env } = setup();
  const web = await createSessionToken('user@example.com', env);
  const mini = await createSessionToken('mini:UK-1', env);

  assert.deepEqual(await resolveAccount(req(web), env), { kind: 'web', key: 'user@example.com' });
  assert.deepEqual(await resolveAccount(req(mini), env), { kind: 'mini', key: 'UK-1' });
});

test('토큰이 없거나 위조면 계정이 없다', async () => {
  const { env } = setup();
  const forged = await createSessionToken('user@example.com', { SESSION_SECRET: 'other' });
  for (const t of [null, 'garbage', forged]) {
    assert.equal(await resolveAccount(req(t), env), null, `${t} 는 거부되어야 한다`);
  }
});

test("'mini' 로 시작하는 이메일은 웹 계정으로 남는다", async () => {
  // 접두사 검사가 느슨하면 정상 사용자가 엉뚱한 원장으로 간다.
  const { env } = setup();
  const token = await createSessionToken('mini@example.com', env);
  assert.deepEqual(await resolveAccount(req(token), env), { kind: 'web', key: 'mini@example.com' });
});

// ── 원장 분리 ──

test('미니앱 차감은 웹 원장을 건드리지 않는다', async () => {
  const { env, grant, count } = setup();
  grant(MINI, 10);
  grant(WEB, 10);

  assert.equal(await accountSpend(env, MINI, 'tarot', 3), true);

  assert.equal(await accountBalance(env, MINI), 7);
  assert.equal(await accountBalance(env, WEB), 10, '웹 잔액이 줄었다');
  assert.equal(count('payment_requests'), 1, '웹 원장에 행이 생겼다');
});

test('웹 차감은 미니앱 원장을 건드리지 않는다', async () => {
  const { env, grant, count } = setup();
  grant(MINI, 10);
  grant(WEB, 10);

  assert.equal(await accountSpend(env, WEB, 'tarot', 3), true);

  assert.equal(await accountBalance(env, WEB), 7);
  assert.equal(await accountBalance(env, MINI), 10);
  assert.equal(count('mini_payment_requests'), 1, '미니 원장에 행이 생겼다');
});

test('같은 키를 써도 두 원장은 서로 모른다', async () => {
  // 이메일과 userKey 가 우연히 같은 문자열이어도 잔액이 합쳐지면 안 된다.
  const { env, grant } = setup();
  const same = 'collision';
  grant({ kind: 'web', key: same }, 5);
  assert.equal(await accountBalance(env, { kind: 'mini', key: same }), 0);
});

// ── 차감·환불 ──

test('잔액이 모자라면 차감하지 않고 아무것도 쓰지 않는다', async () => {
  for (const acct of [WEB, MINI]) {
    const { env, grant, count } = setup();
    grant(acct, 2);
    const table = acct.kind === 'web' ? 'payment_requests' : 'mini_payment_requests';

    assert.equal(await accountSpend(env, acct, 'detail', 3), false, `${acct.kind} 가 통과했다`);
    assert.equal(await accountBalance(env, acct), 2);
    assert.equal(count(table), 1, '거부했는데 행이 생겼다');
  }
});

test('잔액과 비용이 딱 같으면 통과한다', async () => {
  const { env, grant } = setup();
  grant(MINI, 3);
  assert.equal(await accountSpend(env, MINI, 'detail', 3), true);
  assert.equal(await accountBalance(env, MINI), 0);
});

test('환불하면 차감한 만큼 정확히 돌아온다', async () => {
  for (const acct of [WEB, MINI]) {
    const { env, grant } = setup();
    grant(acct, 10);
    await accountSpend(env, acct, 'photo', 4);
    assert.equal(await accountBalance(env, acct), 6);

    await accountRefund(env, acct, 'photo', 4);
    assert.equal(await accountBalance(env, acct), 10, `${acct.kind} 환불이 어긋났다`);
  }
});

test('동시에 들어온 두 차감이 잔액을 넘겨 쓰지 않는다', async () => {
  // 잔액 3에 2토큰짜리 두 개가 동시에 들어오면 하나만 통과해야 한다.
  // 읽고 나서 쓰는 2단계 구현이면 둘 다 통과해서 잔액이 -1 이 된다.
  const { env, grant } = setup();
  grant(MINI, 3);

  const results = await Promise.all([
    accountSpend(env, MINI, 'detail', 2),
    accountSpend(env, MINI, 'detail', 2),
  ]);

  assert.equal(results.filter(Boolean).length, 1, `통과 개수가 ${results.filter(Boolean).length}`);
  assert.equal(await accountBalance(env, MINI), 1);
});
