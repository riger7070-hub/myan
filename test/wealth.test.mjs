// 재물운 계산.
//
// 사주에서 돈은 재성(정재·편재)으로 보지만, 재성이 많다고 부자가 아니다.
//   재성을 낳는 힘(식상)이 있어야 돈길이 생기고,
//   나눠 갖는 힘(비겁)이 세면 벌어도 남지 않으며,
//   몸이 약한데 재성만 크면 감당하지 못한다.
// 이 셋의 관계로 그림을 정하는데, 판정이 흔들리면 글 전체가 헛말이 된다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { computeSaju, computeWealth, computeSipsinSpread } =
  await loadWorker(['computeSaju', 'computeWealth', 'computeSipsinSpread']);

const of = (y, m, d, h) => computeWealth(computeSaju(y, m, d, h), 2026, 10);

test('백분율이 십신 분포와 어긋나지 않는다', () => {
  const saju = computeSaju(1999, 7, 18, '사시');
  const w = computeWealth(saju, 2026, 10);
  const spread = computeSipsinSpread(saju);
  const jae = spread.spread.filter(x => ['정재', '편재'].includes(x.name))
    .reduce((a, x) => a + x.pct, 0);
  assert.equal(w.jae, jae, '재성 비율이 분포와 다르다');
  assert.equal(w.body, w.big + w.inseong, '몸의 힘은 비겁과 인성의 합이어야 한다');
});

test('그림은 다섯 가지 중 하나로 정해진다', () => {
  const SHAPES = new Set(['재성무', '재다신약', '군겁쟁재', '식상생재', '신왕재왕']);
  let seen = new Set();
  for (let m = 1; m <= 12; m++) {
    for (const d of [3, 11, 19, 27]) {
      const w = of(1990, m, d, '자시');
      if (!w) continue;
      assert.ok(SHAPES.has(w.shape), `모르는 판정: ${w.shape}`);
      assert.ok(w.note && w.note.length > 10, '판정에 설명이 없다');
      seen.add(w.shape);
    }
  }
  assert.ok(seen.size >= 3, `판정이 ${seen.size}가지뿐이다 — 분기가 죽어 있는지 확인할 것`);
});

test('재성이 없으면 재성무로 본다', () => {
  // 재성 0% 인 사주를 찾아 판정을 확인한다.
  let found = false;
  for (let y = 1980; y <= 2000 && !found; y++) {
    for (let m = 1; m <= 12 && !found; m++) {
      const w = of(y, m, 15, '오시');
      if (w && w.jae === 0) {
        assert.equal(w.shape, '재성무', `재성이 0인데 ${w.shape} 로 나왔다`);
        // 재성이 없다고 기죽이면 안 된다. 없다는 사실 뒤에 반드시 다른 길이 와야 한다.
        assert.match(w.note, /돈이 없다는 뜻이 아니라/, '기죽이지 않는 설명이 없다');
        assert.doesNotMatch(w.note, /가난|빈곤|돈복이 없/, '겁주는 낱말이 들어 있다');
        found = true;
      }
    }
  }
  assert.ok(found, '재성이 0인 사주를 못 찾았다 — 계산을 확인할 것');
});

test('재성이 몸보다 크면 재다신약', () => {
  let found = false;
  for (let y = 1985; y <= 2005 && !found; y++) {
    for (let m = 1; m <= 12 && !found; m++) {
      const w = of(y, m, 8, '축시');
      if (w && w.jae > 0 && w.jae > w.body) {
        assert.equal(w.shape, '재다신약', `재성 ${w.jae} > 몸 ${w.body} 인데 ${w.shape}`);
        found = true;
      }
    }
  }
  assert.ok(found, '재다신약 사주를 못 찾았다');
});

test('재성이 앉은 자리를 짚어 준다', () => {
  const POS = new Set(['년', '월', '일', '시']);
  const w = of(1988, 5, 5, '진시');
  for (const seat of w.seats) {
    assert.ok(POS.has(seat.pos), `모르는 자리: ${seat.pos}`);
    assert.ok(['정재', '편재'].includes(seat.name), `재성이 아닌 것이 들었다: ${seat.name}`);
    assert.ok(seat.mean && seat.mean.length > 5, '자리의 뜻이 비었다');
  }
  // 같은 자리를 두 번 세지 않는다(천간과 지지 본기가 둘 다 재성일 때).
  const positions = w.seats.map(x => x.pos);
  assert.equal(new Set(positions).size, positions.length, '같은 기둥이 두 번 들었다');
});

test('앞으로 10년을 훑어 재물이 드는 해를 준다', () => {
  const w = of(1995, 3, 20, '미시');
  assert.ok(Array.isArray(w.years), '해 목록이 없다');
  for (const y of w.years) {
    assert.ok(y.year >= 2026 && y.year < 2036, `범위 밖의 해: ${y.year}`);
    assert.ok(['정재', '편재', '식신', '상관'].includes(y.sipsin), `엉뚱한 십신: ${y.sipsin}`);
    // 재성이 아니라 식상이면 '돈길이 열리는 해' 로 따로 표시한다.
    if (['식신', '상관'].includes(y.sipsin)) assert.equal(y.feeds, true);
  }
  const yearsOnly = w.years.map(y => y.year);
  assert.equal(new Set(yearsOnly).size, yearsOnly.length, '같은 해가 두 번 들었다');
});

test('생년월일이 없으면 조용히 없다고 한다', () => {
  assert.equal(computeWealth(null, 2026), null);
});
