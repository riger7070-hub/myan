// 결제창을 스스로 닫은 것을 실패로 다루지 않는지.
//
// 실제 신고: 결제를 취소했더니 "결제가 완료되지 않았어요. (사용자가 결제를 취소했습니다.
// (orderId: bffcd38b-…))" 가 붉은 글씨로 뜨고, 화면을 옮겨도 계속 남아 있었다.
// 스스로 그만둔 사람에게 겁을 주는 문구인 데다, orderId 는 읽어도 할 수 있는 일이 없다.
//
// 화면 코드라 브라우저 없이 돌릴 수 없으므로, 판단에 쓰는 두 조각(취소인지 가리는 규칙,
// 사람에게 보여줄 말로 다듬는 함수)을 소스에서 떼어 내 직접 확인한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'mini', 'src', 'main.js'), 'utf8');

// const IAP_CANCEL_RE = /…/i;  를 그대로 되살린다.
const reSrc = SRC.match(/const IAP_CANCEL_RE = \/(.+?)\/([a-z]*);/);
assert.ok(reSrc, 'IAP_CANCEL_RE 를 못 찾았다');
const CANCEL = new RegExp(reSrc[1], reSrc[2]);

// _iapReason 도 같은 방식으로 되살린다.
const fnSrc = SRC.match(/const _iapReason = ([\s\S]*?);\s*\n\s*\nfunction buyTokens/);
assert.ok(fnSrc, '_iapReason 을 못 찾았다');
const _iapReason = eval(`(${fnSrc[1]})`);   // 소스 그대로를 검사하는 게 목적이다

test('사용자가 그만둔 경우를 취소로 알아본다', () => {
  const 취소들 = [
    '사용자가 결제를 취소했습니다. (orderId: bffcd38b-0936-4ecc-9472-7878883ed184)',
    '결제를 취소했습니다',
    'User canceled the payment',
    'PAYMENT_CANCELLED',
    'user_deny',
    'Purchase aborted by user',
    '결제창을 닫았습니다',
  ];
  for (const m of 취소들) assert.ok(CANCEL.test(m), `취소로 못 알아봤다: ${m}`);
});

test('진짜 실패는 취소로 넘기지 않는다', () => {
  const 실패들 = [
    'Product not found',
    'NETWORK_ERROR',
    '상품을 찾을 수 없습니다',
    'INVALID_SKU',
    'Insufficient balance',
  ];
  for (const m of 실패들) assert.ok(!CANCEL.test(m), `취소로 잘못 봤다: ${m}`);
});

test('사용자에게 보여줄 말에서 orderId 를 뺀다', () => {
  const got = _iapReason('결제에 실패했습니다. (orderId: bffcd38b-0936-4ecc-9472-7878883ed184)');
  assert.doesNotMatch(got, /orderId/i, 'orderId 가 그대로 남았다');
  assert.doesNotMatch(got, /bffcd38b/, '주문번호가 그대로 남았다');
  assert.match(got, /결제에 실패했습니다/, '정작 원인은 사라졌다');
});

test('보여줄 말은 짧게 자른다', () => {
  assert.ok(_iapReason('가'.repeat(400)).length <= 90, '90자를 넘겼다');
  assert.equal(_iapReason(''), '알 수 없는 오류', '빈 값일 때 보여줄 말이 없다');
});

test('취소면 오류 문구를 세우지 않는다', () => {
  // onError 안에서 취소 분기가 state.error 를 비우고 곧장 끝내야 한다.
  const body = SRC.slice(SRC.indexOf('onError: (err) =>'), SRC.indexOf('function _shareText') + 1 || undefined)
    .slice(0, 1200);
  assert.match(body, /IAP_CANCEL_RE\.test\(detail\)\)\s*\{\s*state\.error = '';/,
    '취소일 때 state.error 를 비우고 돌아가지 않는다');
});

test('충전 화면이 SDK 내부 사정을 사용자에게 보여주지 않는다', () => {
  // "상품 목록을 불러오지 못했어요. (Cannot read properties of undefined (reading
  // 'operationalEnvironment'))" 같은 글이 붉게 떠 있었다. 읽어도 할 수 있는 일이 없고,
  // 살 수 있는데도 못 사는 줄 알게 만든다.
  const f = SRC.match(/async function loadProducts\(\)[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(f, /state\.catalogError\s*=\s*`[^`]*\$\{e/,
    '예외 메시지를 그대로 화면에 담는다');
  assert.match(f, /console\.warn\('\[products:iap\]'/, '원인을 콘솔에도 안 남긴다');
  assert.match(f, /state\.catalogLoading = true/, '불러오는 중임을 표시하지 않는다');

  const i = SRC.indexOf("case 'charge': {");
  const charge = SRC.slice(i, i + 3000);
  assert.match(charge, /skel-tile/, '불러오는 동안 자리를 잡아 두지 않는다');
  assert.match(charge, /btn-retry-products/, '다시 시도할 길이 없다');
  assert.doesNotMatch(charge, /class="err"/, '충전 화면에 붉은 글씨가 남아 있다');
  // 콘솔 SKU 로만 살 수 있다. 코드에 적어 둔 목록을 대신 그리면 눌러도 결제가 안 된다.
  assert.match(charge, /const list = state\.catalog \|\| \[\]/,
    '못 불러왔을 때 코드의 목록으로 대신 그린다 — 눌러도 결제가 안 된다');
});

test('화면을 떠날 때 오류 문구를 놓는다', () => {
  // 결제 화면에서 난 말이 홈까지 따라오면 안 된다.
  assert.match(SRC, /on\('btn-home2', \(\) => \{ state\.error = ''; go\('home'\); \}\)/,
    "btn-home2 가 state.error 를 비우지 않는다");
  assert.match(SRC, /function goBack\(\)[\s\S]{0,420}state\.error = '';/,
    '뒤로가기가 state.error 를 비우지 않는다');
});
