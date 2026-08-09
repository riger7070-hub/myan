// 간단 풀이에 적히는 오행 퍼센트와 "가장 강한/부족한 기운" 라벨이 서로 어긋나지 않는지.
//
// 화면에는 두 줄이 나란히 나온다:
//   목0% 화38% 토13% 금37% 수12%
//   가장 강한 기운: 화(불)
// 이 두 줄은 각각 _ohaengPct 와 _strongElem 이 만드는데, 예전엔 서로 다른 값을 보고
// 계산했다 — 퍼센트는 반올림 오차를 최댓값 하나에 몰아넣었고, 라벨은 반올림 전
// 원본 개수를 고정 순서로 비교했다. 그래서 "금 38%" 를 띄워 놓고 "가장 강한 기운: 화"
// 라고 적는 일이 생년월일 4건 중 1건꼴로 일어났다(552건 중 138건).
//
// 사주 계산 자체는 saju-golden 이 잡는다. 여기서는 계산 결과를 사람에게 보여주는
// 마지막 단계만 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

// 라벨 검사는 헬퍼를 따로 부르지 않고 buildLocalReading 이 실제로 뱉는 문장을 읽는다.
// _strongElem 이 _ohaengPct 에서 값을 뽑는 이상 둘을 나란히 비교하면 정의상 늘 같아서
// 아무것도 잡지 못한다 — 사용자가 보는 것은 두 함수가 아니라 완성된 한 덩어리 글이다.
const { computeSaju, buildLocalReading, ilchin, _ohaengPct, _ELEM_FR } =
  await loadWorker(['computeSaju', 'buildLocalReading', 'ilchin', '_ohaengPct', '_ELEM_FR']);

const ELEMS = ['木','火','土','金','水'];

const IL = ilchin();
const KO_LABEL_TO_ELEM = new Map(ELEMS.map(k => [_ELEM_FR.ko[k], k]));

/** 완성된 한국어 간단 풀이에서 퍼센트 5개와 강·약 라벨을 뽑아낸다. */
function parseReading(saju) {
  const { reading } = buildLocalReading(saju, 'ko', IL, '테스트');
  const nums = reading.match(/목(\d+)% 화(\d+)% 토(\d+)% 금(\d+)% 수(\d+)%/);
  assert.ok(nums, `분포 줄을 찾지 못했다 — 문구가 바뀌었으면 이 정규식도 고칠 것:\n${reading}`);
  const strongLabel = reading.match(/가장 강한 기운: (.+)/)?.[1]?.trim();
  const needLabel   = reading.match(/부족한 기운: (.+)/)?.[1]?.trim();
  assert.ok(strongLabel && needLabel, `강·약 라벨을 찾지 못했다:\n${reading}`);

  const pct = {};
  ELEMS.forEach((k, i) => pct[k] = Number(nums[i + 1]));
  return {
    pct,
    strong: KO_LABEL_TO_ELEM.get(strongLabel),
    need:   KO_LABEL_TO_ELEM.get(needLabel),
    strongLabel, needLabel,
  };
}

// 넓게 훑는다 — 동점은 특정 생년월일이 아니라 기둥 조합에서 나오므로 표본이 필요하다.
const SAMPLES = [];
for (let y = 1940; y <= 2025; y++) {
  for (let m = 1; m <= 12; m += 1) {
    for (const d of [3, 17, 28]) SAMPLES.push([y, m, d]);
  }
}

test('표본이 충분히 많다', () => {
  assert.ok(SAMPLES.length >= 3000, `표본 ${SAMPLES.length}건은 너무 적다`);
});

test('퍼센트 합은 항상 정확히 100 이다', () => {
  for (const [y, m, d] of SAMPLES) {
    const s = computeSaju(y, m, d, '오시');
    if (!s) continue;
    const pct = _ohaengPct(s.elem);
    const sum = ELEMS.reduce((a, k) => a + pct[k], 0);
    assert.equal(sum, 100, `${y}-${m}-${d}: 합이 ${sum} (${JSON.stringify(pct)})`);
  }
});

test('완성된 풀이에서 "가장 강한 기운"이 적힌 최대 퍼센트와 일치한다', () => {
  for (const [y, m, d] of SAMPLES) {
    const s = computeSaju(y, m, d, '오시');
    if (!s) continue;
    const { pct, strong, strongLabel } = parseReading(s);
    assert.ok(strong, `라벨 "${strongLabel}" 을 오행으로 되돌리지 못했다`);
    const max = Math.max(...ELEMS.map(k => pct[k]));
    assert.equal(pct[strong], max,
      `${y}-${m}-${d}: 풀이에 "${strongLabel} ${pct[strong]}%" 라고 적혀 있는데 최대는 ${max}% — ${JSON.stringify(pct)}`);
  }
});

test('완성된 풀이에서 "부족한 기운"이 적힌 최소 퍼센트와 일치한다', () => {
  for (const [y, m, d] of SAMPLES) {
    const s = computeSaju(y, m, d, '오시');
    if (!s) continue;
    const { pct, need, needLabel } = parseReading(s);
    assert.ok(need, `라벨 "${needLabel}" 을 오행으로 되돌리지 못했다`);
    const min = Math.min(...ELEMS.map(k => pct[k]));
    assert.equal(pct[need], min,
      `${y}-${m}-${d}: 풀이에 "${needLabel} ${pct[need]}%" 라고 적혀 있는데 최소는 ${min}% — ${JSON.stringify(pct)}`);
  }
});

test('개수가 많은 기운이 퍼센트에서 뒤집히지 않는다', () => {
  // 반올림이 순서를 바꾸면 안 된다. 3개짜리가 1개짜리보다 낮게 표시되는 식.
  for (const [y, m, d] of SAMPLES) {
    const s = computeSaju(y, m, d, '오시');
    if (!s) continue;
    const pct = _ohaengPct(s.elem);
    for (const a of ELEMS) {
      for (const b of ELEMS) {
        if ((s.elem[a] || 0) > (s.elem[b] || 0)) {
          assert.ok(pct[a] >= pct[b],
            `${y}-${m}-${d}: ${a}(${s.elem[a]}개)=${pct[a]}% 가 ${b}(${s.elem[b]}개)=${pct[b]}% 보다 낮다`);
        }
      }
    }
  }
});

test('같은 개수는 1%p 를 넘게 벌어지지 않는다', () => {
  // 정수 퍼센트라 3:3 을 38:37 로 쪼개는 것까지는 어쩔 수 없다. 다만 예전처럼
  // 오차를 한쪽에 몰아 38:36 으로 벌어지면 사람 눈에 "다른 값"으로 읽힌다.
  for (const [y, m, d] of SAMPLES) {
    const s = computeSaju(y, m, d, '오시');
    if (!s) continue;
    const pct = _ohaengPct(s.elem);
    for (const a of ELEMS) {
      for (const b of ELEMS) {
        if ((s.elem[a] || 0) === (s.elem[b] || 0)) {
          assert.ok(Math.abs(pct[a] - pct[b]) <= 1,
            `${y}-${m}-${d}: ${a}·${b} 둘 다 ${s.elem[a]}개인데 ${pct[a]}% 대 ${pct[b]}%`);
        }
      }
    }
  }
});

test('기운이 하나도 없으면 전부 0% 다 (100% 로 튀지 않는다)', () => {
  const pct = _ohaengPct({});
  assert.deepEqual(pct, { 木:0, 火:0, 土:0, 金:0, 水:0 });
});
