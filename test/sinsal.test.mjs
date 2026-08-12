// 신살·삼재·띠 순위·십신 분포 계산.
//
// 이건 AI 에게 물어서는 안 되는 것들이다. "제 사주에 도화살이 있나요" 를 모델에게
// 물으면 물을 때마다 답이 달라진다 — 그건 사주가 아니라 소설이다. 표로 정해진
// 것은 계산으로 끝내고, AI 에게는 계산 결과를 읽어 주는 일만 맡긴다.
//
// 그래서 계산이 맞는지는 여기서 지킨다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { computeSaju, computeSinsal, computeSamjae, computeTtiRanking, computeSipsinSpread } =
  await loadWorker(['computeSaju', 'computeSinsal', 'computeSamjae',
    'computeTtiRanking', 'computeSipsinSpread']);

const nameOf = (r) => (r?.hits || []).map(h => h.name);

test('도화살 — 삼합국의 왕지가 사주에 있으면 선다', () => {
  // 寅午戌 생은 卯 가 도화. 1990-03-15 은 庚午년(말띠, 午 → 寅午戌국)이고
  // 일지에 卯 가 오는 날을 고른다.
  const saju = computeSaju(1990, 3, 15, '묘시');
  assert.ok(saju, '사주를 못 세웠다');
  const r = computeSinsal(saju);
  assert.ok(r, '신살을 못 구했다');
  const branches = [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).map(p => p[1]);
  // 기준(년지·일지)이 속한 삼합국의 왕지가 실제로 사주에 있는지로 판정을 검산한다.
  const g = [['寅', '午', '戌', '卯'], ['巳', '酉', '丑', '午'],
             ['申', '子', '辰', '酉'], ['亥', '卯', '未', '子']];
  const bases = [saju.yp[1], saju.dp[1]];
  const expected = bases.some(b => {
    const row = g.find(x => x.slice(0, 3).includes(b));
    return row && branches.includes(row[3]);
  });
  assert.equal(nameOf(r).includes('도화살'), expected, '도화살 판정이 표와 어긋난다');
});

test('백호살 — 정해진 간지 쌍일 때만 선다', () => {
  // 甲辰·乙未·丙戌·丁丑·戊辰·壬戌·癸丑 일곱 쌍뿐이다.
  const BAEKHO = new Set(['甲辰', '乙未', '丙戌', '丁丑', '戊辰', '壬戌', '癸丑']);
  let checked = 0;
  for (let d = 1; d <= 28; d++) {
    const saju = computeSaju(1995, 6, d, '자시');
    if (!saju) continue;
    const has = [saju.yp, saju.mp, saju.dp, saju.hp].filter(Boolean).some(p => BAEKHO.has(p));
    assert.equal(nameOf(computeSinsal(saju)).includes('백호살'), has,
      `${saju.yp}/${saju.mp}/${saju.dp}/${saju.hp} 백호살 판정이 다르다`);
    checked++;
  }
  assert.ok(checked > 20, '검사한 날이 너무 적다');
});

test('괴강살은 일주로만 본다', () => {
  const GWAEGANG = new Set(['庚辰', '庚戌', '壬辰', '戊戌']);
  for (let d = 1; d <= 28; d++) {
    const saju = computeSaju(1988, 9, d, '오시');
    if (!saju) continue;
    assert.equal(nameOf(computeSinsal(saju)).includes('괴강살'), GWAEGANG.has(saju.dp),
      `${saju.dp} 괴강살 판정이 다르다`);
  }
});

test('길신도 함께 알려 준다 — 흉살만 늘어놓지 않는다', () => {
  // 천을귀인이 서는 사주를 하나라도 찾아야 한다. 없으면 표가 잘못된 것이다.
  let found = false;
  for (let d = 1; d <= 28 && !found; d++) {
    const saju = computeSaju(1993, 4, d, '축시');
    if (saju && nameOf(computeSinsal(saju)).includes('천을귀인')) found = true;
  }
  assert.ok(found, '천을귀인이 한 번도 안 선다 — 표를 확인할 것');
});

test('삼재는 띠 삼합마다 정해진 3년이다', () => {
  // 申子辰(원숭이·쥐·용)생은 寅卯辰년에 삼재가 든다.
  const r = computeSamjae('子', 2026);
  assert.ok(r, '삼재를 못 구했다');
  assert.equal(r.years.length, 3, '삼재가 3년이 아니다');
  const branches = r.years.map(x => JJofYear(x.year));
  assert.deepEqual(branches, ['寅', '卯', '辰'], `쥐띠 삼재가 ${branches} 로 나왔다`);
  assert.deepEqual(r.years.map(x => x.kind), ['들삼재', '눌삼재', '날삼재']);
});

function JJofYear(y) {
  return ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'][(y - 4) % 12];
}

test('띠 순위는 같은 날이면 언제 봐도 같다', () => {
  const a = computeTtiRanking('2026-08-12');
  const b = computeTtiRanking('2026-08-12');
  assert.deepEqual(a.rows.map(r => r.name), b.rows.map(r => r.name),
    '같은 날인데 순위가 바뀐다 — 운세가 아니라 뽑기가 된다');
  assert.equal(a.rows.length, 12, '열두 띠가 다 안 나온다');
  assert.equal(a.rows[0].rank, 1);
  assert.equal(a.rows[11].rank, 12);
});

test('띠 순위는 날이 바뀌면 달라진다', () => {
  const days = ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'];
  const firsts = days.map(d => computeTtiRanking(d).rows[0].name);
  assert.ok(new Set(firsts).size > 1, '나흘 내내 1위가 같다 — 계산이 날짜를 안 탄다');
});

test('충이 든 띠가 꼴찌 쪽에 온다', () => {
  const r = computeTtiRanking('2026-08-12');
  const CHUNG = { 子:'午', 午:'子', 丑:'未', 未:'丑', 寅:'申', 申:'寅',
                  卯:'酉', 酉:'卯', 辰:'戌', 戌:'辰', 巳:'亥', 亥:'巳' };
  const clash = CHUNG[r.dayBranch];
  const at = r.rows.find(x => x.branch === clash);
  assert.ok(at.rank >= 9, `충이 든 띠가 ${at.rank}위다 — 점수 배분을 확인할 것`);
  assert.ok(at.why.includes('충'), '이유에 충이 안 적힌다');
});

test('십신 분포는 백분율이 어긋나지 않는다', () => {
  const saju = computeSaju(1999, 7, 18, '사시');
  const r = computeSipsinSpread(saju);
  assert.ok(r?.spread?.length, '분포가 비었다');
  const sum = r.spread.reduce((a, x) => a + x.pct, 0);
  assert.ok(Math.abs(sum - 100) <= 3, `백분율 합이 ${sum} 이다`);
  assert.ok(r.top.length && r.top.length <= 3, '가장 두터운 십신을 못 뽑았다');
  for (const x of r.spread) assert.ok(x.count > 0, `${x.name} 이 0인데 목록에 있다`);
});

test('생년월일이 없으면 조용히 없다고 한다', () => {
  assert.equal(computeSinsal(null), null);
  assert.equal(computeSipsinSpread(null), null);
  assert.equal(computeTtiRanking('아무날'), null);
});
