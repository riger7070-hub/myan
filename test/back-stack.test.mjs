// 뒤로가기가 **앞 화면으로 돌아가는지.**
//
// ⚠️ 2026-10-22 심사가 짚었다 —
//    "홈 > 내 사주 풀이 > 뒤로 가기 누르면 토스 홈 화면으로 전환"
//
//    까닭: `runItem()` 이 `go('loading')` 을 안 쓰고 `state.screen = 'loading'`
//    으로 **직접** 바꿨다. 그러면 떠나는 화면(홈)이 스택에 안 쌓인다. 로딩 다음의
//    `go('result')` 는 「로딩은 쌓지 않는다」 규칙에 걸려 또 안 쌓으므로,
//    결과 화면에 서면 **스택이 통째로 비어 있었다.**
//
//    그 상태에서 뒤로가기를 누르면 돌아갈 곳이 없어 앱이 닫힌다. 10-14 에
//    「나가시겠어요?」를 없애고 스택이 비면 곧장 닫게 바꾸면서 **드러났다** —
//    그전에는 물음창이 떠서 가려져 있었다. 버그는 그 전부터 있었다.
//
// ⚠️ 여기서는 글자를 뒤지지 않고 **실제로 돌려 본다.** go/goBack 을 그대로 떼어
//    와서 쌓고 빼 본다. 「state.screen 을 직접 바꾸지 마라」 같은 규칙을 글자로
//    재면, 다음에 또 다른 모양으로 빠져나간다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../mini/src/main.js', import.meta.url), 'utf8');

/**
 * go()/goBack() 의 **규칙만** 떼어 와 돌려 보는 작은 모형.
 * 쌓고 빼는 규칙은 main.js 에서 읽어 와 맞춘다.
 */
function 모형() {
  const 안쌓는화면 = (() => {
    const m = /if \(state\.screen !== '(\w+)' && state\.screen !== '(\w+)'\) _stack\.push/.exec(main);
    assert.ok(m, '쌓지 않는 화면 규칙을 못 읽었다');
    return new Set([m[1], m[2]]);
  })();

  const stack = [];
  let screen = 'boot';
  return {
    get screen() { return screen; },
    get stack() { return [...stack]; },
    go(next, { fromBack = false } = {}) {
      if (!fromBack && screen && screen !== next && !안쌓는화면.has(screen)) stack.push(screen);
      screen = next;
    },
    back() {
      const prev = stack.pop();
      if (prev) { this.go(prev, { fromBack: true }); return '뒤로'; }
      return '앱닫힘';
    },
  };
}

test('runItem 이 go() 를 거친다', () => {
  // ⚠️ 직접 state.screen 을 바꾸면 떠나는 화면이 안 쌓인다. 그게 이 버그였다.
  const i = main.indexOf('async function runItem(item)');
  assert.notEqual(i, -1, 'runItem 이 없다');
  const f = main.slice(i, i + 1600).replace(/^\s*\/\/.*$/gm, '');
  assert.match(f, /go\('loading'\)/, "runItem 이 go('loading') 을 안 쓴다");
  assert.ok(!/state\.screen\s*=\s*'loading'/.test(f),
    'state.screen 을 직접 바꾼다 — 떠나는 화면이 스택에 안 쌓인다');
});

test('화면을 직접 바꾸는 자리는 부팅 실패뿐이다', () => {
  // 부팅이 깨졌을 때의 login 은 뿌리 화면이라 돌아갈 곳이 없는 게 맞다.
  //
  // ⚠️ **주석을 걷고 센다.** 왜 바꿨는지를 주석에 적어 두는데(「예전에는
  //    state.screen = 'loading' 이었다」), 그걸 코드로 세면 고쳐 놓고도 빨개진다.
  //    이 저장소에서 세 번째 걸린 함정이다.
  const 코드 = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const 자리 = [...코드.matchAll(/state\.screen = '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(자리, ['login'],
    `go() 를 거치지 않고 바꾸는 화면이 있다: ${자리.join(', ')}`);
});

test('홈 > 사주 풀이 > 뒤로 → 홈으로 간다', () => {
  // ⚠️ 심사가 짚은 바로 그 길이다.
  const m = 모형();
  m.go('home');
  m.go('loading');            // runItem
  m.go('result');             // 풀이 도착
  assert.deepEqual(m.stack, ['home'], '홈이 스택에 안 쌓였다');
  assert.equal(m.back(), '뒤로');
  assert.equal(m.screen, 'home', '뒤로가기가 홈으로 안 간다 — 앱이 닫힌다');
});

test('홈에서 뒤로 → 앱이 닫힌다', () => {
  // 최초 화면에서는 닫히는 것이 맞다(2026-10-14 심사 사유).
  const m = 모형();
  m.go('home');
  assert.equal(m.back(), '앱닫힘', '최초 화면에서 안 닫힌다');
});

test('로딩에서 뒤로 → 로딩 앞 화면으로 간다', () => {
  // 기다리다 나가면 로딩이 아니라 그 앞으로 돌아가야 한다.
  const m = 모형();
  m.go('home');
  m.go('loading');
  assert.equal(m.back(), '뒤로');
  assert.equal(m.screen, 'home');
});

test('고르는 화면을 거쳐도 차례대로 돌아간다', () => {
  // 홈 > 고르기 > 결과 > 뒤로 > 고르기 > 뒤로 > 홈
  const m = 모형();
  m.go('home');
  m.go('pick');
  m.go('loading');
  m.go('result');
  m.back();
  assert.equal(m.screen, 'pick', '결과에서 뒤로 갔더니 고르기가 아니다');
  m.back();
  assert.equal(m.screen, 'home', '고르기에서 뒤로 갔더니 홈이 아니다');
  assert.equal(m.back(), '앱닫힘');
});

test('로딩은 스택에 쌓이지 않는다', () => {
  // 쌓이면 뒤로가기가 다시 로딩 화면으로 들어가 멈춘 것처럼 보인다.
  const m = 모형();
  m.go('home');
  m.go('loading');
  m.go('result');
  assert.ok(!m.stack.includes('loading'), '로딩이 스택에 쌓였다');
});
