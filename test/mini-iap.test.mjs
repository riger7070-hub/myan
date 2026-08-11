// 앱인토스 인앱결제(IAP) 지급 테스트.
//
// 여기는 돈이 오가는 자리라 틀리면 두 방향 모두 사고다: 안 준 채로 결제되거나,
// 한 번 결제로 여러 번 지급되거나. 특히 두 가지를 계약으로 고정한다.
//
//   1) 지급량은 **토스가 알려준 sku** 로만 정한다. 클라이언트가 보낸 값은 쓰지 않는다.
//      요청 본문에 tokens 를 실어 보내면 원하는 만큼 받아가는 구멍이 된다.
//   2) 같은 orderId 는 몇 번을 불러도 한 번만 지급한다. 클라이언트 재시도와
//      getPendingOrders 복구 흐름에서 실제로 여러 번 들어온다.
//
// 스텁 대신 worker.js 의 진짜 DDL 이 올라간 SQLite 를 쓴다 — 중복 방지는 PRIMARY KEY 가
// 지켜주는 계약이라, SQL 을 실행하지 않는 스텁으로는 검증했다고 말할 수 없다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const { handleMiniPaymentGrant, createSessionToken } = await loadWorker([
  'handleMiniPaymentGrant', 'createSessionToken',
]);

const SECRET = 'mini-iap-test-secret';
const USER = 'UK-1234';

/** 토스 주문조회 응답을 흉내 내는 mTLS 바인딩. 호출 횟수도 세어 둔다. */
function tossStub(order) {
  const calls = [];
  return {
    calls,
    binding: {
      fetch: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ resultType: 'SUCCESS', success: order }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  };
}

async function setup(order, extraEnv = {}) {
  const { db, DB } = createD1();
  const toss = tossStub(order);
  const env = { DB, SESSION_SECRET: SECRET, TOSS_MTLS: toss.binding, ...extraEnv };
  const session = await createSessionToken(`mini:${USER}`, env);
  const grant = (body = { orderId: 'ORD-1' }) => handleMiniPaymentGrant(
    new Request('https://x/mini/api/payment/grant', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }), env);
  return { db, env, toss, grant };
}

const balance = (db) => Number(db.prepare(
  `SELECT COALESCE(SUM(tokens),0) AS bal FROM mini_payment_requests WHERE user_key=? AND status='approved'`
).get(USER).bal);

test('결제가 확인되면 sku 에 해당하는 토큰을 지급한다', async () => {
  const { db, grant } = await setup({ orderId: 'ORD-1', sku: 'token_30', status: 'PURCHASED' });
  const res = await grant();
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.granted, true);
  assert.equal(body.balance, 30);
  assert.equal(balance(db), 30);
});

test('같은 주문을 다시 불러도 두 번 지급하지 않는다', async () => {
  const { db, grant } = await setup({ orderId: 'ORD-1', sku: 'token_100', status: 'PURCHASED' });
  const first = await (await grant()).json();
  const second = await (await grant()).json();

  assert.equal(first.granted, true);
  // 두 번째도 성공으로 돌려준다 — 클라이언트 입장에선 "지급 끝난 주문"이라 재시도가 멈춰야 한다.
  assert.equal(second.ok, true);
  assert.equal(second.granted, false);
  assert.equal(balance(db), 100, '두 번 지급됐다');
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM mini_payment_requests`).get().c, 1);
});

test('클라이언트가 보낸 토큰·금액은 무시하고 sku 로만 정한다', async () => {
  const { db, grant } = await setup({ orderId: 'ORD-1', sku: 'token_30', status: 'PURCHASED' });
  // 요청 본문으로 9999개를 요구해도 표에 적힌 30개만 나가야 한다.
  await grant({ orderId: 'ORD-1', tokens: 9999, amount: 0, sku: 'token_300' });
  assert.equal(balance(db), 30);
  const row = db.prepare(`SELECT pkg, amount FROM mini_payment_requests`).get();
  assert.equal(row.pkg, 'token_30');
  // 금액도 서버 표에서 온다. 가격을 바꾸면 여기도 함께 고칠 것(그래야 조용히 어긋나지 않는다).
  assert.equal(row.amount, 9900);
});

test('결제가 안 끝난 상태면 지급하지 않는다', async () => {
  for (const status of ['FAILED', 'NOT_FOUND', 'MINIAPP_MISMATCH', 'ERROR']) {
    const { db, grant } = await setup({ orderId: 'ORD-1', sku: 'token_30', status });
    const res = await grant();
    assert.equal(res.status, 400, `${status} 는 거부되어야 한다`);
    assert.equal(balance(db), 0, `${status} 인데 지급됐다`);
  }
});

test('진행 중인 주문은 실패가 아니라 재시도로 알린다', async () => {
  const { db, grant } = await setup({ orderId: 'ORD-1', sku: 'token_30', status: 'ORDER_IN_PROGRESS' });
  const res = await grant();
  assert.equal(res.status, 202);
  assert.equal((await res.json()).retry, true);
  assert.equal(balance(db), 0);
});

test('모르는 SKU 면 지급하지 않는다', async () => {
  // 콘솔에만 상품을 추가하고 MINI_PRODUCTS 를 안 고친 경우. 임의 지급보다 거부가 낫다.
  const { db, grant } = await setup({ orderId: 'ORD-1', sku: 'token_9999', status: 'PURCHASED' });
  const res = await grant();
  assert.equal(res.status, 500);
  assert.equal(balance(db), 0);
});

test('환불된 주문은 이미 지급했으면 음수 행으로 되돌린다', async () => {
  const { db, DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET };
  const session = await createSessionToken(`mini:${USER}`, env);
  const call = (order) => {
    env.TOSS_MTLS = tossStub(order).binding;
    return handleMiniPaymentGrant(new Request('https://x/mini/api/payment/grant', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ORD-1' }),
    }), env);
  };

  await call({ orderId: 'ORD-1', sku: 'token_30', status: 'PURCHASED' });
  assert.equal(balance(db), 30);

  const res = await call({ orderId: 'ORD-1', sku: 'token_30', status: 'REFUNDED' });
  assert.equal(res.status, 409);
  assert.equal(balance(db), 0, '환불이 잔액에 반영되지 않았다');

  // 원장은 append-only — 지급 행을 지우지 않고 음수 행을 덧붙인다.
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM mini_payment_requests`).get().c, 2);

  // 환불 통지가 여러 번 와도 한 번만 깎는다.
  await call({ orderId: 'ORD-1', sku: 'token_30', status: 'REFUNDED' });
  assert.equal(balance(db), 0);
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM mini_payment_requests`).get().c, 2);
});

test('로그인하지 않았거나 웹 세션이면 거부한다', async () => {
  const { db, DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET, TOSS_MTLS: tossStub({}).binding };
  const web = await createSessionToken('user@example.com', env);

  for (const auth of [null, `Bearer ${web}`, 'Bearer garbage']) {
    const res = await handleMiniPaymentGrant(new Request('https://x/mini/api/payment/grant', {
      method: 'POST',
      headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'ORD-1' }),
    }), env);
    assert.equal(res.status, 401);
  }
  assert.equal(balance(db), 0);
});

test('주문번호가 없으면 토스에 묻지도 않는다', async () => {
  const { toss, grant } = await setup({ orderId: 'ORD-1', sku: 'token_30', status: 'PURCHASED' });
  const res = await grant({});
  assert.equal(res.status, 400);
  assert.equal(toss.calls.length, 0);
});

test('주문 조회는 orderId 만 담아 POST 한다', async () => {
  const { toss, grant } = await setup({ orderId: 'ORD-7', sku: 'token_30', status: 'PURCHASED' });
  await grant({ orderId: 'ORD-7' });
  assert.equal(toss.calls.length, 1);
  assert.match(toss.calls[0].url, /\/order\/get-order-status$/);
  assert.deepEqual(toss.calls[0].body, { orderId: 'ORD-7' });
});

// ── 콘솔 SKU 별칭 ──────────────────────────────────────────
//
// 앱인토스 콘솔은 SKU 를 자동 생성한다('ait.0000062547.…'). 코드에 박아 두면 상품을
// 추가할 때마다 배포가 따라붙으므로 MINI_SKU_ALIAS 시크릿으로 뺐다. 돈이 오가는 경로라
// 별칭이 틀렸을 때 조용히 지급되거나 조용히 안 되는 일이 없어야 한다.

const AIT = 'ait.0000062547.fc566614.108bcc23c8.6434661588';

test('콘솔 SKU 를 별칭으로 풀어 지급한다', async () => {
  const { db, grant } = await setup(
    { orderId: 'ORD-A', sku: AIT, status: 'PURCHASED' },
    { MINI_SKU_ALIAS: JSON.stringify({ [AIT]: 'token_10' }) },
  );
  const res = await grant({ orderId: 'ORD-A' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).balance, 10);
  assert.equal(balance(db), 10);
});

test('별칭이 없으면 지급하지 않는다 (돈만 받고 넘어가지 않게)', async () => {
  const { db, grant } = await setup({ orderId: 'ORD-B', sku: AIT, status: 'PURCHASED' });
  const res = await grant({ orderId: 'ORD-B' });
  assert.equal(res.status, 500);
  assert.equal(balance(db), 0);
});

test('별칭이 가리키는 상품이 없으면 지급하지 않는다', async () => {
  // 시크릿에 오타가 났을 때. 없는 상품 키로 이어지면 조용히 0 을 주지 말고 막아야 한다.
  const { db, grant } = await setup(
    { orderId: 'ORD-C', sku: AIT, status: 'PURCHASED' },
    { MINI_SKU_ALIAS: JSON.stringify({ [AIT]: 'token_11' }) },
  );
  assert.equal((await grant({ orderId: 'ORD-C' })).status, 500);
  assert.equal(balance(db), 0);
});

test('시크릿 JSON 이 깨져도 지급이 열리지 않는다', async () => {
  const { db, grant } = await setup(
    { orderId: 'ORD-D', sku: AIT, status: 'PURCHASED' },
    { MINI_SKU_ALIAS: '{이건 JSON 이 아니다' },
  );
  assert.equal((await grant({ orderId: 'ORD-D' })).status, 500);
  assert.equal(balance(db), 0);
});

test('별칭이 있어도 상품 키를 직접 준 주문은 그대로 처리된다', async () => {
  // 별칭은 덧붙이는 길이지 대체가 아니다. 이게 깨지면 기존 주문 복구가 막힌다.
  const { db, grant } = await setup(
    { orderId: 'ORD-E', sku: 'token_30', status: 'PURCHASED' },
    { MINI_SKU_ALIAS: JSON.stringify({ [AIT]: 'token_10' }) },
  );
  assert.equal((await grant({ orderId: 'ORD-E' })).status, 200);
  assert.equal(balance(db), 30);
});

test('별칭이 붙어도 같은 주문은 한 번만 지급한다', async () => {
  const { db, grant } = await setup(
    { orderId: 'ORD-F', sku: AIT, status: 'PURCHASED' },
    { MINI_SKU_ALIAS: JSON.stringify({ [AIT]: 'token_100' }) },
  );
  await grant({ orderId: 'ORD-F' });
  const again = await grant({ orderId: 'ORD-F' });
  assert.equal((await again.json()).granted, false);
  assert.equal(balance(db), 100);
});
