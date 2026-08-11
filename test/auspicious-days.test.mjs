// 택일(擇日) — 역서 데이터로 날을 고르는 부분.
//
// 이 기능의 값어치는 "AI 가 그럴듯한 날짜를 지어내지 않는다"는 데 있다. 날짜 선별은
// 전부 pickAuspiciousDays 안에서 lunar-javascript 의 일진 의기(宜忌)·길신·흉살로만
// 결정되므로, 여기서는 그 규칙이 실제 역서와 어긋나지 않는지 같은 라이브러리로 되짚어
// 검증한다(핸들러가 부르는 라이브러리를 테스트가 다시 부르는 형태라, 규칙이 바뀌면 깨진다).
//
// 돈이 걸린 쪽도 함께 본다 — 고를 날이 없으면 차감이 일어나면 안 되고, Gemini 가 던지면
// 이미 뺀 2토큰이 돌아와야 한다.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import LunarPkg from 'lunar-javascript';
import { loadWorker } from './load-worker.mjs';
import { createD1, balanceOf } from './d1-sqlite.mjs';

const { Solar } = LunarPkg;
const { pickAuspiciousDays, handleAuspiciousDays, TAKIL_PURPOSES, createSessionToken } =
  await loadWorker(['pickAuspiciousDays', 'handleAuspiciousDays', 'TAKIL_PURPOSES', 'createSessionToken']);

const SECRET = 'test-secret';
const EMAIL  = 'takil@example.com';
const START  = { year: 2026, month: 9, day: 1 };   // 선별 규칙 검증은 고정 날짜로
const realFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = realFetch; });

// ── 선별 규칙 ────────────────────────────────────────────

test('고른 날은 모두 그 일이 의(宜)에 있고, 기(忌)인 날은 하나도 없다', () => {
  for (const [key, p] of Object.entries(TAKIL_PURPOSES)) {
    const days = pickAuspiciousDays(key, START, { days: 90 });
    assert.ok(days.length > 0, `${key}: 90일 안에 후보가 하나도 없다`);

    for (const d of days) {
      const [y, m, dd] = d.ymd.split('-').map(Number);
      const lunar = Solar.fromYmd(y, m, dd).getLunar();
      const yi = lunar.getDayYi(), ji = lunar.getDayJi();

      assert.ok(p.yi.some(k => yi.includes(k)),
        `${key} ${d.ymd}: 의(宜)에 없는 날을 골랐다 — ${yi.join(',')}`);
      assert.ok(!p.ji.some(k => ji.includes(k)),
        `${key} ${d.ymd}: 기(忌)인 날을 골랐다 — ${ji.join(',')}`);
      assert.ok(!ji.includes('诸事不宜'),
        `${key} ${d.ymd}: 제사불의(諸事不宜) 날을 골랐다`);
    }
  }
});

test('띠를 주면 그 띠를 충하는 날은 빠진다', () => {
  // 午(말띠)를 충하는 날은 일지가 子(쥐)인 날 — 역서의 충(冲)이 그대로 걸러져야 한다.
  const withZhi    = pickAuspiciousDays('wedding', START, { days: 120, yearZhi: '午' });
  const withoutZhi = pickAuspiciousDays('wedding', START, { days: 120 });

  assert.ok(withoutZhi.some(d => d.chong === '午'),
    '충 제외를 검증할 표본이 없다 — 기간을 늘릴 것');
  assert.equal(withZhi.filter(d => d.chong === '午').length, 0,
    '본명(띠)을 충하는 날이 후보에 남았다');
  assert.ok(withZhi.length < withoutZhi.length, '띠를 줬는데 걸러진 날이 없다');
});

test('점수 내림차순으로, 같은 점수면 가까운 날이 먼저 온다', () => {
  const days = pickAuspiciousDays('moving', START, { days: 120 });
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1], cur = days[i];
    assert.ok(prev.score >= cur.score, `${prev.ymd}(${prev.score}) 뒤에 ${cur.ymd}(${cur.score})`);
    if (prev.score === cur.score) {
      assert.ok(prev.ymd < cur.ymd, `동점인데 먼 날(${prev.ymd})이 앞에 있다`);
    }
  }
});

test('길신은 점수를 올리고 흉살은 내린다', () => {
  // 점수가 의(宜) 적중 수만으로 정해지면 길신·흉살 표가 죽은 코드가 된다.
  const days = pickAuspiciousDays('ritual', START, { days: 120 });
  const sameHits = days.filter(d => d.hits.length === days[0].hits.length);
  assert.ok(new Set(sameHits.map(d => d.score)).size > 1,
    '의(宜) 적중 수가 같은 날들의 점수가 전부 같다 — 길신·흉살이 점수에 반영되지 않는다');
});

test('모르는 목적이면 null 을 준다', () => {
  assert.equal(pickAuspiciousDays('vacation', START), null);
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

const post = (token, body) => new Request('https://x/api/auspicious-days', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

const geminiOk = text => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
};

// 후보가 없는 구간을 오늘 이후에서 직접 찾는다. 날짜를 상수로 박으면 그 날이 지나는 순간
// (핸들러는 과거 시작일을 거부한다) 테스트가 시한폭탄이 된다.
function findEmptyWindow(purposeKey, span) {
  const p = TAKIL_PURPOSES[purposeKey];
  // ⚠️ 기준일은 핸들러와 같은 KST 여야 한다. UTC 로 잡으면 00:00~09:00 KST 사이에
  // '오늘'이 한국의 어제가 되고, 핸들러는 지난 날을 400 으로 막는다 — 404 를 기대하는
  // 이 테스트가 하루 중 아홉 시간 동안만 깨진다(핸들러의 _kstYmd 와 맞춘다).
  const kst = new Date(Date.now() + 9 * 3600000);
  let solar = Solar.fromYmd(kst.getUTCFullYear(), kst.getUTCMonth() + 1, kst.getUTCDate());
  for (let i = 0; i < 600; i++, solar = solar.next(1)) {
    const start = { year: solar.getYear(), month: solar.getMonth(), day: solar.getDay() };
    if (!pickAuspiciousDays(purposeKey, start, { days: span }).length) return solar.toYmd();
  }
  assert.fail(`${purposeKey}: ${span}일 내내 후보가 없는 구간을 못 찾았다 (${p.yi.join(',')})`);
}

test('고를 날이 없으면 토큰을 차감하지 않는다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  // 求医·治病 은 역서에 드물게 나와 비는 구간이 실제로 생긴다.
  const from = findEmptyWindow('medical', 7);
  const res = await handleAuspiciousDays(post(token, { purpose: 'medical', from, days: 7 }), env);

  assert.equal(res.status, 404);
  assert.equal(called, false, '고를 날도 없는데 Gemini 를 불렀다');
  assert.equal(balanceOf(db, EMAIL), 10, '결과를 못 줬는데 토큰이 빠졌다');
});

test('정상 응답이면 2토큰이 빠지고 용어는 자국어로 나간다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  geminiOk('9월 3일이 가장 좋습니다.');

  const res = await handleAuspiciousDays(post(token, { purpose: 'wedding', lang: 'ko', days: 90 }), env);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(balanceOf(db, EMAIL), 8);
  assert.equal(data.remaining, 8);
  assert.ok(data.picks.length > 0 && data.picks.length <= 5);
  assert.match(data.picks[0].ymd, /^\d{4}-\d{2}-\d{2}$/);
  // js/app.js 의 _takilDayHtml 이 읽는 필드들. 이름이 하나라도 바뀌면 화면에 undefined 가 뜨는데,
  // 그건 배포 후 눈으로 봐야 알 수 있으므로 여기서 응답 모양으로 붙잡아 둔다.
  for (const f of ['ymd', 'lunarMonth', 'lunarDay', 'ganzhi', 'jishen', 'xiongsha', 'chongAnimal']) {
    assert.ok(data.picks[0][f] !== undefined, `화면이 읽는 필드가 응답에 없다: ${f}`);
  }
  assert.ok(data.purposeLabel, '목적 이름표가 없으면 결과 머리글이 빈다');
  // 한자 그대로 내보내면 한국어 사용자는 읽지 못한다
  for (const name of [...data.picks.flatMap(p => p.jishen), ...data.picks.flatMap(p => p.xiongsha)]) {
    assert.doesNotMatch(name, /[一-鿿]/, `번역되지 않은 용어가 나갔다: ${name}`);
  }
});

test('목적을 안 주면 차감 없이 400', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  const res = await handleAuspiciousDays(post(token, { lang: 'ko' }), env);

  assert.equal(res.status, 400);
  assert.equal(called, false);
  assert.equal(balanceOf(db, EMAIL), 10);
});

test('지난 날짜로는 볼 수 없다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);

  const res = await handleAuspiciousDays(post(token, { purpose: 'wedding', from: '2020-01-01' }), env);

  assert.equal(res.status, 400);
  assert.equal(balanceOf(db, EMAIL), 10);
});

test('잔액이 모자라면 차감도 호출도 없다', async () => {
  const { db, env } = setup(1);   // 2토큰짜리인데 1개뿐
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  const res = await handleAuspiciousDays(post(token, { purpose: 'wedding' }), env);

  assert.equal(res.status, 402);
  assert.equal(called, false, '잔액이 없는데 Gemini 를 불렀다');
  assert.equal(balanceOf(db, EMAIL), 1);
});

test('Gemini 가 던져도 2토큰이 돌아온다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => { throw new TypeError('network error'); };

  const res = await handleAuspiciousDays(post(token, { purpose: 'wedding' }), env);

  assert.ok(res.status >= 400);
  assert.equal(balanceOf(db, EMAIL), 10, '차감만 남고 환불되지 않았다');
});

test('인증 없이는 볼 수 없다', async () => {
  const { env } = setup();
  const res = await handleAuspiciousDays(
    new Request('https://x/api/auspicious-days', { method: 'POST', body: '{}' }), env);
  assert.equal(res.status, 401);
});
