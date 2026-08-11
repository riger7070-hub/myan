// 배우자궁(일지) 계산 테스트.
//
// 사주 네 기둥 중 일지가 배우자 자리다. 여기 앉은 십신으로 인연의 결을 보고,
// 세운이 이 자리를 충(沖)·형(刑)으로 건드리는 해를 "관계가 시험받는 때"로 본다.
//
// 계산이 틀리면 엉뚱한 해를 짚어 준다. 그건 단순한 오작동이 아니라 사람의 결혼
// 생활에 대고 잘못된 말을 하는 것이다. 그래서 충·합·형 짝과 십신을 명리 규칙
// 그대로 확인한다.
//
// ⚠️ 이 기능은 이혼을 예언하지 않는다. 그건 제품 결정이자 자료의 결론이기도 하다
// (일지가 충을 받는다고 반드시 헤어지는 것이 아니다). 프롬프트가 그 원칙을 계속
// 담고 있는지도 함께 지킨다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');

const { computeSpousePalace, computeSaju } = await loadWorker(['computeSpousePalace', 'computeSaju']);

const BIRTH = { year: 1990, month: 5, day: 15, hour: '' };

test('배우자궁은 일지, 곧 일주의 아랫글자다', () => {
  const saju = computeSaju(BIRTH.year, BIRTH.month, BIRTH.day, BIRTH.hour);
  const sp = computeSpousePalace(BIRTH, 'M', 2026, 10);
  assert.ok(sp, '계산이 비었다');
  assert.equal(sp.branch, saju.dp[1], '일지가 아닌 자리를 배우자궁으로 잡았다');
  assert.ok('木火土金水'.includes(sp.elem));
});

test('충·합 짝이 명리 규칙과 같다', () => {
  // 육충은 여섯 칸 건너, 육합은 정해진 짝이다. 한 칸만 어긋나도 전혀 다른 해를 짚는다.
  const CHUNG = { 子: '午', 丑: '未', 寅: '申', 卯: '酉', 辰: '戌', 巳: '亥' };
  const HAP = { 子: '丑', 寅: '亥', 卯: '戌', 辰: '酉', 巳: '申', 午: '未' };

  // 어떤 생일이 어떤 일지를 갖는지는 만세력이 정한다. 날짜를 훑어 열두 지지를 다 만난다.
  const seen = new Map();
  for (let d = 1; d <= 60; d++) {
    const b = { year: 1990, month: 1, day: d, hour: '' };
    const sp = computeSpousePalace(b, 'M', 2026, 1);
    if (sp && !seen.has(sp.branch)) seen.set(sp.branch, sp);
  }
  assert.equal(seen.size, 12, `지지를 ${seen.size}개만 만났다 — 표본이 모자란다`);

  for (const [branch, sp] of seen) {
    const expectC = CHUNG[branch] ?? Object.entries(CHUNG).find(([, v]) => v === branch)?.[0];
    const expectH = HAP[branch] ?? Object.entries(HAP).find(([, v]) => v === branch)?.[0];
    assert.equal(sp.chung, expectC, `${branch} 의 충이 틀렸다`);
    assert.equal(sp.hap, expectH, `${branch} 의 합이 틀렸다`);
    assert.notEqual(sp.chung, branch, '자기 자신과 충이 될 수는 없다');
  }
});

test('십신은 일간과의 관계로 정해진다', () => {
  const sp = computeSpousePalace(BIRTH, 'M', 2026, 10);
  const TEN = ['비견', '겁재', '식신', '상관', '정재', '편재', '정관', '편관', '정인', '편인'];
  assert.ok(TEN.includes(sp.sipsin), `십신이 이상하다: ${sp.sipsin}`);
  assert.ok(sp.meaning.length > 10, '십신 풀이가 비었다');
});

test('배우자 별은 남자는 재성, 여자는 관성으로 본다', () => {
  // 같은 사주라도 성별에 따라 배우자를 뜻하는 별이 다르다. 뒤집히면 풀이가 통째로 어긋난다.
  for (let d = 1; d <= 40; d++) {
    const b = { year: 1990, month: 1, day: d, hour: '' };
    const m = computeSpousePalace(b, 'M', 2026, 1);
    const f = computeSpousePalace(b, 'F', 2026, 1);
    if (!m) continue;
    assert.equal(m.isSpouseStar, ['정재', '편재'].includes(m.sipsin), `남자 ${m.sipsin}`);
    assert.equal(f.isSpouseStar, ['정관', '편관'].includes(f.sipsin), `여자 ${f.sipsin}`);
    // 성별을 모르면 단정하지 않는다.
    assert.equal(computeSpousePalace(b, null, 2026, 1).isSpouseStar, false);
  }
});

test('세운이 그 자리를 건드리는 해만 골라 준다', () => {
  const sp = computeSpousePalace(BIRTH, 'M', 2026, 24);
  for (const t of sp.timeline) {
    assert.ok(t.year >= 2026 && t.year < 2050, `범위 밖의 해: ${t.year}`);
    assert.ok(t.kinds.length > 0, '아무 관계도 없는데 골라냈다');
    for (const k of t.kinds) assert.ok(['충', '형', '합'].includes(k), `모르는 관계: ${k}`);
  }
  // 충은 열두 해에 한 번 돌아온다. 24년을 보면 두 번은 있어야 한다.
  const chung = sp.timeline.filter(t => t.kinds.includes('충'));
  assert.equal(chung.length, 2, `24년에 충이 ${chung.length}번 — 주기가 어긋났다`);
  assert.equal(chung[1].year - chung[0].year, 12, '충 주기가 12년이 아니다');
});

test('세운 지지가 실제 간지와 맞는다', () => {
  // 1984년은 갑자년이라 지지가 子다. 여기가 어긋나면 모든 해가 밀린다.
  const sp = computeSpousePalace(BIRTH, 'M', 1984, 12);
  const all = [];
  for (let i = 0; i < 12; i++) {
    const one = computeSpousePalace(BIRTH, 'M', 1984 + i, 1);
    if (one.timeline[0]) all.push([1984 + i, one.timeline[0].branch]);
  }
  const JJ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  for (const [y, b] of all) {
    assert.equal(b, JJ[(y - 1984) % 12], `${y}년 지지가 틀렸다`);
  }
  assert.ok(sp.timeline.length > 0);
});

test('생년월일이 없으면 계산하지 않는다', () => {
  for (const bad of [{}, { year: 0 }, { year: 1990 }]) {
    assert.equal(computeSpousePalace(bad, 'M', 2026, 10), null, JSON.stringify(bad));
  }
});

test('이혼을 예언하지 말라는 지시가 프롬프트에 남아 있다', () => {
  // 이 기능의 존재 이유이자 안전장치다. 문구를 다듬는 건 자유지만 이게 빠지면
  // "당신은 이혼할 사주입니다"가 나갈 수 있다.
  const at = worker.indexOf('async function handleSpousePalace');
  const span = worker.slice(at, at + 6000);
  assert.match(span, /이혼을 예언하지/, '이혼 예언 금지 지시가 사라졌다');
  assert.match(span, /시험을 받는 때/, '충을 끝이 아니라 시험으로 본다는 설명이 사라졌다');
  assert.match(span, /배우자가 있다고 단정하지/, '혼자인 사람 배려가 사라졌다');
});
