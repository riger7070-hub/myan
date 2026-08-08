// 천궁도 계산 테스트.
//
// "실제 하늘을 본다"가 이 기능의 전제라, 계산이 틀리면 기능 자체가 거짓말이 된다.
// 그래서 내부 일관성만 보지 않고 **바깥에서 확인 가능한 천문 사실**에 맞춘다:
// 춘분·하지의 태양 황경, 기존 별자리 판정표와의 교차 검증, 삭(新月)에서의 일·월 합.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const W = await loadWorker([
  'sunLonDeg', 'moonLonDeg', 'planetLonDeg', 'buildChart', 'natalChart',
  'signPlacement', 'findAspect', 'angularSeparation', 'transitAspects',
  'ZODIAC_SIGNS', 'CHART_BODIES', '_getWesternZodiacIndex', 'moonPhase', 'planetRetrograde',
]);

const utc = (y, m, d, h = 12) => new Date(Date.UTC(y, m - 1, d, h));

// ── 1. 태양: 분점·지점에서의 황경 ───────────────────────────────────────
// 정의상 춘분에 태양 황경 0도, 하지 90도, 추분 180도, 동지 270도.
// 날짜는 해마다 몇 시간씩 흔들리므로 "그 날짜 부근에서 값을 지난다"로 확인한다.
const SEASON_MARKS = [
  { name: '춘분', month: 3,  day: 20, target: 0 },
  { name: '하지', month: 6,  day: 21, target: 90 },
  { name: '추분', month: 9,  day: 22, target: 180 },
  { name: '동지', month: 12, day: 21, target: 270 },
];

for (const { name, month, day, target } of SEASON_MARKS) {
  test(`태양 황경이 ${name} 무렵 ${target}도를 지난다`, () => {
    // 해당 날짜 ±1.5일 안에서 목표 황경과의 차이가 최소가 되는 지점을 찾는다.
    let best = 999;
    for (let h = -36; h <= 36; h++) {
      const lon = W.sunLonDeg(utc(2026, month, day, 12 + h));
      best = Math.min(best, W.angularSeparation(lon, target));
    }
    // 근사 원소 + 날짜 흔들림을 감안해 0.5도 이내면 맞다고 본다
    assert.ok(best < 0.5, `${name}: 목표에서 최소 ${best.toFixed(3)}도까지밖에 못 갔다`);
  });
}

// ── 2. 기존 별자리 판정표와의 교차 검증 ────────────────────────────────
// worker.js 에는 날짜→별자리 표(_getWesternZodiacIndex)가 이미 있다. 완전히 다른 방식인
// 실제 태양 황경 계산과 결과가 일치해야 한다. 하나가 틀리면 여기서 갈린다.
test('실제 태양 위치가 기존 별자리 판정표와 일치한다', () => {
  // 표의 인덱스는 염소자리(0)부터, 황경 기준 인덱스는 양자리(0)부터라 9칸 어긋나 있다.
  const toChartIndex = i => (i + 9) % 12;
  const mismatches = [];

  for (let m = 1; m <= 12; m++) {
    for (const d of [5, 15, 25]) {
      const expected = toChartIndex(W._getWesternZodiacIndex(m, d));
      const actual = W.signPlacement(W.sunLonDeg(utc(2026, m, d))).signIndex;
      if (expected !== actual) mismatches.push(`${m}/${d}: 표=${expected} 실제=${actual}`);
    }
  }
  // 표는 고정 날짜라 경계일에는 원래 하루씩 어긋날 수 있다. 경계에서 먼 날만 썼으므로 전부 맞아야 한다.
  assert.deepEqual(mismatches, [], `별자리 판정 불일치:\n  ${mismatches.join('\n  ')}`);
});

// ── 3. 달: 삭(新月)에서 태양과 합 ──────────────────────────────────────
// moonPhase() 는 평균 삭망월 모델이고 moonLonDeg() 는 절단 급수라 서로 완전히 독립적이다.
// 둘 다 맞다면 "위상이 삭일 때 태양·달 황경이 겹친다"가 성립해야 한다.
test('삭(新月)의 날짜를 두 모델이 하루 안쪽으로 같게 본다', () => {
  // 위상값 자체로 거르면 안 된다 — 평균 삭망월 모델은 ±0.5일(약 6도)까지 어긋날 수 있어
  // "위상이 0에 가까운 날"이 실제 합에서 10도 넘게 떨어질 수 있다.
  // 대신 각 삭 주기에서 **두 모델이 각자 고른 최솟값 날짜**가 같은지 본다.
  const DAY = 86400000;
  const start = Date.UTC(2026, 0, 1, 12);
  let lunations = 0;

  // 29.53일 주기를 넉넉히 덮도록 30일 창을 겹치지 않게 훑는다
  for (let w = 0; w < 4; w++) {
    let bySep = { day: -1, val: 999 };
    let byPhase = { day: -1, val: 999 };
    for (let d = 0; d < 30; d++) {
      const date = new Date(start + (w * 30 + d) * DAY);
      const sep = W.angularSeparation(W.sunLonDeg(date), W.moonLonDeg(date));
      const ill = W.moonPhase(date).illumination;
      if (sep < bySep.val)  bySep  = { day: w * 30 + d, val: sep };
      if (ill < byPhase.val) byPhase = { day: w * 30 + d, val: ill };
    }
    assert.ok(Math.abs(bySep.day - byPhase.day) <= 1,
      `삭 날짜가 어긋난다: 이각 최소=${bySep.day}일차(${bySep.val.toFixed(1)}도), ` +
      `위상 최소=${byPhase.day}일차`);
    // 실제 합이 일어났다면 최소 이각은 충분히 작아야 한다(하루 단위 표본이라 달은 최대 13도 건너뛴다)
    assert.ok(bySep.val < 7, `최소 이각이 ${bySep.val.toFixed(1)}도 — 합이 없었다는 뜻`);
    lunations++;
  }
  assert.equal(lunations, 4);
});

test('달은 하루에 약 11~15도 움직인다', () => {
  for (let day = 0; day < 40; day++) {
    const a = new Date(Date.UTC(2026, 5, 1, 12) + day * 86400000);
    const b = new Date(a.getTime() + 86400000);
    const moved = W.angularSeparation(W.moonLonDeg(a), W.moonLonDeg(b));
    assert.ok(moved > 10 && moved < 16, `${day}일차 달 이동량이 ${moved.toFixed(1)}도다`);
  }
});

// ── 4. 느린 행성이 실제로 느린가 ────────────────────────────────────────
test('목성·토성은 한 별자리에 오래 머문다', () => {
  // 목성은 한 별자리에 약 1년, 토성은 약 2.5년. 30일로는 별자리를 건너뛸 수 없다.
  for (const p of ['jupiter', 'saturn']) {
    const a = W.planetLonDeg(p, utc(2026, 1, 1));
    const b = W.planetLonDeg(p, utc(2026, 1, 31));
    const moved = W.angularSeparation(a, b);
    assert.ok(moved < 5, `${p} 가 30일 만에 ${moved.toFixed(1)}도 움직였다 — 너무 빠르다`);
  }
});

test('수성은 한 해 동안 황도를 여러 바퀴 돈다', () => {
  // 공전주기 88일 → 1년에 약 4바퀴. 월별 별자리가 최소 8종류는 나와야 한다.
  const signs = new Set();
  for (let m = 1; m <= 12; m++) {
    signs.add(W.signPlacement(W.planetLonDeg('mercury', utc(2026, m, 1))).signIndex);
  }
  assert.ok(signs.size >= 8, `수성이 1년간 ${signs.size}개 별자리에만 나타났다`);
});

// ── 5. 각(어스펙트) 계산 ────────────────────────────────────────────────
test('각도 계산이 0/360도 경계를 넘어서도 맞다', () => {
  assert.equal(W.angularSeparation(350, 10), 20);
  assert.equal(W.angularSeparation(10, 350), 20);
  assert.equal(W.angularSeparation(0, 180), 180);
  assert.equal(W.angularSeparation(0, 181), 179, '181도는 반대편으로 179도');
});

test('주요 각을 오브 안에서 잡아낸다', () => {
  assert.equal(W.findAspect(0, 0).name, 'conjunction');
  assert.equal(W.findAspect(0, 120).name, 'trine');
  assert.equal(W.findAspect(0, 90).name, 'square');
  assert.equal(W.findAspect(0, 180).name, 'opposition');
  assert.equal(W.findAspect(0, 60).name, 'sextile');
  // 오브 밖은 각이 아니다 — 넓게 잡으면 아무 날에나 각이 잡혀 의미가 없어진다
  assert.equal(W.findAspect(0, 45), null, '45도는 메이저 각이 아니다');
  assert.equal(W.findAspect(0, 70), null, 'sextile 오브(4도) 밖');
});

test('각이 정확할수록 strength 가 높다', () => {
  assert.equal(W.findAspect(0, 120).strength, 100, '정확한 삼각은 100');
  assert.ok(W.findAspect(0, 123).strength < W.findAspect(0, 121).strength);
});

// ── 6. 차트 구성 ────────────────────────────────────────────────────────
test('차트에 모든 천체가 유효한 값으로 들어간다', () => {
  const chart = W.buildChart(utc(2026, 8, 8));
  for (const body of W.CHART_BODIES) {
    const c = chart[body];
    assert.ok(c, `${body} 누락`);
    assert.ok(c.lon >= 0 && c.lon < 360, `${body} 황경 범위 벗어남: ${c.lon}`);
    assert.ok(W.ZODIAC_SIGNS.includes(c.sign), `${body} 별자리 이상: ${c.sign}`);
    assert.ok(c.degInSign >= 0 && c.degInSign < 30, `${body} 별자리 내 도수 이상: ${c.degInSign}`);
    assert.equal(typeof c.retrograde, 'boolean');
  }
  assert.equal(chart.sun.retrograde, false, '태양은 역행하지 않는다');
  assert.equal(chart.moon.retrograde, false, '달은 역행하지 않는다');
});

test('탄생 차트는 생년월일만으로 만들어진다', () => {
  const natal = W.natalChart(1990, 5, 15);
  assert.ok(natal);
  // 1990-05-15 는 황소자리 구간 — 실제 태양 위치로도 황소자리여야 한다
  assert.equal(natal.sun.sign, 'taurus');
});

test('잘못된 날짜는 null 을 돌려준다', () => {
  assert.equal(W.natalChart(NaN, 5, 15), null);
});

// ── 7. 트랜싯 ───────────────────────────────────────────────────────────
test('트랜싯이 강한 순으로 정렬된다', () => {
  const natal = W.natalChart(1990, 5, 15);
  const today = W.buildChart(utc(2026, 8, 8));
  const list = W.transitAspects(natal, today);

  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].strength >= list[i].strength, '정렬이 깨졌다');
  }
  for (const t of list) {
    assert.ok(W.CHART_BODIES.includes(t.transit) && W.CHART_BODIES.includes(t.natal));
    assert.ok(t.strength >= 0 && t.strength <= 100);
  }
});

test('같은 사람이라도 날이 다르면 트랜싯이 달라진다', () => {
  // 매일 같은 결과가 나오면 "실제 하늘을 본다"는 말이 무의미해진다.
  const natal = W.natalChart(1990, 5, 15);
  const a = JSON.stringify(W.transitAspects(natal, W.buildChart(utc(2026, 8, 8))));
  const b = JSON.stringify(W.transitAspects(natal, W.buildChart(utc(2026, 9, 20))));
  assert.notEqual(a, b);
});

test('같은 날이라도 사람이 다르면 트랜싯이 달라진다', () => {
  const today = W.buildChart(utc(2026, 8, 8));
  const a = JSON.stringify(W.transitAspects(W.natalChart(1990, 5, 15), today));
  const b = JSON.stringify(W.transitAspects(W.natalChart(1977, 11, 3), today));
  assert.notEqual(a, b);
});

// ── 8. 기존 역행 판정과의 정합 ──────────────────────────────────────────
test('차트의 역행 표시가 기존 planetRetrograde 와 일치한다', () => {
  for (let m = 1; m <= 12; m++) {
    const date = utc(2026, m, 10);
    const chart = W.buildChart(date);
    for (const p of ['mercury', 'venus', 'mars']) {
      assert.equal(chart[p].retrograde, W.planetRetrograde(p, date).retrograde,
        `${p} ${m}월 역행 판정 불일치`);
    }
  }
});
