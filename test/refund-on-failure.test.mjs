// 유료 기능이 실패했을 때 토큰이 사라지지 않는지.
//
// 각 핸들러는 "차감 → Gemini 호출 → 실패하면 환불" 순서로 되어 있는데, 환불은 `!resp.ok` 인
// 경우에만 돈다. fetch 자체가 던지면(커넥션 리셋·DNS·타임아웃·서브리퀘스트 한도) 그 분기를
// 건너뛰고 바깥 catch 로 빠져 500 만 돌려준다 — 차감은 이미 끝난 뒤라 토큰이 조용히 사라진다.
// 사용자 입장에선 "아무것도 못 받았는데 토큰만 줄었다"가 된다.
//
// 여기서는 global fetch 를 강제로 실패시켜 그 경로를 그대로 만든다.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1, balanceOf } from './d1-sqlite.mjs';

const {
  handleTarotDraw, handleDetailReading, handleIching, createSessionToken,
  handleAuspiciousDays, handleDaeun, handleNameReading, handleCompatTiming,
} = await loadWorker([
  'handleTarotDraw', 'handleDetailReading', 'handleIching', 'createSessionToken',
  'handleAuspiciousDays', 'handleDaeun', 'handleNameReading', 'handleCompatTiming',
]);

const SECRET = 'test-secret';
const EMAIL  = 'paid@example.com';
const BIRTH  = { year: 1990, month: 5, day: 15, hour: '자시' };
const realFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = realFetch; });

function setup(startingTokens = 10) {
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO payment_requests (id,user_email,pkg,amount,tokens,status,approved_at)
     VALUES ('seed',?,'test',0,?,'approved',unixepoch())`
  ).run(EMAIL, startingTokens);
  return { db, env: { SESSION_SECRET: SECRET, GEMINI_API_KEY: 'k', DB } };
}

const post = (url, token, body = {}) => new Request(`https://x${url}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

// Gemini 호출만 실패시킨다(다른 fetch 가 있으면 원래대로).
function failGemini() {
  globalThis.fetch = async (url, ...rest) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      throw new TypeError('network error');
    }
    return realFetch(url, ...rest);
  };
}

const cases = [
  { name: '타로 뽑기',   cost: 1, run: (env, t) => handleTarotDraw(post('/api/tarot-draw', t), env) },
  { name: '주역 괘',     cost: 1, run: (env, t) => handleIching(post('/api/iching', t), env) },
  {
    name: '상세 풀이', cost: 2,
    run: (env, t) => handleDetailReading(
      post('/chat-detail', t, { category: 'love', date: '2026-08-08', ohaeng: '木' }), env),
  },
  // 아래 넷은 인라인 fetch 를 geminiText 로 바꾼 핸들러다. geminiText 는 !resp.ok 를 ''로
  // 흡수하므로 실패 분기가 `!resp.ok || !reading` 에서 `!reading` 하나로 줄었다 —
  // 그 과정에서 환불이 빠지지 않았는지 구조 검사가 아니라 실제 잔액으로 확인한다.
  { name: '택일', cost: 2, run: (env, t) => handleAuspiciousDays(
      post('/api/auspicious-days', t, { purpose: 'wedding' }), env) },
  { name: '대운', cost: 3, run: (env, t) => handleDaeun(
      post('/api/daeun', t, { birth: BIRTH, gender: 'M' }), env) },
  { name: '이름 풀이', cost: 2, run: (env, t) => handleNameReading(
      post('/api/name-reading', t, { name: '김보람', birth: BIRTH }), env) },
  { name: '궁합 시기', cost: 3, run: (env, t) => handleCompatTiming(
      post('/api/compat-timing', t, {
        p1: { ...BIRTH, gender: 'M' },
        p2: { year: 1992, month: 3, day: 3, hour: '오시', gender: 'F' },
      }), env) },
];

for (const c of cases) {
  test(`${c.name} — Gemini 호출이 던져도 토큰이 사라지지 않는다`, async () => {
    const { db, env } = setup();
    const token = await createSessionToken(EMAIL, env);
    failGemini();

    const res = await c.run(env, token);

    assert.ok(res.status >= 400, '실패는 실패로 알려야 한다');
    assert.equal(balanceOf(db, EMAIL), 10,
      `${c.cost}토큰이 차감된 채 환불되지 않았다`);
  });
}

test('Gemini 가 200 이 아닐 때도 잔액이 그대로다 (기존 환불 경로)', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => new Response('{}', { status: 500 });

  const res = await handleTarotDraw(post('/api/tarot-draw', token), env);

  assert.equal(res.status, 422);
  assert.equal(balanceOf(db, EMAIL), 10);
});

test('geminiText 로 바꾼 핸들러도 500 응답에 환불한다', async () => {
  // 인라인 fetch 때는 `!resp.ok` 가 이 경우를 잡았다. 이제 그 자리에 resp 가 없고
  // geminiText 가 ''를 돌려주는 것에 기대므로, 실제로 환불되는지 확인해 둔다.
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => new Response('{}', { status: 500 });

  const res = await handleNameReading(
    post('/api/name-reading', token, { name: '김보람', birth: BIRTH }), env);

  assert.equal(res.status, 422);
  assert.equal(balanceOf(db, EMAIL), 10, '2토큰이 차감된 채 환불되지 않았다');
});

test('geminiText 가 200 에 빈 본문을 받아도 환불한다', async () => {
  // 안전필터에 걸리면 200 인데 candidates 가 비어서 온다(finishReason=SAFETY 등).
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => new Response(
    JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }),
    { status: 200 });

  const res = await handleDaeun(
    post('/api/daeun', token, { birth: BIRTH, gender: 'M' }), env);

  assert.equal(res.status, 422);
  assert.equal(balanceOf(db, EMAIL), 10, '3토큰이 차감된 채 환불되지 않았다');
});

test('토큰을 차감하는 모든 핸들러가 환불 배선을 갖추고 있다', async () => {
  // 유료 기능이 새로 추가될 때 catch 환불을 빠뜨리면 그 기능만 조용히 토큰을 먹는다.
  // 런타임 테스트로 전부 덮으려면 요청 픽스처가 그만큼 필요하므로, 여기서는 소스 구조로 막는다.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'worker.js'), 'utf8');

  const starts = [...src.matchAll(/^(?:async function|function|const)/gm)].map(m => m.index);
  const spans = starts.map((s, i) => src.slice(s, starts[i + 1] ?? src.length));

  // 차감은 accountSpend 한 줄로 통일돼 있다(웹·미니앱 공용 계정 계층).
  const paid = spans.filter(s => /await accountSpend\(env, acct, /.test(s));
  // 개수가 바뀌면 여기서 걸린다. 새 유료 기능을 넣었다면 아래 배선 검사를 통과하는지
  // 확인한 뒤 숫자를 올릴 것 — 무심코 올리면 환불 없는 핸들러가 섞여 든다.
  assert.equal(paid.length, 23, `유료 핸들러 개수가 달라졌다(${paid.length}) — 아래 검사도 함께 확인할 것`);

  for (const span of paid) {
    const name = (span.match(/^async function (\w+)/) || [])[1] || span.slice(0, 40);
    assert.match(span, /refund = \(\) => accountRefund\(env, acct, '[a-z_]+', (\d+|COST)\);/,
      `${name}: 차감 직후 refund 클로저가 없다`);
    assert.match(span, /if \(refund\) await refund\(\)\.catch\(\(\) => \{\}\);/,
      `${name}: catch 에서 환불하지 않는다 — 예외가 나면 토큰이 사라진다`);
    assert.doesNotMatch(span, /const refundId = /,
      `${name}: 인라인 환불이 남아 있다 — accountRefund 로 통일할 것`);
    // 옛 이메일 기반 경로가 남아 있으면 미니앱 사용자가 웹 원장에 얹힌다.
    assert.doesNotMatch(span, /refundTokens\(env, email|INSERT INTO payment_requests/,
      `${name}: 이메일 기반 원장 접근이 남아 있다`);
  }
});

test('잔액이 모자라면 차감도 호출도 일어나지 않는다', async () => {
  const { db, env } = setup(0);
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  const res = await handleTarotDraw(post('/api/tarot-draw', token), env);

  assert.equal(res.status, 402);
  assert.equal(called, false, '잔액이 없는데 Gemini 를 불렀다');
  assert.equal(balanceOf(db, EMAIL), 0);
});
