// Gemini 호출을 geminiText 한 곳으로 모은 뒤, 그 결과가 **요금으로 드러나는지** 본다.
//
// 구조 검사(안도령 인격·거름망)는 "호출이 한 곳인가"만 본다. 여기서는 실제로 핸들러를
// 두 번 불러서 Gemini 가 몇 번 불렸는지 센다 — 캐시가 붙었다고 적어 두고 실제로는
// 매번 부르고 있으면 구조 검사는 통과하고 청구서만 는다.
//
// ⚠️ 캐시는 **호출을 건너뛰는 것이지 차감을 건너뛰는 것이 아니다.** 두 번째 요청도
// 엽전은 그대로 빠진다(CLAUDE.md). 그 둘을 함께 못 박는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const H = await loadWorker(['handleTojeong', 'handleFortuneTopic', 'handleLottoNumbers', 'createSessionToken']);

const SECRET = 'consolidation-secret';
const EMAIL = 'cache@example.com';
const BIRTH = { year: 1999, month: 7, day: 18, hour: '사시' };
const realFetch = globalThis.fetch;

function setup(tokens = 500) {
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO payment_requests (id,user_email,pkg,amount,tokens,status,approved_at)
     VALUES ('seed',?,'t',0,?,'approved',unixepoch())`
  ).run(EMAIL, tokens);
  return { db, env: { SESSION_SECRET: SECRET, GEMINI_API_KEY: 'k', DB } };
}

const balanceOf = (db) => db.prepare(
  `SELECT COALESCE(SUM(tokens),0) n FROM payment_requests WHERE user_email = ? AND status='approved'`
).get(EMAIL).n;

/** Gemini 호출 횟수를 센다. 매번 다른 글을 주므로, 같은 글이 두 번 나오면 캐시가 산 것이다. */
function countingGemini() {
  const state = { calls: 0 };
  globalThis.fetch = async (url, opts, ...rest) => {
    if (String(url).includes('generativelanguage')) {
      state.calls++;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: `안도령이 이르되, ${state.calls}번째 글입니다.\n\n두 번째 문단입니다.` }] } }],
      }), { status: 200 });
    }
    return realFetch(url, opts, ...rest);
  };
  return state;
}

async function call(name, env, body) {
  const token = await H.createSessionToken(EMAIL, env);
  const req = new Request('https://x/api/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ lang: 'ko', ...body }),
  });
  const res = await H[name](req, env);
  return { status: res.status, data: JSON.parse(await res.text()) };
}

for (const [name, body, label] of [
  ['handleTojeong', { birth: BIRTH }, '토정비결'],
  ['handleFortuneTopic', { topic: 'crush', birth: BIRTH }, '주제별 운세'],
]) {
  test(`${label}: 같은 요청을 두 번 해도 Gemini 는 한 번만 부른다`, async () => {
    const { env } = setup();
    const g = countingGemini();
    try {
      const a = await call(name, env, body);
      const b = await call(name, env, body);
      assert.equal(a.status, 200, `첫 요청이 ${a.status}`);
      assert.equal(b.status, 200, `두 번째 요청이 ${b.status}`);
      assert.equal(g.calls, 1, `Gemini 를 ${g.calls}번 불렀다 — 캐시가 안 산다`);
      assert.equal(a.data.reading, b.data.reading, '두 번째가 다른 글이다 — 캐시를 안 탔다');
    } finally { globalThis.fetch = realFetch; }
  });

  test(`${label}: 캐시가 살아도 엽전은 그대로 빠진다`, async () => {
    // 캐시는 호출을 건너뛰는 것이지 값을 깎아 주는 것이 아니다.
    const { db, env } = setup(20);
    countingGemini();
    try {
      const before = balanceOf(db);
      await call(name, env, body);
      const once = balanceOf(db);
      await call(name, env, body);
      const twice = balanceOf(db);
      const cost = before - once;
      assert.ok(cost > 0, '첫 요청에서 아무것도 안 빠졌다');
      assert.equal(once - twice, cost,
        `두 번째 요청에서 ${once - twice} 빠졌다 — 캐시 적중이 차감을 건너뛰면 안 된다`);
    } finally { globalThis.fetch = realFetch; }
  });
}

test('로또는 번호가 매번 달라진다', async () => {
  // ⚠️ 여기서 Gemini 호출 횟수를 세는 것으로는 캐시 여부를 알 수 없다. 프롬프트에
  // 뽑은 번호가 들어가 매번 키가 달라지므로, 캐시를 붙여도 적중하지 않아 호출은
  // 그대로 두 번이다(그렇게 붙여 봤더니 검사가 통과했다). 사용자가 실제로 보는 것
  // — 번호가 달라지는가 — 을 본다.
  const { env } = setup();
  countingGemini();
  try {
    const a = await call('handleLottoNumbers', env, {});
    const b = await call('handleLottoNumbers', env, {});
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.notDeepEqual(a.data.numbers, b.data.numbers, '두 번 다 같은 번호가 나왔다');
  } finally { globalThis.fetch = realFetch; }
});

test('뽑기가 들어가는 콘텐츠에 cachedReading 을 붙이지 않았다', async () => {
  // 로또·타로·룬·주역은 뽑는 재미가 절반이다. 지금은 프롬프트에 뽑은 값이 들어가서
  // 캐시를 붙여도 적중하지 않지만, 프롬프트가 결정적으로 바뀌는 순간 모두가 같은
  // 번호를 보게 된다. 그때는 이미 늦으므로 구조로 막는다.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'worker.js'), 'utf8');

  for (const fn of ['handleLottoNumbers', 'handleTarotDraw', 'handleRuneReading', 'handleIching']) {
    const i = src.indexOf('async function ' + fn + '(');
    assert.ok(i > 0, fn + ' 을 못 찾았다');
    const span = src.slice(i, src.indexOf('\nasync function ', i + 10));
    assert.doesNotMatch(span, /cachedReading\(/,
      `${fn} 이 cachedReading 을 쓴다 — 뽑기가 굳어 모두가 같은 결과를 본다`);
  }
});

test('캐시가 비어 있어도 첫 요청은 정상으로 나간다', async () => {
  // 캐시 조회가 실패하면 조용히 지나가고 새로 지어야 한다(cachedReading 이 그렇게 돼 있다).
  const { env } = setup();
  const g = countingGemini();
  try {
    const r = await call('handleTojeong', env, { birth: BIRTH });
    assert.equal(r.status, 200);
    assert.equal(g.calls, 1);
    assert.ok(r.data.reading?.length > 5, '풀이가 비었다');
  } finally { globalThis.fetch = realFetch; }
});

// ── 환불 ──
//
// 이번 변경으로 실패 판정이 `!resp.ok || !reading` 에서 `!reading` 하나로 바뀌었다.
// geminiText 가 실패하면 빈 문자열을 주므로 결과는 같아야 하지만, "같아야 한다"는
// 논증이지 증거가 아니다. 엽전이 걸린 자리라 실제로 굴려서 확인한다.
// (refund-on-failure 는 이 여섯 중 둘만 런타임으로 덮고 있었다.)

const REFUND_CASES = [
  ['handleTojeong', { birth: BIRTH }],
  ['handleFortuneTopic', { topic: 'crush', birth: BIRTH }],
  ['handleAstroTransit', { birth: BIRTH }],
  ['handleDreamInterpretation', { dream: '맑은 물에서 잉어를 봤어요' }],
  ['handleLottoNumbers', {}],
];

const FAILURES = {
  '연결이 끊기면': () => { globalThis.fetch = async () => { throw new Error('boom'); }; },
  '500 이 오면': () => {
    globalThis.fetch = async (u, o, ...r) => String(u).includes('generativelanguage')
      ? new Response('{"error":{"message":"nope"}}', { status: 500 }) : realFetch(u, o, ...r);
  },
  '200 인데 본문이 비면': () => {
    globalThis.fetch = async (u, o, ...r) => String(u).includes('generativelanguage')
      ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '' }] } }] }), { status: 200 })
      : realFetch(u, o, ...r);
  },
};

const NEEDED = await loadWorker([...REFUND_CASES.map(c => c[0]), 'createSessionToken']);

for (const [name, body] of REFUND_CASES) {
  for (const [label, breakIt] of Object.entries(FAILURES)) {
    test(`${name}: ${label} 엽전이 그대로 남는다`, async () => {
      const { db, env } = setup(20);
      breakIt();
      try {
        const token = await NEEDED.createSessionToken(EMAIL, env);
        const req = new Request('https://x/api/x', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ lang: 'ko', ...body }),
        });
        const before = balanceOf(db);
        const res = await NEEDED[name](req, env);
        assert.notEqual(res.status, 200, `실패를 만들었는데 ${res.status} 가 나왔다`);
        assert.equal(balanceOf(db), before,
          `차감된 채 환불되지 않았다 (${before} → ${balanceOf(db)})`);
      } finally { globalThis.fetch = realFetch; }
    });
  }
}
