// 앱에 적힌 가격과 서버가 기록하는 가격이 같은지, 그리고 그 가격이 콘솔에서
// 실제로 만들 수 있는 값인지.
//
// 앱인토스 콘솔은 **공급가**를 받고 판매가 = 공급가 × 1.1(VAT) 로 계산한다.
// 공급가가 정수이므로 판매가는 11 의 배수만 나온다 — 처음 계획했던 3,900원은
// 공급가 3,545.45… 가 되어 만들 수 없었다. 이걸 모르고 코드에 적어 두면
// 화면에는 3,900원이라 쓰여 있는데 실제로는 다른 값이 빠져나간다.
//
// 웹에서 이미 같은 종류의 사고를 겪었다: 표시 가격과 실제 차감액이 달랐다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const app = readFileSync(join(ROOT, 'mini', 'src', 'main.js'), 'utf8');

// worker.js 의 MINI_PRODUCTS
function serverProducts() {
  const block = worker.slice(worker.indexOf('const MINI_PRODUCTS = {'));
  const out = new Map();
  for (const m of block.slice(0, block.indexOf('};')).matchAll(
    /(\w+):\s*\{\s*tokens:\s*(\d+),\s*amount:\s*(\d+)/g)) {
    out.set(m[1], { tokens: Number(m[2]), amount: Number(m[3]) });
  }
  return out;
}

// mini/src/main.js 의 PRODUCTS
function appProducts() {
  const block = app.slice(app.indexOf('const PRODUCTS = ['));
  const out = new Map();
  for (const m of block.slice(0, block.indexOf('];')).matchAll(
    /sku:\s*'(\w+)',\s*tokens:\s*(\d+),[^}]*?price:\s*'([\d,]+)원'/g)) {
    out.set(m[1], { tokens: Number(m[2]), amount: Number(m[3].replace(/,/g, '')) });
  }
  return out;
}

test('앱에 적힌 가격과 서버가 기록하는 가격이 같다', () => {
  const s = serverProducts(), a = appProducts();
  // ⚠️ 개수를 못 박지 않는다. 상품이 늘어나는 것은 정상이고, 여기서 잡으려는 것은
  //    "앱과 서버가 어긋나는 것" 이지 "상품이 몇 개인가" 가 아니다.
  //    다만 정규식이 헛돌아 몇 개만 읽고 그냥 통과하는 일은 막아야 한다.
  assert.ok(s.size >= 4, `서버 상품을 ${s.size}개밖에 못 읽었다 — 뽑는 규칙을 확인할 것`);
  assert.deepEqual([...a.keys()].sort(), [...s.keys()].sort(), 'sku 목록이 다르다');
  for (const [sku, sv] of s) {
    const av = a.get(sku);
    assert.equal(av.tokens, sv.tokens, `${sku}: 토큰 수가 다르다`);
    assert.equal(av.amount, sv.amount,
      `${sku}: 앱은 ${av.amount}원, 서버는 ${sv.amount}원 — 화면과 기록이 어긋난다`);
  }
});

test('판매가가 콘솔에서 만들 수 있는 값이다', () => {
  // 판매가 = 공급가(정수) × 1.1 이므로 11 로 나누어떨어져야 한다.
  for (const [sku, { amount }] of serverProducts()) {
    // 1.1 로 나누면 부동소수점 오차가 난다(3850/1.1 = 3499.9999…).
    // 판매가 = 공급가 × 11/10 이므로 정수끼리 따진다.
    assert.equal((amount * 10) % 11, 0,
      `${sku}: ${amount}원은 공급가가 정수로 떨어지지 않아 콘솔에 넣을 수 없다`);
    const supply = (amount * 10) / 11;
    assert.ok(Number.isInteger(supply), `${sku}: 공급가가 정수가 아니다(${supply})`);
  }
});

test('많이 살수록 개당 값이 싸다', () => {
  // 이 순서가 뒤집히면 위 칸을 고를 이유가 없어진다.
  //
  // ⚠️ 동냥은 뺀다. 사다리의 한 칸이 아니라 딴 물건이고(파는 것은 덕담이다),
  //    주는 엽전 수가 정해져 있지도 않다. 동냥이 구멍이 아닌지는 아래에서
  //    **기댓값으로** 따로 본다.
  const rows = [...serverProducts()].filter(([k]) => k !== 'donate').map(([, v]) => v)
    .sort((x, y) => x.tokens - y.tokens);
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].amount / rows[i - 1].tokens;
    const cur = rows[i].amount / rows[i].tokens;
    assert.ok(cur < prev,
      `토큰 ${rows[i].tokens}개의 개당 값(${cur.toFixed(0)}원)이 ` +
      `${rows[i - 1].tokens}개(${prev.toFixed(0)}원)보다 싸지 않다`);
  }
});

// worker.js 의 ALMS_ODDS 를 읽는다. [엽전 수, 천분율]
function almsOdds() {
  const i = worker.indexOf('const ALMS_ODDS = [');
  const block = worker.slice(i, worker.indexOf('];', i));
  return [...block.matchAll(/\[(\d+),\s*(\d+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

test('동냥 확률표의 합이 정확히 1000 이다', () => {
  const odds = almsOdds();
  assert.ok(odds.length >= 2, `확률표를 ${odds.length}줄밖에 못 읽었다`);
  const sum = odds.reduce((s, [, w]) => s + w, 0);
  // 모자라면 마지막 칸이 안 나오고, 넘치면 굴린 값이 표 밖으로 떨어진다.
  assert.equal(sum, 1000, `확률 합이 ${sum} 이다 — 1000 이어야 한다`);
});

test('동냥이 주는 엽전은 1~10개다', () => {
  const 수 = almsOdds().map(([n]) => n);
  assert.deepEqual(수, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], '주는 엽전 수가 1~10 이 아니다');
});

test('안스님 동냥은 엽전을 싸게 파는 구멍이 아니다', () => {
  // ⚠️ **기댓값으로 따진다.** 동냥은 1~10개를 무작위로 주므로, 표에 적힌 tokens 하나로
  //    보면 실제와 다르다. 1~10 을 고르게 주면 평균 5.5개가 되어 200원/개가 되는데,
  //    가장 싼 엽전 칸이 429원/개이므로 동냥이 엽전을 싸게 사는 노름판이 된다.
  //    그래서 확률을 아래로 몰아 두었고, 그 몰아 둔 것이 유지되는지를 여기서 지킨다.
  //
  //    엽전 칸 값을 내리는 날 이 시험이 깨진다. 그때는 확률표도 함께 봐야 한다.
  const s = serverProducts();
  const donate = s.get('donate');
  if (!donate) return;                       // 아직 안 만들었으면 볼 것이 없다

  const odds = almsOdds();
  const 기댓값 = odds.reduce((sum, [n, w]) => sum + n * w, 0) / 1000;
  const 동냥개당 = donate.amount / 기댓값;
  const 가장싼개당 = Math.min(
    ...[...s].filter(([k]) => k !== 'donate').map(([, v]) => v.amount / v.tokens));

  assert.ok(동냥개당 > 가장싼개당,
    `동냥은 평균 ${기댓값.toFixed(3)}개라 엽전 개당 ${동냥개당.toFixed(0)}원인데 `
    + `가장 싼 칸은 ${가장싼개당.toFixed(0)}원이다 — 동냥으로 엽전을 싸게 살 수 있다`);
});

test('확률은 굴리는 표에서 그대로 내려간다', () => {
  // ⚠️ 화면에 적히는 확률과 실제로 굴리는 확률이 **같은 하나**여야 한다.
  //    앱에 숫자를 손으로 적어 두면 어긋날 수 있고, 그러면 적어 둔 쪽이 거짓말이 된다.
  assert.match(worker, /item\.odds = ALMS_ODDS\.map/, '확률을 앱에 안 내려보낸다');
  assert.match(app, /alms\.odds/, '앱이 서버가 준 확률을 안 쓴다');
  // 앱 안에 확률 숫자를 따로 적어 두지 않았는지도 본다.
  const i = app.indexOf("case 'charge': {");
  const charge = app.slice(i, app.indexOf('default:', i));
  assert.doesNotMatch(charge, /4[05]\s*%|25\s*%/, '앱에 확률 숫자가 손으로 적혀 있다');
});

test('무작위로 준다는 것을 화면에 밝힌다', () => {
  const i = app.indexOf("case 'charge': {");
  const charge = app.slice(i, app.indexOf('default:', i));
  assert.match(charge, /1~10개/, '몇 개를 받을 수 있는지 안 적혀 있다');
  assert.match(charge, /확률 보기/, '확률을 볼 자리가 없다');
});

test('덕담과 엽전을 같은 값으로 뽑지 않는다', () => {
  // 같은 소금을 쓰면 "이 덕담이면 10개" 가 되어, 몇 번 사 본 사람이 결과를 미리 안다.
  assert.match(worker, /_hash32\('덕담:'/, '덕담이 제 소금을 안 쓴다');
  assert.match(worker, /_hash32\('엽전:'/, '엽전이 제 소금을 안 쓴다');
});

test('엽전 수는 주문번호로 굴린다 (재시도로 다시 굴리지 않는다)', () => {
  // ⚠️ 무작위로 굴리면 10개가 나올 때까지 재시도하는 길이 열린다.
  const f = worker.slice(worker.indexOf('function _almsCoinsFor'), worker.indexOf('const _tokensFor'));
  assert.doesNotMatch(f, /Math\.random/, '엽전 수를 무작위로 굴린다');
  assert.match(f, /orderId/, '주문번호를 안 쓴다');
  // 지급하는 자리가 둘(사용자 결제, 관리자 손지급)인데 둘 다 같은 함수를 써야 한다.
  const 쓰는곳 = (worker.match(/_tokensFor\(product, orderId\)/g) || []).length;
  assert.ok(쓰는곳 >= 2, `_tokensFor 를 ${쓰는곳}군데서만 쓴다 — 지급 자리는 둘이다`);
});

test('동냥에는 줄 것이 들어 있다', () => {
  // 돈만 받고 아무것도 주지 않는 상품은 심사에서 걸린다.
  const s = serverProducts();
  if (!s.get('donate')) return;
  assert.ok(s.get('donate').tokens >= 1, '동냥이 아무것도 주지 않는다');
  assert.match(worker, /동냥: true/, '동냥 상품으로 표시되어 있지 않다');
  assert.match(worker, /const MONK_BLESSINGS = \[/, '덕담 목록이 없다');
  // 같은 주문에는 늘 같은 말이 나와야 한다. 재시도로 여러 번 들어오기 때문이다.
  assert.doesNotMatch(worker.slice(worker.indexOf('function _blessingFor')),
    /^[\s\S]{0,400}?Math\.random/, '덕담을 무작위로 뽑는다 — 재시도 때 말이 바뀐다');
});

test('화면에 기부라고 쓰지 않는다', () => {
  // 기부는 인앱결제로 받으면 안 되는 항목이라 스토어 정책에 걸릴 수 있다.
  // 받는 것이 분명한 동냥으로 둔다.
  const i = app.indexOf("case 'charge': {");
  const charge = app.slice(i, app.indexOf('default:', i));
  assert.doesNotMatch(charge, /기부/, '충전 화면에 기부라는 말이 있다');
});
