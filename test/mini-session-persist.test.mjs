// 미니앱 세션이 앱을 껐다 켜도 살아남는지 본다 — 소스 구조로.
//
// 겪은 일: 세션을 localStorage 에만 넣어 뒀는데, 토스 웹뷰의 localStorage 는
// 앱이 종료되면 남아 있으리라는 보장이 없다. 그래서 나갔다 들어올 때마다
// 세션이 사라져 인트로 → 로그인 → 토스 인증을 처음부터 다시 거쳤다.
// 서버 세션은 30일짜리(SESSION_TTL)인데 클라이언트가 그걸 못 들고 있던 것이다.
//
// 여기서 지키는 것:
//   1) 세션은 네이티브 Storage 로 읽고 쓴다 (localStorage 는 예비일 뿐)
//   2) boot() 은 loadSession() 으로 세션을 되찾고 나서 판단한다
//   3) 자동 로그인은 canResumeLogin() 을 통과해야만 한다
//      (연동이 끊긴 사람에게 누르지도 않은 동의 화면을 띄우지 않는다)
//   4) 로그아웃은 자동 로그인 표식까지 지운다
//      (안 지우면 다음 실행에 도로 로그인돼 로그아웃이 없는 것과 같아진다)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'mini', 'src', 'main.js'), 'utf8');

// 주석은 빼고 본다. 설명문에 적힌 낱말이 코드로 오인되지 않게 한다.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('Storage 를 SDK 에서 들여온다', () => {
  const imports = code.slice(0, code.indexOf("from '@apps-in-toss/web-framework'"));
  assert.match(imports, /\bStorage\b/, 'Storage 를 import 하지 않으면 네이티브 저장소를 못 쓴다');
  assert.match(imports, /\bTossAuth\b/, 'TossAuth 가 있어야 연동 여부를 물어볼 수 있다');
});

test('세션은 네이티브 Storage 로 읽고 쓴다', () => {
  assert.match(code, /Storage\.getItem/, 'Storage.getItem 이 없다');
  assert.match(code, /Storage\.setItem/, 'Storage.setItem 이 없다');
  assert.match(code, /Storage\.removeItem/, 'Storage.removeItem 이 없다');

  // loadSession 이 네이티브를 먼저 보고, 없을 때만 localStorage 로 내려가야 한다.
  const load = block('async function loadSession()');
  const nativeAt = load.indexOf('nativeGet(SESSION_KEY)');
  const localAt = load.indexOf('localStorage.getItem(SESSION_KEY)');
  assert.ok(nativeAt >= 0, 'loadSession 이 네이티브 저장소를 읽지 않는다');
  assert.ok(localAt >= 0, '예전 세션을 옮겨 오는 길(localStorage)이 없다');
  assert.ok(nativeAt < localAt, '네이티브보다 localStorage 를 먼저 보면 안 된다');

  // 저장은 반드시 네이티브에도 남아야 한다.
  const save = block('async function saveSession(');
  assert.match(save, /nativeSet\(SESSION_KEY/, 'saveSession 이 네이티브에 안 쓴다 — 앱을 끄면 날아간다');
});

test('boot 은 저장된 세션을 되찾고 나서 판단한다', () => {
  const boot = block('async function boot()');
  const loadAt = boot.indexOf('await loadSession()');
  const checkAt = boot.indexOf('if (state.session)');
  assert.ok(loadAt >= 0, 'boot 이 loadSession 을 부르지 않는다');
  assert.ok(loadAt < checkAt, '세션을 되찾기 전에 판단하면 늘 로그인 화면으로 간다');
});

test('자동 로그인은 canResumeLogin 을 통과해야 한다', () => {
  const boot = block('async function boot()');
  assert.match(
    boot, /if \(await canResumeLogin\(\)\)[\s\S]{0,200}?loginWithToss\(\)/,
    '자동 로그인이 canResumeLogin 으로 막혀 있지 않다',
  );
  // 인트로는 여전히 남아 있어야 한다 — 처음 온 사람에게는 심사 조건이다.
  assert.match(boot, /go\('intro'\)/, '인트로로 가는 길이 사라졌다(심사 반려 사유였다)');

  const gate = block('async function canResumeLogin()');
  assert.match(gate, /LINKED_KEY/, '로그인한 적이 있는지를 안 본다');
  assert.match(gate, /TossAuth\.isIntegrated/, '토스 연동이 살아 있는지를 안 본다');
  // 구버전 토스는 undefined 를 준다. 그걸 '아니다'로 받으면 자동 로그인이 통째로 죽는다.
  assert.match(gate, /!==\s*false/, 'undefined(구버전)를 거짓으로 취급하고 있다');
});

test('로그아웃은 자동 로그인 표식까지 지운다', () => {
  const at = code.indexOf("on('btn-logout'");
  assert.ok(at >= 0, '로그아웃 버튼 연결을 찾지 못했다');
  const handler = code.slice(at, at + 600);
  assert.match(
    handler, /forgetSession\(\{\s*keepLinked:\s*false\s*\}\)/,
    '표식을 남기면 다음 실행에 도로 로그인돼 로그아웃이 없는 것과 같아진다',
  );
});

test('세션 만료(401)로 지울 때는 표식을 남긴다', () => {
  const boot = block('async function boot()');
  const at = boot.indexOf('e.status === 401');
  assert.ok(at >= 0, '401 처리를 찾지 못했다');
  const branch = boot.slice(at, at + 200);
  assert.match(branch, /forgetSession\(\)/, '401 에서 세션을 안 지운다');
  assert.doesNotMatch(
    branch, /keepLinked:\s*false/,
    '만료됐을 뿐 연동은 살아 있다 — 표식까지 지우면 조용히 이어갈 수 없다',
  );
});

/** 함수 선언부터 다음 최상위 선언 직전까지를 잘라 온다. */
function block(header) {
  const at = code.indexOf(header);
  assert.ok(at >= 0, `${header} 를 찾지 못했다`);
  const rest = code.slice(at + header.length);
  const end = rest.search(/\n(?:async function|function|const|let|state\.splashing)\s/);
  return rest.slice(0, end < 0 ? rest.length : end);
}
