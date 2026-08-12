// 이사 방위(본명궁과 팔택) 계산.
//
// 본명궁은 남녀 셈법이 다르고, 중궁(5)은 방위가 없어 따로 옮겨 봐야 한다.
// 팔택 표도 궁마다 여덟 방위가 겹치지 않게 배정되어야 한다 — 한 칸만 어긋나도
// 길방과 흉방이 뒤바뀐다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { computeBonmyeong, computeDirection } =
  await loadWorker(['computeBonmyeong', 'computeDirection']);

const DIRS = ['동', '서', '남', '북', '동남', '동북', '서남', '서북'];
const KINDS = ['생기', '천의', '연년', '복위', '화해', '오귀', '육살', '절명'];

test('남녀 셈법이 다르다', () => {
  // 같은 해에 태어나도 본명궁이 갈린다. 같으면 셈이 한쪽으로 쏠린 것이다.
  let differ = 0;
  for (let y = 1970; y <= 2010; y++) {
    if (computeBonmyeong(y, 'M') !== computeBonmyeong(y, 'F')) differ++;
  }
  assert.ok(differ > 30, `41년 중 ${differ}년만 달랐다 — 남녀 셈이 같아졌는지 확인할 것`);
});

test('본명궁은 1~9 중 5를 뺀 값이다', () => {
  for (let y = 1930; y <= 2030; y++) {
    for (const g of ['M', 'F']) {
      const gung = computeBonmyeong(y, g);
      assert.ok(gung >= 1 && gung <= 9, `${y} ${g}: 범위 밖 ${gung}`);
      assert.notEqual(gung, 5, `${y} ${g}: 중궁(5)이 그대로 남았다 — 방위가 없는 궁이다`);
      assert.ok(Number.isInteger(gung), `${y} ${g}: 정수가 아니다`);
    }
  }
});

test('중궁은 남자는 곤(2), 여자는 간(8)으로 옮긴다', () => {
  // 합이 5로 떨어지는 해를 찾아 확인한다.
  const digitSum = (y) => { let s = String(y).split('').reduce((a, c) => a + +c, 0);
    while (s > 9) s = String(s).split('').reduce((a, c) => a + +c, 0); return s; };
  let checkedM = 0, checkedF = 0;
  for (let y = 1900; y <= 2050; y++) {
    const sum = digitSum(y);
    let m = 11 - sum; while (m > 9) m -= 9;
    let f = sum + 4;  while (f > 9) f -= 9;
    if (m === 5) { assert.equal(computeBonmyeong(y, 'M'), 2, `${y} 남자 중궁이 곤으로 안 갔다`); checkedM++; }
    if (f === 5) { assert.equal(computeBonmyeong(y, 'F'), 8, `${y} 여자 중궁이 간으로 안 갔다`); checkedF++; }
  }
  assert.ok(checkedM > 0 && checkedF > 0, '중궁이 되는 해를 못 찾았다');
});

test('궁마다 여덟 방위가 겹치지 않게 배정된다', () => {
  for (const gung of [1, 2, 3, 4, 6, 7, 8, 9]) {
    const d = computeDirection(2000, 'M') && null;   // 표 자체를 보기 위해 아래에서 직접
    void d;
  }
  // 실제 표는 computeDirection 을 통해 확인한다. 모든 궁이 나오도록 여러 해를 훑는다.
  const seen = new Map();
  for (let y = 1950; y <= 2030; y++) {
    for (const g of ['M', 'F']) {
      const r = computeDirection(y, g);
      if (!r || seen.has(r.gung)) continue;
      seen.set(r.gung, r);
    }
  }
  assert.equal(seen.size, 8, `궁이 ${seen.size}가지만 나왔다 — 여덟이어야 한다`);
  for (const [gung, r] of seen) {
    const dirs = r.rows.map(x => x.dir);
    const kinds = r.rows.map(x => x.kind);
    assert.equal(new Set(dirs).size, 8, `${gung}궁: 방위가 겹친다 (${dirs.join(',')})`);
    assert.equal(new Set(kinds).size, 8, `${gung}궁: 길흉 이름이 겹친다`);
    for (const x of r.rows) {
      assert.ok(DIRS.includes(x.dir), `${gung}궁: 모르는 방위 ${x.dir}`);
      assert.ok(KINDS.includes(x.kind), `${gung}궁: 모르는 길흉 ${x.kind}`);
    }
    assert.equal(r.good.length, 4, `${gung}궁: 길방이 넷이 아니다`);
    assert.equal(r.bad.length, 4, `${gung}궁: 흉방이 넷이 아니다`);
  }
});

test('복위는 자기 궁의 방위여야 한다', () => {
  // 복위(伏位)는 제자리다. 감궁이면 북, 리궁이면 남 하는 식이다.
  const HOME = { 1: '북', 2: '서남', 3: '동', 4: '동남', 6: '서북', 7: '서', 8: '동북', 9: '남' };
  const seen = new Set();
  for (let y = 1950; y <= 2030; y++) {
    for (const g of ['M', 'F']) {
      const r = computeDirection(y, g);
      if (!r || seen.has(r.gung)) continue;
      seen.add(r.gung);
      const bokwi = r.rows.find(x => x.kind === '복위');
      assert.equal(bokwi.dir, HOME[r.gung], `${r.gung}궁의 복위가 ${bokwi.dir} 로 나왔다`);
    }
  }
});

test('동사택과 서사택을 갈라 준다', () => {
  const EAST = [1, 3, 4, 9];
  for (let y = 1960; y <= 2020; y++) {
    for (const g of ['M', 'F']) {
      const r = computeDirection(y, g);
      assert.equal(r.group, EAST.includes(r.gung) ? '동사택' : '서사택',
        `${r.gung}궁의 택이 ${r.group} 로 나왔다`);
    }
  }
});

test('성별을 모르면 셈하지 않는다', () => {
  // 남녀 셈이 달라 성별 없이는 답이 없다. 대충 남자로 치면 절반이 틀린 답을 받는다.
  assert.equal(computeBonmyeong(1990, null), null);
  assert.equal(computeBonmyeong(1990, ''), null);
  assert.equal(computeDirection(1990, undefined), null);
});
