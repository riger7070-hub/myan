// 로그인보다 서비스 설명이 먼저 나오는지.
//
// 심사에서 이 이유로 반려됐다:
//   "서비스 설명 없이 즉시 토스 로그인을 유도하고 있어 인트로 페이지 추가가 필요해요.
//    서비스를 소개하는 인트로 페이지가 먼저 노출된 후 토스 로그인이 진행될 수 있도록
//    수정해 주세요."
//
// 처음 온 사람은 이게 무슨 앱인지도 모르는 채 계정을 내주게 되는 셈이었다.
// 이 순서가 다시 뒤집히면 또 반려되므로 여기서 못 박아 둔다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'mini', 'src', 'main.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'mini', 'src', 'style.css'), 'utf8');

/** render() 안의 case 블록 하나를 떼어 온다. */
function screen(name) {
  const at = SRC.indexOf(`case '${name}':`);
  assert.ok(at > 0, `${name} 화면을 못 찾았다`);
  const next = SRC.slice(at + 10).search(/\n {4}case '|\n {4}default:/);
  return SRC.slice(at, next < 0 ? at + 4000 : at + 10 + next);
}

test('⚠️ 세션이 없으면 로그인이 아니라 인트로로 간다', () => {
  // 이 한 줄이 심사 통과 여부를 가른다.
  const boot = SRC.match(/async function boot\(\)[\s\S]*?\n\}/)?.[0]
    || SRC.slice(SRC.indexOf('recoverPendingOrders();'), SRC.indexOf('recoverPendingOrders();') + 900);
  assert.match(boot, /go\('intro'\)/, "세션이 없을 때 go('intro') 로 가지 않는다");
  assert.doesNotMatch(boot, /go\('login'\)/,
    "첫 화면에서 곧바로 로그인으로 보낸다 — 반려된 그 동작이다");
});

test('인트로가 무슨 서비스인지 실제로 설명한다', () => {
  const s = screen('intro');
  // 무엇을 해 주는 곳인지
  assert.match(s, /명리학|사주/, '무엇을 보는 곳인지 안 밝힌다');
  assert.match(s, /오늘의 기운/, '주요 기능을 안 보여준다');
  assert.match(s, /궁합/, '주요 기능을 안 보여준다');
  // 돈이 드는 구조
  assert.match(s, /엽전/, '엽전이 무엇인지 안 밝힌다');
  assert.match(s, /무료로 받을 수 있|무료/, '무료로 얻는 길을 안 알려 준다');
  // 왜 로그인을 받는지
  assert.match(s, /왜 로그인이 필요/, '로그인을 받는 이유를 안 밝힌다');
  assert.match(s, /생년월일/, '어떤 정보를 쓰는지 안 밝힌다');
  // AI 고지는 결과가 아니어도 첫 화면부터 있어야 한다
  assert.match(s, /AI_NOTICE/, '생성형 AI 고지가 없다');
});

test('인트로에는 로그인 버튼이 없다', () => {
  // "설명을 먼저 보여준 뒤 로그인" 이므로, 같은 화면에 로그인 버튼을 두면
  // 다시 "즉시 로그인 유도" 로 읽힐 수 있다. 화면을 확실히 나눈다.
  const s = screen('intro');
  assert.doesNotMatch(s, /id="btn-login"/, '인트로에 로그인 버튼이 있다');
  assert.match(s, /id="btn-intro-next"/, '다음으로 가는 버튼이 없다');
});

test('인트로 → 로그인 으로 이어진다', () => {
  assert.match(SRC, /on\('btn-intro-next', \(\) => \{[^}]*go\('login'\)/,
    '시작하기를 눌러도 로그인으로 가지 않는다');
});

test('로그인 화면에서 설명으로 돌아갈 수 있다', () => {
  const s = screen('login');
  assert.match(s, /id="btn-login-back"/, '다시 살펴볼 길이 없다');
  assert.match(SRC, /on\('btn-login-back', \(\) => \{[^}]*go\('intro'\)/,
    '돌아가기 버튼이 인트로로 가지 않는다');
});

test('로그아웃하면 다시 설명부터 볼 수 있다', () => {
  // 로그아웃 뒤에는 로그인 화면으로 보내되, 거기서 인트로로 돌아갈 수 있으면 된다.
  const bind = SRC.slice(SRC.indexOf('function bind() {'));
  assert.match(bind, /on\('btn-logout'/, '로그아웃 손잡이가 없다');
});

test('인트로에 쓴 모양이 style.css 에 있다', () => {
  const s = screen('intro');
  const classes = [...new Set([...s.matchAll(/class="([^"$]+)"/g)]
    .flatMap(m => m[1].split(/\s+/).filter(Boolean)))];
  const missing = classes.filter(c => !CSS.includes('.' + c));
  assert.deepEqual(missing, [], `style.css 에 없는 모양: ${missing.join(', ')}`);
});

test('보여주기만 하는 타일은 누를 것처럼 보이지 않는다', () => {
  // 눌러 봐야 아무 일도 없는데 손가락 모양이 뜨면 고장으로 읽힌다.
  const block = CSS.slice(CSS.indexOf('.tile.show'), CSS.indexOf('.tile.show') + 200);
  assert.match(block, /cursor:\s*default/, '누르는 것처럼 보인다');
});

test('인트로에서 쓰는 아이콘이 실제로 있다', () => {
  const icons = readFileSync(join(ROOT, 'mini', 'src', 'icons.js'), 'utf8');
  const s = screen('intro');
  const used = [...s.matchAll(/icon\('(\w+)'\)/g)].map(m => m[1])
    .concat([...s.matchAll(/\['(\w+)',\s*'/g)].map(m => m[1]));
  const missing = [...new Set(used)].filter(n => !new RegExp(`\\b${n}\\s*:`).test(icons));
  assert.deepEqual(missing, [], `icons.js 에 없는 아이콘: ${missing.join(', ')}`);
});

test('앱을 켤 때는 오래 기다리지 않는다', () => {
  // 신호가 약한 곳(지하철·엘리베이터)에서 켜면 첫 화면에 1분 넘게 갇혔다.
  // 확인이 안 되면 그냥 소개 화면을 보여주는 편이 낫다.
  assert.match(SRC, /const BOOT_TIMEOUT = (\d+)/, '부팅용 짧은 시간제한이 없다');
  const boot = +SRC.match(/const BOOT_TIMEOUT = (\d+)/)[1];
  const normal = +SRC.match(/const API_TIMEOUT = (\d+)/)[1];
  assert.ok(boot <= 10000, `부팅 대기가 ${boot}ms 나 된다`);
  assert.ok(boot < normal, '부팅 대기가 일반 호출보다 짧지 않다');
  assert.match(SRC, /api\('\/mini\/api\/me', \{ timeoutMs: BOOT_TIMEOUT \}\)/,
    '켤 때 하는 확인에 짧은 시간제한을 안 걸었다');
});

test('잠깐 끊긴 것 때문에 세션을 버리지 않는다', () => {
  // 여기서 지우면 신호가 잠깐 나빴다는 이유로 멀쩡한 사람을 다시 로그인시킨다.
  const boot = SRC.match(/async function boot\(\)[\s\S]*?\n\}/)[0];
  assert.match(boot, /if \(e\.status === 401\) \{ localStorage\.removeItem/,
    '401 일 때만 세션을 지우는 조건이 없다');
  const catchBlock = boot.slice(boot.indexOf('catch'));
  assert.equal((catchBlock.match(/removeItem/g) || []).length, 1,
    '401 이 아닌데도 세션을 지우는 곳이 있다');
});
