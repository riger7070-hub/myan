// 웹에서 실결제를 못 받는 동안 무엇을 보여주는가.
//
// 클라이언트 키가 test_ck_ 인 채로 결제 버튼을 두면, 사려는 사람이 결제창까지 갔다가
// 오류만 보고 떠난다. 그게 제일 나쁜 상태다 — 돈을 내려는 사람을 막는 셈이다.
// 그동안은 토스 미니앱으로 안내한다(거기는 인앱결제라 PG 계약 없이 실결제가 된다).
//
// ⚠️ 여기서 절대 흐려지면 안 되는 것: 웹과 미니앱은 **계정도 엽전도 별개**다.
//    "이어서 결제하기" 라고 말해 놓고 안 이어지면 그게 제일 나쁜 거짓말이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
const WORKER = readFileSync(join(ROOT, 'worker.js'), 'utf8');

const 판정 = eval(`(${APP.match(/function _webPayLive\(\)[\s\S]*?\n\}/)[0]
  .replace('function _webPayLive()', 'function (TOSS_CLIENT_KEY)')})`);

test('⚠️ 테스트 키로는 결제창을 띄우지 않는다', () => {
  assert.equal(판정('test_ck_lpP2YxJ4K877JAdv7KX8RGZwXLOb'), false, '테스트 키인데 실결제로 본다');
  assert.equal(판정(''), false, '키가 없는데 실결제로 본다');
  assert.equal(판정('test_sk_abc'), false);
});

test('라이브 키로 바꾸면 저절로 되살아난다', () => {
  // 따로 켜 줄 스위치를 두면 그걸 잊는다. 키 앞자리만 보고 판단해야 한다.
  assert.equal(판정('live_ck_abcdef'), true, '라이브 키인데 막고 있다');
  const src = APP.match(/function _webPayLive\(\)[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(src, /localStorage|sessionStorage|WEB_PAY_ENABLED|== true/,
    '키 말고 다른 스위치를 보고 있다 — 그걸 잊으면 라이브 후에도 막힌다');
});

test('충전과 구독 둘 다 막는다', () => {
  for (const fn of ['buyToken', 'subscribeMembership']) {
    const m = APP.match(new RegExp(`async function ${fn}\\([\\s\\S]{0,700}`));
    assert.ok(m, `${fn} 을 못 찾았다`);
    assert.match(m[0], /_webPayLive\(\)/, `${fn} 이 실결제 가능 여부를 안 본다`);
    assert.match(m[0], /_showMiniPayGuide\(\)/, `${fn} 이 안내를 안 띄운다`);
  }
});

test('결제창을 부르기 전에 막는다', () => {
  // 순서가 뒤집히면 결제창이 먼저 뜨고 나서 안내가 뜬다.
  const f = APP.match(/async function buyToken\([\s\S]*?\n\}/)[0];
  const guard = f.indexOf('_webPayLive()');
  const pay = f.indexOf('requestPayment');
  assert.ok(guard > -1 && (pay === -1 || guard < pay),
    '결제 요청보다 늦게 막는다');
});

test('⚠️ 계정이 별개라는 것을 밝힌다', () => {
  const f = APP.match(/function _showMiniPayGuide\(\)[\s\S]*?\n\}/)[0];
  // 네 언어 모두에서 "별개" 라는 사실이 나와야 한다.
  for (const [lang, 말] of [['ko', /별개의 계정/], ['en', /separate account/i],
                            ['zh', /独立的账户/], ['ja', /別のアカウント/]]) {
    assert.match(f, 말, `${lang}: 계정이 별개라는 말이 없다`);
  }
  // 이어진다고 말하면 안 된다.
  assert.doesNotMatch(f, /이어서 결제|이어집니다|continue your purchase/i,
    '이어진다고 말한다 — 미니앱에서 사면 웹 잔액은 그대로다');
});

test('그 고지가 실제로 눈에 걸리게 그려진다', () => {
  // 본문에 섞어 두면 흘려 읽는다. 따로 세워야 한다.
  const f = APP.match(/function _showMiniPayGuide\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /class="mpg-warn"/, '고지가 별도 자리에 안 들어갔다');
  const block = CSS.slice(CSS.indexOf('.mpg-warn'), CSS.indexOf('.mpg-warn') + 400);
  assert.match(block, /border/, '테두리 없이 본문처럼 보인다');
});

test('토스로 가는 링크가 딥링크가 아니다', () => {
  // intoss:// 는 PC 에서 죽는다. 웹에서 안내하는 자리라 더더욱 안 된다.
  const link = APP.match(/const MINI_APP_LINK = '([^']+)'/)?.[1];
  assert.ok(link, '미니앱 주소가 없다');
  assert.doesNotMatch(link, /^intoss:/, '딥링크를 쓴다 — PC 에서 아무 일도 안 난다');
  assert.match(link, /\/app/, '/app 을 거치지 않는다');
  assert.match(link, /ref=/, '어디서 온 유입인지 안 남긴다');
});

test('안내에 쓴 모양이 style.css 에 있다', () => {
  const f = APP.match(/function _showMiniPayGuide\(\)[\s\S]*?\n\}/)[0];
  const classes = [...new Set([...f.matchAll(/class="([a-z-]+)"/g)].flatMap(m => m[1].split(/\s+/)))];
  const missing = classes.filter(c => !CSS.includes('.' + c));
  assert.deepEqual(missing, [], `style.css 에 없는 모양: ${missing.join(', ')}`);
});

test('원장이 실제로 갈려 있다 — 이 안내의 전제', () => {
  // 고지가 사실이어야 한다. 언젠가 원장을 합치면 이 안내부터 고쳐야 한다.
  const l = WORKER.match(/const _LEDGERS = \{[\s\S]*?\};/)[0];
  assert.match(l, /web:\s*\{\s*table: 'payment_requests'/, '웹 원장이 바뀌었다');
  assert.match(l, /mini:\s*\{\s*table: 'mini_payment_requests'/, '미니앱 원장이 바뀌었다');
});

test('⚠️ 안내를 붙이기만 하고 켜지 않는 일이 없다', () => {
  // .modal-overlay 는 기본이 display:none 이다. 붙이기만 하면 화면에 아무것도
  // 안 보이는데, 코드만 읽으면 멀쩡해 보인다 — 실제로 그렇게 한 번 나갔다.
  const f = APP.match(/function _showMiniPayGuide\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /className = 'modal-overlay'|class="modal-overlay"/,
    '덧칸 클래스가 바뀌었다 — 아래 검사의 전제가 달라졌다');
  const base = CSS.slice(CSS.indexOf('.modal-overlay'), CSS.indexOf('.modal-overlay') + 200);
  if (/display:\s*none/.test(base)) {
    assert.match(f, /style\.display\s*=\s*'(flex|block)'/,
      '.modal-overlay 가 기본 숨김인데 켜 주지 않는다 — 아무것도 안 보인다');
  }
});

test('닫을 길이 두 개 있다', () => {
  // 모달에 갇히면 그 자리에서 이탈한다.
  const f = APP.match(/function _showMiniPayGuide\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /\.mpg-close.*onclick|querySelector\('\.mpg-close'\)\.onclick/s, '닫기 버튼이 없다');
  assert.match(f, /e\.target === el/, '바깥을 눌러도 안 닫힌다');
});
