// 귀인(貴人).
//
// 사주에서 귀인은 "어려울 때 손 내미는 사람"이다. 사람들이 정말 알고 싶어 하는 것은
// "내 사주에 천을귀인이 있는가"보다 **"누가 나에게 귀인인가"** 라서, 천을귀인이 드는
// 지지를 띠로 옮겨 준다. 그 표가 틀리면 풀이 전체가 엉뚱해지므로 여기서 못 박는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWorker } from './load-worker.mjs';

const H = await loadWorker(['computeGwiin', 'computeSaju']);

// 일간별 천을귀인 지지. 명리 고서의 표 그대로다.
//   甲戊庚 - 丑未 / 乙己 - 子申 / 丙丁 - 亥酉 / 辛 - 午寅 / 壬癸 - 巳卯
const 천을 = {
  甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'],
  乙: ['子', '申'], 己: ['子', '申'],
  丙: ['亥', '酉'], 丁: ['亥', '酉'],
  辛: ['午', '寅'],
  壬: ['巳', '卯'], 癸: ['巳', '卯'],
};
const 띠 = { 子: '쥐', 丑: '소', 寅: '호랑이', 卯: '토끼', 辰: '용', 巳: '뱀',
             午: '말', 未: '양', 申: '원숭이', 酉: '닭', 戌: '개', 亥: '돼지' };

/** 일간이 g 인 사주를 하나 찾아 온다(날짜를 훑어 고른다). */
function sajuWithDayGan(g) {
  for (let d = 1; d <= 60; d++) {
    const s = H.computeSaju(2000, 1, d, '');
    if (s?.dayGan === g) return s;
  }
  return null;
}

test('열 일간 모두에서 귀인 띠가 나온다', () => {
  for (const gan of Object.keys(천을)) {
    const saju = sajuWithDayGan(gan);
    assert.ok(saju, `일간 ${gan} 인 날을 못 찾았다`);
    const r = H.computeGwiin(saju);
    assert.ok(r, `${gan}: 계산이 안 됐다`);
    assert.deepEqual(r.people.map(p => p.branch).sort(), [...천을[gan]].sort(),
      `${gan} 의 천을귀인 지지가 표와 다르다`);
    assert.deepEqual(r.people.map(p => p.tti).sort(),
      천을[gan].map(b => 띠[b]).sort(), `${gan} 의 귀인 띠 이름이 어긋난다`);
  }
});

test('귀인은 언제나 두 띠다', () => {
  // 한 띠만 나오면 표를 잘못 읽은 것이다(辛 만 午寅 으로 둘, 나머지도 모두 둘).
  for (const gan of Object.keys(천을)) {
    const r = H.computeGwiin(sajuWithDayGan(gan));
    assert.equal(r.people.length, 2, `${gan}: 귀인 띠가 ${r.people.length}개다`);
  }
});

test('귀인이 오는 해는 그 띠의 해다', () => {
  const saju = sajuWithDayGan('甲');          // 甲 → 丑(소) · 未(양)
  const r = H.computeGwiin(saju, 2026);
  assert.ok(r.years.length >= 1, '앞으로 열 해에 귀인 해가 하나도 없다');
  for (const y of r.years) {
    assert.ok(['丑', '未'].includes(y.branch), `${y.year}년(${y.branch})은 甲 의 귀인 해가 아니다`);
    // 실제 그 해의 지지와 맞는지 (서기 4년이 甲子년)
    const JJ = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    assert.equal(y.branch, JJ[(y.year - 4) % 12], `${y.year}년의 지지가 틀렸다`);
  }
  assert.ok(r.years.every(y => y.year >= 2026 && y.year < 2036), '열 해 범위를 벗어났다');
});

test('사주에 실제로 앉은 귀인만 별로 잡는다', () => {
  // 甲 일간에 丑 이나 未 가 있으면 천을귀인이 선다.
  const saju = sajuWithDayGan('甲');
  const r = H.computeGwiin(saju);
  const 지지 = [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).map(p => p[1]);
  const 천간 = [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).map(p => p[0]);
  const 천을있나 = 지지.some(b => ['丑', '未'].includes(b));
  const 별에있나 = r.stars.some(s => s.name === '천을귀인');
  assert.equal(별에있나, 천을있나, '기둥에 없는데 천을귀인이 섰거나, 있는데 안 섰다');

  // 별이 섰으면 어느 기둥인지도 말해 줘야 한다
  for (const s of r.stars) {
    assert.ok(s.where.length > 0, `${s.name}: 자리를 안 짚어 준다`);
    assert.ok(s.text && s.text.length > 10, `${s.name}: 뜻이 비었다`);
    for (const w of s.where) assert.ok(['년','월','일','시'].includes(w), `이상한 자리: ${w}`);
  }
  // 뜻에 겁주는 말이 없어야 한다. 귀인은 길신이다.
  const 뜻 = r.stars.map(s => s.text).join(' ');
  assert.doesNotMatch(뜻, /죽|사고|불행|재앙/, '길신 설명에 겁주는 말이 있다');
  void 천간;
});

test('문창귀인은 일간으로 정해진다', () => {
  // 甲 → 巳. 巳 가 기둥에 있으면 서고 없으면 안 선다.
  const saju = sajuWithDayGan('甲');
  const r = H.computeGwiin(saju);
  const 지지 = [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).map(p => p[1]);
  assert.equal(r.stars.some(s => s.name === '문창귀인'), 지지.includes('巳'),
    '문창귀인 판정이 표와 어긋난다');
});

test('생년월일이 없으면 조용히 없다고 한다', () => {
  assert.equal(H.computeGwiin(null), null);
  assert.equal(H.computeGwiin({}), null);
});

test('같은 사주는 언제 봐도 같은 답이다', () => {
  const saju = sajuWithDayGan('丙');
  const a = H.computeGwiin(saju, 2026);
  const b = H.computeGwiin(saju, 2026);
  assert.deepEqual(a, b, '같은 입력에 다른 답이 나온다');
});

// ── 핸들러 ──
//
// 예전에 핸들러를 만들어 놓고 한 번도 부르지 않아 프로덕션에서 500 을 만났다
// (NL is not defined). 여기서는 실제로 부른다.

import { createD1 } from './d1-sqlite.mjs';

const H2 = await loadWorker(['handleGwiin', 'createSessionToken', 'accountBalance']);
const SECRET = 'gwiin-secret';
const KEY = 'CI-GWIIN';
const realFetch = globalThis.fetch;

function setupH(tokens = 20) {
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO mini_payment_requests (id,user_key,pkg,amount,tokens,status,approved_at)
     VALUES ('seed',?,'t',0,?,'approved',unixepoch())`
  ).run(KEY, tokens);
  globalThis.fetch = async (url, opts, ...rest) => {
    if (String(url).includes('generativelanguage')) {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '안도령이 이르되.\n\n소띠와 양띠가 그대의 귀인입니다.' }] } }],
      }), { status: 200 });
    }
    return realFetch(url, opts, ...rest);
  };
  return { db, env: { SESSION_SECRET: SECRET, GEMINI_API_KEY: 'k', DB } };
}

const call = async (env, body) => H2.handleGwiin(new Request('https://x/api/gwiin', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await H2.createSessionToken('mini:' + KEY, env)}`,
  },
  body: JSON.stringify(body),
}), env);

test('실제로 불러도 500 이 나지 않는다', async () => {
  const { env } = setupH();
  try {
    const res = await call(env, { birth: { year: 1990, month: 5, day: 15, hour: '오시' }, gender: 'M' });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    const j = JSON.parse(text);
    assert.ok(j.reading, '풀이가 비었다');
    assert.equal(j.people.length, 2, '귀인 띠가 둘이 아니다');
    assert.ok(j.saju, '사주가 안 실렸다');
  } finally { globalThis.fetch = realFetch; }
});

test('엽전이 모자라면 402 이고 차감하지 않는다', async () => {
  const { env } = setupH(1);
  try {
    const res = await call(env, { birth: { year: 1990, month: 5, day: 15 } });
    assert.equal(res.status, 402);
    assert.equal(await H2.accountBalance(env, { kind: 'mini', key: KEY }), 1, '실패했는데 깎였다');
  } finally { globalThis.fetch = realFetch; }
});

test('풀이를 못 만들면 엽전을 돌려준다', async () => {
  const { env } = setupH(20);
  globalThis.fetch = async (url, o, ...r) => String(url).includes('generativelanguage')
    ? new Response('{}', { status: 500 }) : realFetch(url, o, ...r);
  try {
    const res = await call(env, { birth: { year: 1990, month: 5, day: 15 } });
    assert.ok(res.status >= 400, '실패인데 200 이 왔다');
    assert.equal(await H2.accountBalance(env, { kind: 'mini', key: KEY }), 20, '엽전이 사라졌다');
  } finally { globalThis.fetch = realFetch; }
});

test('생년월일이 없으면 엽전을 쓰지 않는다', async () => {
  const { env } = setupH();
  try {
    const res = await call(env, {});
    assert.equal(res.status, 400);
    assert.equal(await H2.accountBalance(env, { kind: 'mini', key: KEY }), 20, '계산도 안 했는데 깎였다');
  } finally { globalThis.fetch = realFetch; }
});

test('로그인 없이는 못 본다', async () => {
  const { env } = setupH();
  try {
    const res = await H2.handleGwiin(new Request('https://x/api/gwiin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ birth: { year: 1990, month: 5, day: 15 } }),
    }), env);
    assert.equal(res.status, 401);
  } finally { globalThis.fetch = realFetch; }
});

test('띠로 사람을 가르지 말라는 지시가 프롬프트에 있다', () => {
  // "무슨 띠는 멀리하라" 는 말이 나가면 서비스가 아니라 미신 장사가 된다.
  const src = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
  const f = src.slice(src.indexOf('async function handleGwiin'));
  const body = f.slice(0, f.indexOf('\n}\n'));
  assert.match(body, /사람을 띠로 갈라/, '띠로 사람을 가르지 말라는 지시가 없다');
  assert.match(body, /막연한 약속도 하지/, '막연한 약속을 막는 지시가 없다');
});
