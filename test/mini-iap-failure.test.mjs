// 결제는 됐는데 엽전이 안 들어가는 사고를 잡는 검사.
//
// 2026-08-30 에 실제로 났다. 사용자가 결제를 마쳤는데 "제휴사에서 상품 지급에
// 실패했습니다" 가 떴고, 원장에는 아무것도 남지 않았다. 나중에 찾아보려 해도
// **어디에도 흔적이 없어서** 화면 갈무리가 유일한 증거였다. 돈이 오간 자리에서
// 그건 있을 수 없다.
//
// 그래서 두 가지를 못 박는다.
//   1. 지급이 안 됐으면 응답에 `ok` 가 없다 — 클라이언트가 성공으로 접으면 안 된다.
//      (접으면 토스가 주문을 완료로 처리해 다음 실행의 복구 대상에서도 빠진다.)
//   2. 실패한 주문은 원장에 status='failed' 흔적으로 남는다. 잔액에는 섞이지 않는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const { handleMiniPaymentGrant, handleMiniAdminOrderProbe, handleMiniAdminFailures, createSessionToken } = await loadWorker([
  'handleMiniPaymentGrant', 'handleMiniAdminOrderProbe', 'handleMiniAdminFailures', 'createSessionToken',
]);

const SECRET = 'mini-iap-test-secret';
const USER = 'UK-IAP';
const ORDER = 'order-abc-123';

/** 토스 주문조회가 무엇을 돌려줄지 정해서 환경을 만든다. */
async function setup(reply) {
  const { db, DB } = createD1();
  const env = {
    DB,
    SESSION_SECRET: SECRET,
    TOSS_MTLS: { fetch: async () => reply() },
  };
  const session = await createSessionToken(`mini:${USER}`, env);
  const grant = () => handleMiniPaymentGrant(new Request('https://x/mini/api/payment/grant', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ORDER }),
  }), env);
  const balance = () => Number(db.prepare(
    `SELECT COALESCE(SUM(tokens),0) b FROM mini_payment_requests WHERE user_key=? AND status='approved'`
  ).get(USER).b);
  const failed = () => db.prepare(
    `SELECT id, pkg, tokens FROM mini_payment_requests WHERE user_key=? AND status='failed'`
  ).all(USER);
  return { grant, balance, failed };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('결제가 끝난 주문은 지급되고 잔액이 오른다', async () => {
  const { grant, balance, failed } = await setup(
    () => json({ status: 'PURCHASED', sku: { id: 'token_10' } })
  );
  const res = await grant();
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(balance(), 10);
  assert.equal(failed().length, 0, '성공한 주문에 실패 흔적이 남으면 안 된다');
});

test('아직 정산 중이면 성공이라고 답하지 않는다', async () => {
  const { grant, balance } = await setup(
    () => json({ status: 'ORDER_IN_PROGRESS' })
  );
  const res = await grant();
  const body = await res.json();
  // 여기서 ok 를 주면 클라이언트가 true 를 돌려주고, 토스가 주문을 완료로 접는다.
  // 엽전은 안 들어간 채로 복구 대상에서도 빠져서 돈만 나간다.
  assert.ok(!body.ok, '지급되지 않았는데 ok 를 주면 안 된다');
  assert.equal(balance(), 0);
});

test('모르는 SKU 는 지급 못 하지만 흔적을 남긴다', async () => {
  const { grant, balance, failed } = await setup(
    () => json({ status: 'PURCHASED', sku: { id: '없는상품' } })
  );
  const res = await grant();
  assert.equal(res.status, 500);
  assert.equal(balance(), 0, '지급하지 않은 것이 맞다');

  const rows = failed();
  assert.equal(rows.length, 1, '돈이 오간 실패는 반드시 원장에서 찾을 수 있어야 한다');
  assert.equal(rows[0].id, `fail:${ORDER}`);
  assert.equal(rows[0].tokens, 0, '흔적은 잔액에 섞이면 안 된다');
  assert.match(rows[0].pkg, /SKU/);
});

test('토스 주문조회가 실패해도 흔적을 남긴다', async () => {
  const { grant, balance, failed } = await setup(
    () => new Response('gateway error', { status: 500 })
  );
  const res = await grant();
  assert.equal(res.status, 502);
  assert.equal(balance(), 0);
  assert.equal(failed().length, 1);
});

test('같은 주문이 두 번 실패해도 흔적은 한 줄이다', async () => {
  const { grant, failed } = await setup(
    () => json({ status: 'PURCHASED', sku: { id: '없는상품' } })
  );
  await grant();
  await grant();
  assert.equal(failed().length, 1);
});

// 서버가 `ok` 를 안 줘도 클라이언트가 성공으로 접으면 아무 소용이 없다.
// 그 확인이 미니앱 쪽에 실제로 있는지 본다.
test('클라이언트는 ok 를 확인하고서야 지급됐다고 답한다', async () => {
  const src = await import('node:fs/promises').then(fs => fs.readFile('mini/src/main.js', 'utf8'));
  const fn = src.slice(src.indexOf('processProductGrant'), src.indexOf('onEvent:'));
  assert.match(fn, /if\s*\(\s*!r\?\.ok\s*\)[^]*return false/,
    'processProductGrant 가 r.ok 를 보지 않으면 202 를 성공으로 접는다');
});

// ── 관리자 주문 조회 ────────────────────────────────────────
//
// 결제를 새로 하지 않고 원인을 짚으려고 둔 자리다. 남의 주문을 열어 주는 문이므로
// 열쇠가 없으면 아무것도 내주지 않아야 하고, **아무것도 쓰지 않아야** 한다.

function probeSetup({ secret = 'ADMIN-KEY', reply } = {}) {
  const { db, DB } = createD1();
  const env = { DB, ADMIN_SECRET: secret, TOSS_MTLS: { fetch: async () => reply() } };
  const probe = (key) => handleMiniAdminOrderProbe(
    new Request(`https://x/admin/mini-order?orderId=${ORDER}${key ? `&key=${key}` : ''}`), env);
  const rows = () => db.prepare('SELECT COUNT(*) c FROM mini_payment_requests').get().c;
  return { probe, rows };
}

test('열쇠가 없으면 주문을 보여주지 않는다', async () => {
  const { probe } = probeSetup({ reply: () => json({ status: 'PURCHASED' }) });
  assert.equal((await probe()).status, 401);
  assert.equal((await probe('틀린열쇠')).status, 401);
});

test('ADMIN_SECRET 이 없으면 아무도 못 연다', async () => {
  const { probe } = probeSetup({ secret: undefined, reply: () => json({ status: 'PURCHASED' }) });
  assert.equal((await probe('')).status, 401);
  assert.equal((await probe('아무거나')).status, 401);
});

test('주문 조회는 읽기만 하고 원장을 건드리지 않는다', async () => {
  const { probe, rows } = probeSetup({
    reply: () => json({ status: 'PURCHASED', sku: { id: 'token_30' } }),
  });
  const body = await (await probe('ADMIN-KEY')).json();
  assert.equal(body.읽어낸것.sku, 'token_30');
  assert.equal(body.읽어낸것.지급대상상태인가, true);
  assert.equal(body.읽어낸것.찾은상품.tokens, 30);
  assert.equal(rows(), 0, '진단이 원장에 무언가를 남기면 안 된다');
});

test('토스 조회가 막혀도 그 사실을 그대로 돌려준다', async () => {
  const { probe } = probeSetup({ reply: () => new Response('nope', { status: 403 }) });
  const body = await (await probe('ADMIN-KEY')).json();
  assert.match(body.조회오류, /403/);
  assert.equal(body.응답, null);
});

// ── 화면이 보여준 SKU 와 주문이 말하는 SKU ──────────────────
//
// 2026-08-30 의 진짜 원인이 여기였다. 타일은 서버가 아는 SKU 였는데(할인 배지가 붙어
// 있었다) 주문은 표에 없는 번호를 돌려줬다. 그래서 클라이언트가 보여준 번호도 함께
// 받아 두는데, **그 값으로 지급량을 정하면 안 된다** — 10개를 사고 100개를 받게 된다.

async function grantWith({ orderSku, shownSku }) {
  const { db, DB } = createD1();
  const env = {
    DB, SESSION_SECRET: SECRET,
    TOSS_MTLS: { fetch: async () => json({ status: 'PURCHASED', sku: { id: orderSku } }) },
  };
  const session = await createSessionToken(`mini:${USER}`, env);
  const res = await handleMiniPaymentGrant(new Request('https://x/mini/api/payment/grant', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: ORDER, shownSku }),
  }), env);
  const balance = Number(db.prepare(
    `SELECT COALESCE(SUM(tokens),0) b FROM mini_payment_requests WHERE user_key=? AND status='approved'`
  ).get(USER).b);
  const failed = db.prepare(
    `SELECT pkg FROM mini_payment_requests WHERE user_key=? AND status='failed'`
  ).all(USER);
  return { res, balance, failed };
}

test('화면이 말한 상품으로는 지급량이 바뀌지 않는다', async () => {
  const { res, balance } = await grantWith({ orderSku: 'token_10', shownSku: 'token_100' });
  assert.equal(res.status, 200);
  assert.equal(balance, 10, '클라이언트가 말한 상품을 믿으면 10개 사고 100개를 받아간다');
});

test('모르는 SKU 는 그 번호가 원장에 그대로 남는다', async () => {
  const SKU = 'ait.0000062547.477ec529.3d1aad69c3.7717716588';
  const { failed } = await grantWith({ orderSku: SKU, shownSku: 'token_10' });
  assert.equal(failed.length, 1);
  // 로그가 사라진 뒤에도 원장만 보면 시크릿에 무엇을 더할지 알 수 있어야 한다.
  assert.ok(failed[0].pkg.includes(SKU), `주문의 SKU 가 안 남았다: ${failed[0].pkg}`);
  // 화면이 다른 번호를 보여줬다는 사실도 함께 남는다 — 그게 곧 원인이다.
  assert.match(failed[0].pkg, /화면:token_10/);
});

// ── 막힌 주문 목록 ──────────────────────────────────────────
//
// 콘솔에서 가격을 고치면 SKU 가 새로 생겨 지급이 멈춘다. 화면에는 "준비 중" 으로만
// 뜨므로 모르고 지나가기 쉽다. 그래서 한 줄로 확인할 자리를 둔다.

test('막힌 주문 목록도 열쇠가 있어야 열린다', async () => {
  const { DB } = createD1();
  const env = { DB, ADMIN_SECRET: 'ADMIN-KEY' };
  const call = (key) => handleMiniAdminFailures(
    new Request(`https://x/admin/mini-failures${key ? `?key=${key}` : ''}`), env);
  assert.equal((await call()).status, 401);
  assert.equal((await call('틀린것')).status, 401);
  assert.equal((await call('ADMIN-KEY')).status, 200);
});

test('막힌 주문이 SKU 와 함께 나온다', async () => {
  const SKU = 'ait.0000062547.477ec529.3d1aad69c3.7717716588';
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO mini_payment_requests (id,user_key,pkg,amount,tokens,status)
     VALUES (?,?,?,0,0,'failed')`
  ).run(`fail:${ORDER}`, USER, `grant_failed:모르는SKU:${SKU}`);
  const res = await handleMiniAdminFailures(
    new Request('https://x/admin/mini-failures?key=K'), { DB, ADMIN_SECRET: 'K' });
  const body = await res.json();
  assert.equal(body.실패.length, 1);
  // 이 번호를 그대로 MINI_SKU_ALIAS 에 넣으면 복구된다 — 그래서 여기 보여야 한다.
  assert.ok(body.실패[0].pkg.includes(SKU));
});
