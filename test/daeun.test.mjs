// 대운(大運) — 10년마다 바뀌는 운의 흐름.
//
// 대운은 방향이 틀리면 결과가 통째로 반대가 된다. 방향은 연간(年干)의 음양과 성별로
// 갈리는데(양남음녀 순행), 성별을 잘못 넘기거나 기본값으로 때우면 남의 인생 흐름을
// 보여 주게 된다. 그래서 방향·구간·기운(起運) 시점을 명리 규칙과 대조해 고정한다.
//
// 돈이 걸린 쪽(3토큰 차감·환불)도 함께 본다.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1, balanceOf } from './d1-sqlite.mjs';

const { computeDaeun, handleDaeun, createSessionToken } =
  await loadWorker(['computeDaeun', 'handleDaeun', 'createSessionToken']);

const SECRET = 'test-secret';
const EMAIL  = 'daeun@example.com';
const BIRTH  = { year: 1990, month: 5, day: 15, hour: '사시' };   // 년주 庚午 — 연간 庚은 양(陽)
const realFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = realFetch; });

// ── 명리 규칙 ────────────────────────────────────────────

test('양간 해에 태어난 남자는 순행, 여자는 역행이다', () => {
  const male   = computeDaeun(BIRTH, 'M', 2026);
  const female = computeDaeun(BIRTH, 'F', 2026);

  assert.equal(male.forward, true,  '양남(陽男)은 순행이어야 한다');
  assert.equal(female.forward, false, '양녀(陽女)는 역행이어야 한다');
  // 방향이 반대면 간지도 반대로 흐른다 — 같은 값이 나오면 성별이 무시된 것이다
  assert.notEqual(male.periods[0].ganzhi, female.periods[0].ganzhi);
});

test('구간은 10년씩 이어지고, 기운 전 빈 칸은 빠진다', () => {
  const { periods } = computeDaeun(BIRTH, 'M', 2026);
  assert.ok(periods.length >= 8, `대운 구간이 너무 적다(${periods.length})`);

  for (const p of periods) {
    assert.match(p.ganzhi, /^.{2}$/, `간지가 비었거나 이상하다: ${JSON.stringify(p.ganzhi)}`);
    assert.equal(p.endYear - p.startYear, 9, `${p.ganzhi}: 한 대운은 10년이어야 한다`);
    assert.equal(p.endAge - p.startAge, 9, `${p.ganzhi}: 나이 폭이 10년이 아니다`);
    assert.ok(p.ganElem && p.zhiElem, `${p.ganzhi}: 오행이 비었다`);
  }
  for (let i = 1; i < periods.length; i++) {
    assert.equal(periods[i].startYear, periods[i - 1].endYear + 1,
      '대운 사이에 빈 해나 겹치는 해가 있다');
  }
});

test('지금 자리는 기준 연도를 품은 구간 하나뿐이다', () => {
  const { periods, current, next } = computeDaeun(BIRTH, 'M', 2026);

  assert.equal(periods.filter(p => p.current).length, 1, '지금 자리가 하나가 아니다');
  assert.ok(current.startYear <= 2026 && 2026 <= current.endYear);
  assert.equal(next.startYear, current.endYear + 1, '다음 대운이 이어지지 않는다');
});

test('세운은 기준 연도의 간지다', () => {
  // 2026년은 병오(丙午)년 — 세운이 대운 간지를 그대로 베끼면 안 된다.
  const { liunian, current } = computeDaeun(BIRTH, 'M', 2026);
  assert.equal(liunian.year, 2026);
  assert.equal(liunian.ganzhi, '丙午');
  assert.notEqual(liunian.ganzhi, current.ganzhi);
});

test('기운 전이면 지금 자리는 없고 첫 대운을 다음으로 안내한다', () => {
  const { current, next, periods } = computeDaeun(BIRTH, 'M', 1992);   // 첫 대운은 1997년부터
  assert.equal(current, null);
  assert.equal(next.startYear, periods[0].startYear);
});

test('태어난 시각을 알면 기운(起運) 시점이 달라진다', () => {
  // 기운은 절기까지의 거리로 정해지므로 시진이 실제로 반영돼야 한다.
  // 구간 경계는 해 단위라 시진을 넣어도 안 움직인다 — 움직이는 것은 이 간격이다.
  const withHour = computeDaeun({ ...BIRTH, hour: '해시' }, 'M', 2026);
  const noHour   = computeDaeun({ year: 1990, month: 5, day: 15 }, 'M', 2026);

  assert.notDeepEqual(withHour.qiyun, noHour.qiyun,
    '시진을 넘겨도 기운 시점이 그대로다 — 시각이 무시되고 있다');
  assert.ok(Number.isInteger(noHour.qiyun.years) && noHour.qiyun.years >= 0);
});

test('성별이 없으면 대운을 세우지 않는다', () => {
  assert.equal(computeDaeun(BIRTH, '', 2026), null);
  assert.equal(computeDaeun(BIRTH, 'X', 2026), null);
  assert.equal(computeDaeun({ year: 0, month: 0, day: 0 }, 'M', 2026), null);
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

const post = (token, body) => new Request('https://x/api/daeun', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

test('정상 응답이면 3토큰이 빠지고 화면이 읽는 필드가 다 있다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: '지금은 甲申(갑신) 대운입니다.' }] } }] }),
    { status: 200 });

  const res = await handleDaeun(post(token, { birth: BIRTH, gender: 'M', lang: 'ko' }), env);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(balanceOf(db, EMAIL), 7);
  assert.equal(data.remaining, 7);
  // js/app.js 의 _daeunRowHtml 이 읽는 필드들 — 이름이 바뀌면 화면에 undefined 가 뜬다
  for (const f of ['ganzhi', 'ganElem', 'zhiElem', 'startYear', 'endYear', 'startAge', 'endAge', 'current']) {
    assert.ok(data.periods[0][f] !== undefined, `화면이 읽는 필드가 없다: ${f}`);
  }
  assert.ok(data.pillars.dp && data.pillars.dayGan, '네 기둥이 함께 와야 타임라인 위에 띄운다');
  assert.equal(typeof data.forward, 'boolean');
});

test('성별이 없으면 차감 없이 400', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  const res = await handleDaeun(post(token, { birth: BIRTH }), env);

  assert.equal(res.status, 400);
  assert.equal(called, false, '대운을 세우지도 못했는데 Gemini 를 불렀다');
  assert.equal(balanceOf(db, EMAIL), 10);
});

test('잔액이 모자라면 차감도 호출도 없다', async () => {
  const { db, env } = setup(2);   // 3토큰짜리인데 2개뿐
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  const res = await handleDaeun(post(token, { birth: BIRTH, gender: 'F' }), env);

  assert.equal(res.status, 402);
  assert.equal(called, false);
  assert.equal(balanceOf(db, EMAIL), 2);
});

test('Gemini 가 던져도 3토큰이 돌아온다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => { throw new TypeError('network error'); };

  const res = await handleDaeun(post(token, { birth: BIRTH, gender: 'M' }), env);

  assert.ok(res.status >= 400);
  assert.equal(balanceOf(db, EMAIL), 10, '차감만 남고 환불되지 않았다');
});

test('인증 없이는 볼 수 없다', async () => {
  const { env } = setup();
  const res = await handleDaeun(
    new Request('https://x/api/daeun', { method: 'POST', body: '{}' }), env);
  assert.equal(res.status, 401);
});
