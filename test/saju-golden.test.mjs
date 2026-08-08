// 사주 4기둥 골든 테스트.
//
// CLAUDE.md 가 "사주 계산을 건드린 뒤에는 알려진 생년월일로 리딩을 돌려 4기둥(年/月/日/時)이
// 변경 전과 같은지 확인하라"고 요구하는 절차를 자동화한 것이다. 이 저장소엔 스테이징이 없고
// main 에 푸시하면 곧장 배포되므로, 절기 계산이 조용히 틀어지는 걸 잡을 수단이 여기밖에 없다.
//
// 아래 기대값은 2026-08-08 시점의 computeSaju() 출력을 그대로 고정한 것이다.
// 실패했다면 둘 중 하나다:
//   1) computeSaju() 로직을 바꿨다 → 의도한 변경이 맞는지 확인하고 기대값을 갱신
//   2) lunar-javascript 를 올렸다 → 절기 테이블이 바뀐 것이므로 반드시 근거를 확인할 것
// 어느 쪽이든 "테스트가 빨개서 기대값을 맞춰줬다"로 끝내면 안 된다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { computeSaju } = await loadWorker(['computeSaju']);

// [년, 월, 일, 시진] → 기대 4기둥
const GOLDEN = [
  { in: [1990, 5, 15, '오시'], yp: '庚午', mp: '辛巳', dp: '庚辰', hp: '壬午', dayGan: '庚', dayElem: '金' },
  // 출생시 모름 → 시주 null, 오행 분포도 시주 몫만큼 빠진다
  { in: [1990, 5, 15, ''],     yp: '庚午', mp: '辛巳', dp: '庚辰', hp: null,   dayGan: '庚', dayElem: '金' },

  // ── 절기(입춘) 경계 — 여기가 틀어지면 사주 전체가 1년/1개월씩 밀린다 ──
  // 2000년 입춘은 2월 4일 저녁이라 2/4 까지는 전년(己卯), 2/5 부터 庚辰.
  { in: [2000, 2, 3, '자시'],  yp: '己卯', mp: '丁丑', dp: '辛卯', hp: '戊子', dayGan: '辛', dayElem: '金' },
  { in: [2000, 2, 4, '자시'],  yp: '己卯', mp: '丁丑', dp: '壬辰', hp: '庚子', dayGan: '壬', dayElem: '水' },
  { in: [2000, 2, 5, '자시'],  yp: '庚辰', mp: '戊寅', dp: '癸巳', hp: '壬子', dayGan: '癸', dayElem: '水' },
  // 2024년 입춘도 2월 4일 오후 → 2/4 는 아직 癸卯
  { in: [2024, 2, 4, '진시'],  yp: '癸卯', mp: '乙丑', dp: '戊戌', hp: '丙辰', dayGan: '戊', dayElem: '土' },

  // 연초/연말 — 양력 해와 사주 년주가 어긋나는 구간
  { in: [1984, 1, 1, '해시'],  yp: '癸亥', mp: '甲子', dp: '甲午', hp: '乙亥', dayGan: '甲', dayElem: '木' },
  { in: [1976, 12, 31, '축시'], yp: '丙辰', mp: '庚子', dp: '丁巳', hp: '辛丑', dayGan: '丁', dayElem: '火' },

  // 지지 글자를 직접 넘긴 경우(한글 시진명이 아닌 입력 경로)
  { in: [2026, 8, 8, '子'],    yp: '丙午', mp: '丙申', dp: '甲寅', hp: '甲子', dayGan: '甲', dayElem: '木' },
  { in: [1955, 11, 22, '신시'], yp: '乙未', mp: '丁亥', dp: '丁亥', hp: '戊申', dayGan: '丁', dayElem: '火' },
];

for (const g of GOLDEN) {
  const [y, m, d, h] = g.in;
  test(`computeSaju(${y}-${m}-${d} ${h || '시각미상'})`, () => {
    const r = computeSaju(y, m, d, h);
    assert.ok(r, '결과가 null 이면 안 된다');
    assert.equal(r.yp, g.yp, '年柱');
    assert.equal(r.mp, g.mp, '月柱');
    assert.equal(r.dp, g.dp, '日柱');
    assert.equal(r.hp, g.hp, '時柱');
    assert.equal(r.dayGan, g.dayGan, '일간');
    assert.equal(r.dayElem, g.dayElem, '일간 오행');
  });
}

test('오행 분포 합계는 기둥 수 × 2 와 같다', () => {
  const withHour = computeSaju(1990, 5, 15, '오시');
  const sum = Object.values(withHour.elem).reduce((a, b) => a + b, 0);
  assert.equal(sum, 8, '4기둥 = 천간 4 + 지지 4');

  const noHour = computeSaju(1990, 5, 15, '');
  const sumNoHour = Object.values(noHour.elem).reduce((a, b) => a + b, 0);
  assert.equal(sumNoHour, 6, '시주가 없으면 3기둥 = 6');
});

test('잘못된 입력은 null 을 돌려준다', () => {
  assert.equal(computeSaju('', 5, 15, '오시'), null);
  assert.equal(computeSaju(1990, 0, 15, '오시'), null);
  assert.equal(computeSaju(1990, 5, 0, '오시'), null);
});

test('알 수 없는 시진 문자열은 시주 없이 처리된다', () => {
  const r = computeSaju(1990, 5, 15, '없는시');
  assert.ok(r, '나머지 3기둥은 계산돼야 한다');
  assert.equal(r.hp, null);
  assert.equal(r.dp, '庚辰', '시주가 없어도 일주는 그대로');
});
