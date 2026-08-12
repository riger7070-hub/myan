// 오늘 새로 넣은 계산들 중 아직 검산하지 않은 것.
//
//   computeElementBalance  작명에 쓸 오행 분포
//   computeIntimacy        속궁합 (일지 관계 + 일간 십신)
//   computeYearLuck        올해 세운
//   _yearFromPillar        절기로 세운 년주에서 서기 연도 되짚기
//
// 이 넷이 틀리면 글 전체가 헛말이 된다. AI 는 계산 결과를 그대로 믿고 쓰기 때문이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const {
  computeSaju, computeElementBalance, computeIntimacy, computeYearLuck, _yearFromPillar,
} = await loadWorker([
  'computeSaju', 'computeElementBalance', 'computeIntimacy', 'computeYearLuck', '_yearFromPillar',
]);

const OHAENG = ['木', '火', '土', '金', '水'];

// ── 오행 분포 ──

test('오행 다섯을 모두 세고, 합이 기둥 수와 맞는다', () => {
  const saju = computeSaju(1999, 7, 18, '사시');
  const b = computeElementBalance(saju);
  assert.deepEqual(Object.keys(b.count).sort(), [...OHAENG].sort(), '오행이 빠졌다');
  // 네 기둥이면 천간 4 + 지지 본기 4 = 8. 시주가 없으면 6.
  assert.equal(b.total, 8, `기둥 수와 안 맞는다(${b.total})`);
  const sum = Object.values(b.count).reduce((a, x) => a + x, 0);
  assert.equal(sum, b.total, '세어 놓고 합이 다르다');
});

test('시주가 없으면 여섯만 센다', () => {
  const saju = computeSaju(1999, 7, 18, '');
  const b = computeElementBalance(saju);
  assert.equal(b.total, 6, `생시가 없는데 ${b.total} 개를 셌다`);
});

test('없는 기운과 얇은 기운을 갈라 준다', () => {
  let sawLacking = false;
  for (let m = 1; m <= 12; m++) {
    const b = computeElementBalance(computeSaju(1990, m, 15, '자시'));
    for (const e of b.lacking) {
      assert.equal(b.count[e], 0, `${e} 가 없는 기운인데 ${b.count[e]} 개다`);
      sawLacking = true;
    }
    for (const e of b.thin) {
      assert.ok(b.count[e] > 0 && b.count[e] <= 1, `${e} 가 얇은 기운인데 ${b.count[e]} 개다`);
      assert.ok(!b.lacking.includes(e), `${e} 가 없는 기운과 얇은 기운에 모두 들었다`);
    }
    for (const e of b.heavy) assert.ok(b.count[e] >= 2, `${e} 가 두터운 기운인데 ${b.count[e]} 개다`);
  }
  assert.ok(sawLacking, '없는 기운이 한 번도 안 나왔다 — 계산을 확인할 것');
});

// ── 속궁합 ──

test('일지 관계를 표대로 잡는다', () => {
  const CHUNG = { 子:'午', 午:'子', 丑:'未', 未:'丑', 寅:'申', 申:'寅',
                  卯:'酉', 酉:'卯', 辰:'戌', 戌:'辰', 巳:'亥', 亥:'巳' };
  const HAP = { 子:'丑', 丑:'子', 寅:'亥', 亥:'寅', 卯:'戌', 戌:'卯',
                辰:'酉', 酉:'辰', 巳:'申', 申:'巳', 午:'未', 未:'午' };
  let checked = 0;
  for (let d = 1; d <= 28; d++) {
    const a = computeSaju(1990, 6, d, '자시');
    const b = computeSaju(1992, 9, d, '자시');
    const im = computeIntimacy(a, b);
    assert.ok(im.kinds.length, '관계가 비었다');
    if (CHUNG[im.branchA] === im.branchB) assert.ok(im.kinds.includes('충'), '충을 못 잡았다');
    if (HAP[im.branchA] === im.branchB) assert.ok(im.kinds.includes('육합'), '육합을 못 잡았다');
    if (im.branchA === im.branchB) assert.ok(im.kinds.includes('같음'), '같은 자리를 못 잡았다');
    checked++;
  }
  assert.ok(checked > 20);
});

test('얽힌 것이 없으면 무관으로, 겁주지 않는다', () => {
  // 두 사람의 날짜를 같이 움직이면 지지가 함께 돌아 조합이 몇 가지로 좁아진다.
  // 한쪽을 고정하고 다른 쪽만 훑어야 열두 지지를 다 만난다.
  let found = false;
  for (let d = 1; d <= 28 && !found; d++) {
    const im = computeIntimacy(computeSaju(1990, 6, 1, '자시'), computeSaju(1993, 3, d, '자시'));
    if (im.kinds.includes('무관')) {
      assert.equal(im.kinds.length, 1, '무관인데 다른 관계도 들었다');
      const note = im.notes.find(n => n.kind === '무관').text;
      assert.match(note, /나쁜 것이 아니라/, '무관을 나쁘게 적었다');
      found = true;
    }
  }
  assert.ok(found, '무관인 짝을 못 찾았다');
});

test('점수나 등급을 매기지 않는다', () => {
  // 궁합에 점수를 붙이면 낮게 나온 사람은 그 숫자만 기억한다.
  const im = computeIntimacy(computeSaju(1990, 6, 1, '자시'), computeSaju(1992, 9, 1, '자시'));
  for (const k of Object.keys(im)) {
    assert.ok(!/score|점수|grade|등급|percent/i.test(k), `점수 같은 값이 있다: ${k}`);
  }
});

test('한쪽 생년월일이 없으면 셈하지 않는다', () => {
  const a = computeSaju(1990, 6, 1, '자시');
  assert.equal(computeIntimacy(a, null), null);
  assert.equal(computeIntimacy(null, a), null);
});

// ── 올해 세운 ──

test('그해 간지를 바르게 세운다', () => {
  const CG = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const JJ = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const saju = computeSaju(1999, 7, 18, '사시');
  for (const y of [2024, 2025, 2026, 2033]) {
    const yl = computeYearLuck(saju, y);
    assert.equal(yl.pillar, CG[(y - 4) % 10] + JJ[(y - 4) % 12], `${y}년 간지가 다르다`);
    assert.equal(yl.year, y);
  }
  // 2024년은 갑진년이다. 널리 알려진 값으로 한 번 못박는다.
  assert.equal(computeYearLuck(saju, 2024).pillar, '甲辰');
});

test('그해가 내 기둥과 맺는 관계를 짚는다', () => {
  const saju = computeSaju(1988, 3, 3, '오시');
  const yl = computeYearLuck(saju, 2027);
  const POS = new Set(['년', '월', '일', '시']);
  for (const c of yl.clash) {
    assert.ok(POS.has(c.pos), `모르는 자리: ${c.pos}`);
    assert.ok(['충', '합', '형'].includes(c.kind), `모르는 관계: ${c.kind}`);
  }
  // 한 기둥이 두 번 들어가면 안 된다(충이면서 합일 수 없다).
  const positions = yl.clash.map(c => c.pos);
  assert.equal(new Set(positions).size, positions.length, '같은 기둥이 두 번 들었다');
});

test('십신은 열 가지 중 하나다', () => {
  const TEN = ['비견','겁재','식신','상관','정재','편재','정관','편관','정인','편인'];
  for (let y = 2024; y <= 2035; y++) {
    const yl = computeYearLuck(computeSaju(1995, 11, 9, '술시'), y);
    if (yl.ganSipsin) assert.ok(TEN.includes(yl.ganSipsin), `모르는 십신: ${yl.ganSipsin}`);
    if (yl.jiSipsin) assert.ok(TEN.includes(yl.jiSipsin), `모르는 십신: ${yl.jiSipsin}`);
  }
});

test('삼재 여부를 함께 알려 준다', () => {
  const yl = computeYearLuck(computeSaju(1996, 5, 5, '진시'), 2026);
  assert.equal(typeof yl.inSamjae, 'boolean', '삼재 여부가 참거짓이 아니다');
});

// ── 입춘 경계 ──

test('입춘 전에 태어나면 앞 해로 센다', () => {
  // 1990-01-15 은 아직 기사년(己巳)이다. 경오년(庚午)은 입춘부터다.
  const saju = computeSaju(1990, 1, 15, '자시');
  const y = _yearFromPillar(saju.yp, 1990);
  assert.equal(y, 1989, `입춘 전인데 ${y} 년으로 셌다`);
  assert.equal(saju.yp, '己巳', `년주가 ${saju.yp} 로 나왔다`);
});

test('입춘 뒤면 그해 그대로다', () => {
  const saju = computeSaju(1990, 6, 15, '자시');
  assert.equal(_yearFromPillar(saju.yp, 1990), 1990);
});

test('되짚을 수 없으면 준 값을 그대로 돌려준다', () => {
  assert.equal(_yearFromPillar(null, 1990), 1990);
  assert.equal(_yearFromPillar('없는간지', 1990), 1990);
});
