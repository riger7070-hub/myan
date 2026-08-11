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
  assert.equal(s.size, 3, `서버 상품이 3개가 아니다(${s.size})`);
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
  const rows = [...serverProducts().values()].sort((x, y) => x.tokens - y.tokens);
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].amount / rows[i - 1].tokens;
    const cur = rows[i].amount / rows[i].tokens;
    assert.ok(cur < prev,
      `토큰 ${rows[i].tokens}개의 개당 값(${cur.toFixed(0)}원)이 ` +
      `${rows[i - 1].tokens}개(${prev.toFixed(0)}원)보다 싸지 않다`);
  }
});
