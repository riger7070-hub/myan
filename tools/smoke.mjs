// 배포본을 실제로 두드려 보는 점검.
//
//   node tools/smoke.mjs              배포본(myan.riger7070.workers.dev)
//   node tools/smoke.mjs http://…     다른 대상
//
// 왜 필요한가: CI 는 초록인데 프로덕션이 망가져 있을 수 있다. npm test 는 D1·Gemini·토스를
// 하나도 건드리지 않고, wrangler deploy --dry-run 은 번들이 만들어지는지만 본다. 실제로
// 인앱결제가 출시 첫날까지 통째로 안 됐는데 아무 검사도 걸리지 않았고, 사람이 버튼을 눌러
// 보고서야 알았다. 그 구멍을 메우는 자리다.
//
// ⚠️ 돈이 드는 일은 하지 않는다. 유료 리딩을 부르면 엽전이 빠지고 Gemini 요금이 나가므로,
// 여기서는 **로그인 없이 볼 수 있는 계약**만 확인한다. 그래도 오늘 겪은 종류의 사고
// (상품 매핑이 비어 결제가 통째로 막힘, 인증이 열림, 배포 자체가 안 나감)는 전부 잡힌다.
//
// 판매가는 여기에 적지 않고 worker.js 의 MINI_PRODUCTS 를 그대로 읽어 맞춰 본다. 값을
// 베껴 적었더니 곧바로 어긋났다 — 콘솔 공급가에 맞춰 10엽전이 4,290원으로 바뀌었는데
// 이 파일만 3,850원을 들고 있었다. 코드에서 읽으면 낡을 수가 없고, 덤으로 '배포본이 이
// 체크아웃과 같은가'까지 보게 된다. 실제로 로컬이 19커밋 뒤처진 것을 이 검사가 잡았다.

import { loadWorker } from '../test/load-worker.mjs';

const { MINI_PRODUCTS } = await loadWorker(['MINI_PRODUCTS']);

const BASE = (process.argv[2] || 'https://myan.riger7070.workers.dev').replace(/\/$/, '');
const TIMEOUT_MS = 20000;

let pass = 0;
const fails = [];

async function check(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  OK   ${name}`);
  } catch (e) {
    fails.push({ name, message: e?.message || String(e) });
    console.log(`  FAIL ${name}\n         ${e?.message || e}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function get(path, init = {}) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* HTML 이면 그대로 둔다 */ }
  return { res, text, json };
}

console.log(`대상: ${BASE}\n`);

// ── 서비스가 살아 있는가 ──
await check('첫 화면이 뜬다', async () => {
  const { res, text } = await get('/');
  assert(res.status === 200, `상태 ${res.status}`);
  assert(/<html/i.test(text), 'HTML 이 아니다');
});

await check('보안 헤더가 붙어 있다', async () => {
  const { res } = await get('/');
  // 워커가 자산보다 먼저 돌면서 넣는 값이다. 빠졌다면 run_worker_first 가 풀린 것이다.
  assert(res.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options 없음');
  assert(res.headers.get('strict-transport-security'), 'HSTS 없음');
});

await check('법적 고지 페이지가 살아 있다', async () => {
  for (const p of ['/privacy-policy', '/terms']) {
    const { res } = await get(p);
    assert(res.status === 200, `${p} 상태 ${res.status}`);
  }
});

// ── 미니앱 결제가 열려 있는가 (오늘 터진 그 자리) ──
const WANT = new Map(Object.values(MINI_PRODUCTS).map(p => [p.tokens, p.amount]));
const tokenList = m => [...m].map(([t]) => t).sort((a, b) => a - b).join(',');

await check(`판매 상품이 ${WANT.size}종 열려 있다`, async () => {
  const { res, json } = await get('/mini/api/products');
  assert(res.status === 200, `상태 ${res.status}`);
  assert(Array.isArray(json?.products), 'products 가 배열이 아니다');
  assert(json.products.length === WANT.size,
    `판매 가능 ${json.products.length}종 — MINI_SKU_ALIAS 가 비었거나 콘솔 상품이 바뀌었다`);
});

await check('상품 구성이 이 체크아웃과 같다', async () => {
  const { json } = await get('/mini/api/products');
  for (const p of json.products) {
    const amount = WANT.get(p.tokens);
    assert(amount !== undefined,
      `모르는 지급량 ${p.tokens}엽전 — 배포본이 이 체크아웃보다 새롭다(git pull)`);
    assert(amount === p.amount,
      `${p.tokens}엽전이 배포본 ${p.amount}원 · 이 체크아웃 ${amount}원 — ` +
      '배포본이 낡았거나(git push 안 됨) 콘솔 공급가가 바뀌었다');
    assert(typeof p.sku === 'string' && p.sku.length > 0, 'sku 가 비었다');
  }
  const got = tokenList(new Map(json.products.map(p => [p.tokens, p.amount])));
  assert(got === tokenList(WANT), `지급량 구성이 ${got} — 이 체크아웃은 ${tokenList(WANT)}`);
});

// ── 인증이 실제로 닫혀 있는가 ──
await check('로그인 없이 잔액을 못 본다', async () => {
  const { res } = await get('/mini/api/tokens');
  assert(res.status === 401, `상태 ${res.status} — 인증이 열려 있다`);
});

await check('로그인 없이 지급을 못 부른다', async () => {
  const { res } = await get('/mini/api/payment/grant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'smoke-test-not-a-real-order' }),
  });
  assert(res.status === 401, `상태 ${res.status} — 지급 경로 인증이 열려 있다`);
});

await check('가짜 토큰이 통과하지 못한다', async () => {
  const { res } = await get('/mini/api/tokens', {
    headers: { Authorization: 'Bearer mini:someone-elses-key' },
  });
  assert(res.status === 401, `상태 ${res.status} — 서명 없는 토큰이 통과한다`);
});

// ── 결과 ──
console.log(`\n통과 ${pass} · 실패 ${fails.length}`);
if (fails.length) {
  console.log('\n실패한 항목:');
  for (const f of fails) console.log(`  · ${f.name} — ${f.message}`);
  process.exit(1);
}
