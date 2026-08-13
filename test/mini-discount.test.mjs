// 첫 구매 할인 표시.
//
// 콘솔에서 "결제 이력이 없는 유저" 에게 할인을 걸면 결제도 지급도 알아서 된다
// (지급은 SKU 로 하므로 금액과 무관하다). 문제는 **사람이 그걸 모른다**는 것이다.
//
// SDK 의 소모품 타입(ConsumableProductListItem)이 주는 값은 displayAmount 하나뿐이라,
// "원래 4,290원" 이라는 정보가 아예 안 내려온다. offers(할인 정보)는 구독 상품에만
// 붙고 엽전은 소모품이다. 그래서 정가는 우리 서버(/mini/api/products)에서 받아
// 두 값을 견준다.
//
// ⚠️ 할인율도 기간도 코드에 박으면 안 된다. 기간이 끝나면 그 글자만 남고,
//    할인 대상이 아닌 사람(이미 결제한 사람)에게도 보인다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(ROOT, 'mini', 'src', 'main.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'mini', 'src', 'style.css'), 'utf8');
const WORKER = readFileSync(join(ROOT, 'worker.js'), 'utf8');

const _discountOf = eval(
  `(${APP.match(/function _discountOf\(displayAmount, listed\) \{[\s\S]*?\n\}/)[0]
    .replace('function _discountOf', 'function')})`);

// 콘솔에 건 할인. 정가 → 할인가.
const 할인 = [
  ['2,750원', 4290, 36],
  ['4,950원', 9900, 50],
  ['13,750원', 27500, 50],
];

test('할인율을 정가와 견주어 스스로 알아낸다', () => {
  for (const [display, listed, off] of 할인) {
    assert.deepEqual(_discountOf(display, listed),
      { listPrice: listed.toLocaleString('ko-KR') + '원', off },
      `${display} / ${listed}`);
  }
});

test('통화 표기가 달라도 읽어 낸다', () => {
  assert.equal(_discountOf('₩2,750', 4290).off, 36);
  assert.equal(_discountOf('2750', 4290).off, 36);
});

test('할인이 끝나면 표시도 저절로 사라진다', () => {
  // 기간이 지나면 SDK 가 정가를 준다. 그때 아무것도 안 나와야 한다.
  assert.deepEqual(_discountOf('4,290원', 4290), {});
  assert.deepEqual(_discountOf('27,500원', 27500), {});
});

test('값이 수상하면 조용히 넘어간다', () => {
  // 정가를 못 받았거나(서버 응답 실패) 값이 이상하면 아무 말도 하지 않는다.
  // 없는 할인을 지어내는 것이 표시를 못 하는 것보다 훨씬 나쁘다.
  for (const [a, b] of [
    ['', 4290], [null, 4290], [undefined, 4290],
    ['4,290원', 0], ['4,290원', undefined],
    ['5,000원', 4290],                 // 정가보다 비쌈
    ['4,250원', 4290],                 // 1% - 반올림 차이일 수 있다
    ['100원', 27500],                  // 99% - 뭔가 잘못됐다
  ]) {
    assert.deepEqual(_discountOf(a, b), {}, `${a} / ${b} 에서 엉뚱하게 할인이라 했다`);
  }
});

test('정가는 서버가 내려주는 값에서 온다', () => {
  // 앱에 적어 둔 PRODUCTS 는 콘솔 목록을 못 받았을 때의 자리표시일 뿐이다.
  // 정가는 반드시 /mini/api/products 가 준 값이어야 한다.
  const f = APP.match(/async function loadProducts\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /sellable\.get\(p\.sku\)\?\.amount/, '서버가 준 정가를 안 쓴다');
  assert.match(f, /_discountOf\(p\.displayAmount/, 'SDK 가 준 값과 견주지 않는다');

  // 서버가 실제로 amount 를 실어 보내는지. 안 보내면 표시가 조용히 안 뜬다.
  const products = WORKER.slice(WORKER.indexOf('const MINI_PRODUCTS = {'));
  assert.match(products.slice(0, 400), /amount:\s*\d+/, 'MINI_PRODUCTS 에 정가가 없다');
  assert.match(WORKER, /\.map\(\(\[sku, key\]\) => \(\{ sku, \.\.\.MINI_PRODUCTS\[key\] \}\)\)/,
    '/mini/api/products 가 정가를 빼고 보낸다');
});

test('할인율도 기간도 화면에 박아 두지 않는다', () => {
  const i = APP.indexOf("case 'charge': {");
  const charge = APP.slice(i, i + 3200);
  assert.doesNotMatch(charge, /\d+% 할인['"`]/, '할인율이 글자로 박혀 있다');
  assert.doesNotMatch(charge, /8월 20일|2026-08-20|~까지/, '할인 기간이 박혀 있다');
  assert.match(charge, /\$\{p\.off\}% 할인/, '값에서 끌어낸 할인율 표시가 없다');
  assert.match(charge, /p\.listPrice/, '정가를 그어 보여주지 않는다');
});

test('할인이 아닌 사람에게는 아무것도 안 보인다', () => {
  // 이미 결제한 사람은 정가를 낸다. 그 사람 화면에 취소선이 남으면 거짓말이 된다.
  const i = APP.indexOf("case 'charge': {");
  const charge = APP.slice(i, i + 3200);
  // 할인 관련 조각은 전부 p.off 로 막혀 있어야 한다.
  for (const m of charge.matchAll(/t-off|t-was|첫 구매 할인/g)) {
    const before = charge.slice(Math.max(0, m.index - 120), m.index);
    assert.match(before, /p\.off|some\(p => p\.off\)/,
      `"${m[0]}" 이 할인 여부와 무관하게 그려진다`);
  }
});

test('할인 표시에 쓴 모양이 style.css 에 있다', () => {
  for (const c of ['t-was', 't-off']) {
    assert.ok(CSS.includes('.' + c), `style.css 에 .${c} 가 없다`);
  }
});

test('세일 딱지 색을 쓰지 않는다', () => {
  // 금·먹 팔레트 밖으로 나가면 이 화면만 싸구려가 된다.
  const block = CSS.slice(CSS.indexOf('.t-was'), CSS.indexOf('.t-was') + 700);
  assert.doesNotMatch(block, /red|#f00|#e74|crimson|tomato/i, '붉은 세일 딱지를 붙였다');
  assert.match(block, /--gold|--text-dim/, '팔레트 변수를 안 쓴다');
});
