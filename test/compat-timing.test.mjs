// 궁합 심화 — 두 사람에게 언제가 좋은 시기인지.
//
// 판단은 세운(그 해의 지지)이 각자의 일지와 맺는 관계 하나에 걸려 있다. 육합·삼합·충
// 표가 한 칸이라도 어긋나면 좋은 해와 나쁜 해가 뒤바뀌는데, 화면에는 여전히 그럴듯한
// 글이 뜬다. 그래서 관계 판정을 지지 글자로 못박고, 시기 목록이 실제로 그 판정을
// 따르는지까지 본다.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1, balanceOf } from './d1-sqlite.mjs';

const { branchRelation, computeCompatTiming, handleCompatTiming, createSessionToken } =
  await loadWorker(['branchRelation', 'computeCompatTiming', 'handleCompatTiming', 'createSessionToken']);

const SECRET = 'test-secret';
const EMAIL  = 'compat@example.com';
const P1 = { year: 1990, month: 5, day: 15, hour: '사시', gender: 'M', name: '가' };
const P2 = { year: 1992, month: 9, day: 3,  hour: '오시', gender: 'F', name: '나' };
const realFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = realFetch; });

// ── 지지 관계 ────────────────────────────────────────────

test('육합·삼합·충을 지지 글자대로 가른다', () => {
  assert.equal(branchRelation('子', '丑').relation, 'yukhap');   // 자축합
  assert.equal(branchRelation('午', '未').relation, 'yukhap');
  assert.equal(branchRelation('申', '辰').relation, 'samhap');   // 신자진
  assert.equal(branchRelation('寅', '戌').relation, 'samhap');   // 인오술
  assert.equal(branchRelation('子', '午').relation, 'chung');    // 자오충
  assert.equal(branchRelation('卯', '酉').relation, 'chung');
  assert.equal(branchRelation('子', '寅').relation, 'none');
});

test('합과 충이 겹치면 충이 이긴다', () => {
  // 卯는 戌과 육합이면서 酉와 충이다. 충인 쪽이 충으로 잡혀야 한다.
  assert.equal(branchRelation('卯', '酉').relation, 'chung');
  assert.ok(branchRelation('卯', '酉').score < 0);
  assert.ok(branchRelation('卯', '戌').score > 0);
});

test('같은 지지는 삼합으로 세지 않는다', () => {
  // 삼합 조에 같이 들어 있다는 이유로 자기 자신과 합이 되면 안 된다
  assert.equal(branchRelation('子', '子').relation, 'none');
  assert.equal(branchRelation('午', '午').relation, 'none');
});

test('모르는 글자에는 점수를 주지 않는다', () => {
  assert.equal(branchRelation('', '子').score, 0);
  assert.equal(branchRelation('X', '子').relation, 'none');
  assert.equal(branchRelation('子', undefined).score, 0);
});

// ── 시기 목록 ────────────────────────────────────────────

test('요청한 햇수만큼 이어서 나오고 점수는 판정과 맞는다', () => {
  const r = computeCompatTiming({ birth: P1, gender: 'M' }, { birth: P2, gender: 'F' }, 2026, 10);

  assert.equal(r.timeline.length, 10);
  r.timeline.forEach((t, i) => assert.equal(t.year, 2026 + i, '연도가 이어지지 않는다'));

  for (const t of r.timeline) {
    const expect = branchRelation(t.ganzhi[1], r.dayZhi.a).score
                 + branchRelation(t.ganzhi[1], r.dayZhi.b).score;
    assert.equal(t.score, expect, `${t.year}: 점수가 관계 판정과 다르다`);
  }
});

test('좋은 해는 점수순으로, 같으면 가까운 해가 먼저다', () => {
  const { best, timeline } = computeCompatTiming({ birth: P1, gender: 'M' }, { birth: P2, gender: 'F' }, 2026, 10);

  assert.equal(best.length, 3);
  assert.equal(best[0].score, Math.max(...timeline.map(t => t.score)), '가장 높은 점수의 해가 앞에 없다');
  for (let i = 1; i < best.length; i++) {
    assert.ok(best[i - 1].score >= best[i].score);
    if (best[i - 1].score === best[i].score) assert.ok(best[i - 1].year < best[i].year);
  }
});

test('성별을 주면 그 해의 대운이 함께 붙는다', () => {
  const withG = computeCompatTiming({ birth: P1, gender: 'M' }, { birth: P2, gender: 'F' }, 2026, 3);
  const noG   = computeCompatTiming({ birth: P1, gender: null }, { birth: P2, gender: null }, 2026, 3);

  assert.ok(withG.timeline[0].a.daeun, '성별을 줬는데 대운이 비었다');
  assert.equal(noG.timeline[0].a.daeun, null, '성별이 없는데 대운이 붙었다');
  // 대운이 없어도 시기 판정 자체는 그대로 나와야 한다
  assert.equal(noG.timeline[0].score, withG.timeline[0].score);
});

test('생년월일이 틀리면 세우지 않는다', () => {
  assert.equal(computeCompatTiming({ birth: {} }, { birth: P2 }, 2026, 5), null);
});

// ── 토큰 ─────────────────────────────────────────────────

function setup(startingTokens = 10) {
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO payment_requests (id,user_email,pkg,amount,tokens,status,approved_at)
     VALUES ('seed',?,'test',0,?,'approved',unixepoch())`
  ).run(EMAIL, startingTokens);
  return { db, env: { SESSION_SECRET: SECRET, GEMINI_API_KEY: 'k', DB } };
}

const post = (token, body) => new Request('https://x/api/compat-timing', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

test('정상 응답이면 6토큰이 빠지고 화면이 읽는 필드가 다 있다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: '2027년이 가장 좋습니다.' }] } }] }),
    { status: 200 });

  const res = await handleCompatTiming(post(token, { p1: P1, p2: P2, lang: 'ko' }), env);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(balanceOf(db, EMAIL), 4);
  assert.equal(data.timeline.length, 10);
  for (const f of ['year', 'ganzhi', 'a', 'b', 'score']) {
    assert.ok(data.timeline[0][f] !== undefined, `화면이 읽는 필드가 없다: ${f}`);
  }
  assert.equal(data.nameA, '가');
  assert.ok(data.best[0].year >= data.fromYear);
});

test('한쪽 생년월일이 없으면 차감 없이 400', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  const res = await handleCompatTiming(post(token, { p1: P1 }), env);

  assert.equal(res.status, 400);
  assert.equal(called, false);
  assert.equal(balanceOf(db, EMAIL), 10);
});

test('잔액이 모자라면 차감도 호출도 없다', async () => {
  const { db, env } = setup(2);
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  const res = await handleCompatTiming(post(token, { p1: P1, p2: P2 }), env);

  assert.equal(res.status, 402);
  assert.equal(called, false);
  assert.equal(balanceOf(db, EMAIL), 2);
});

test('Gemini 가 던져도 6토큰이 돌아온다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => { throw new TypeError('network error'); };

  const res = await handleCompatTiming(post(token, { p1: P1, p2: P2 }), env);

  assert.ok(res.status >= 400);
  assert.equal(balanceOf(db, EMAIL), 10, '차감만 남고 환불되지 않았다');
});

test('인증 없이는 볼 수 없다', async () => {
  const { env } = setup();
  const res = await handleCompatTiming(
    new Request('https://x/api/compat-timing', { method: 'POST', body: '{}' }), env);
  assert.equal(res.status, 401);
});
