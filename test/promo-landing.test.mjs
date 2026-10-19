// 토스 프로모션으로 온 사람이 **10초 안에 무엇을 보는가**를 지킨다.
//
// ⚠️ 2026-10-12 부터 프로모션(미니앱을 10초 구경하면 5원)이 돌고 있다.
//    그런데 그렇게 온 사람은 **로그인을 하지 않는다** — 5원 받으러 온 사람이
//    토스 로그인까지 할 까닭이 없다.
//
//    그때까지 `/api/tti-today` 는 토큰이 없으면 401 이었고, 로그인 전 화면
//    (인트로)에는 **누를 수도 없는 타일 넷**(`.show`)과 로그인 단추뿐이었다.
//    즉 돈을 내고 데려와서 **전단지를 보여 주고 있었다.** 10초 중 2.5초는
//    여는 연출이 먹는다. 2026-10-13 에 고쳤다.
//
//    여기를 되돌리면 아무 시험도 안 깨지고 **광고비만 조용히 샌다.**
//    사람이 안 남는 것으로만 나타나고, 그걸 보고 또 앱이 나쁘다고 여기게 된다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../mini/src/main.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');

/** 함수 하나의 몸통. 매개변수의 중괄호에 속지 않게 괄호 깊이를 함께 센다. */
function 몸통(글, 머리) {
  const i = 글.indexOf(머리);
  assert.notEqual(i, -1, `${머리} 를 못 찾았다`);
  let 괄호 = 0;
  let 시작 = -1;
  for (let k = i; k < 글.length; k++) {
    const c = 글[k];
    if (c === '(') 괄호++;
    else if (c === ')') 괄호--;
    else if (c === '{' && 괄호 === 0) { 시작 = k; break; }
  }
  let 깊이 = 0;
  for (let k = 시작; k < 글.length; k++) {
    if (글[k] === '{') 깊이++;
    else if (글[k] === '}' && --깊이 === 0) return 글.slice(i, k + 1);
  }
  throw new Error(`${머리} 의 끝을 못 찾았다`);
}

/**
 * 주석을 걷어 낸다.
 *
 * ⚠️ 왜 뺐는지를 주석에 적어 두는데(「전에는 401 이었다」), 그걸 코드로 세면
 *    고쳐 놓고도 빨개진다. 이 함정에 이 저장소에서만 두 번 걸렸다.
 */
const 코드만 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const 손님맞이 = 코드만(몸통(worker, 'async function handleTtiToday(request, env)'));

test('로그인 없이도 순위를 준다', () => {
  // 토큰이 없다고 막으면 프로모션으로 온 사람은 아무것도 못 본다.
  assert.ok(!/if \(!idToken\) return/.test(손님맞이),
    '토큰이 없으면 막는다 — 프로모션으로 온 사람은 토큰이 없다');
  assert.ok(!/if \(!acct\) return/.test(손님맞이),
    '계정이 없으면 막는다 — 로그인 전에도 순위는 나와야 한다');
  assert.ok(!손님맞이.includes('401'), '401 로 되돌려보내는 자리가 있다');
});

test('토큰이 있을 때만 계정을 찾는다', () => {
  // 없는 토큰으로 계정을 찾으려 들면 거기서 터진다.
  assert.match(손님맞이, /idToken \? await resolveAccount/,
    '토큰이 있을 때만 계정을 찾는 모양이 아니다');
});

test('그래도 엽전을 쓰거나 AI 를 부르지는 않는다', () => {
  // 로그인 없이 열었다고 돈 드는 일까지 열면 안 된다.
  for (const 금지 of ['accountSpend', 'geminiText', 'cachedReading']) {
    assert.ok(!손님맞이.includes(금지), `공짜 순위가 ${금지} 를 부른다`);
  }
});

test('로그인 전 인트로에 순위가 선다', () => {
  const i = main.indexOf("case 'intro':");
  assert.notEqual(i, -1, '인트로 화면이 없다');
  const intro = main.slice(i, i + 900);
  assert.match(intro, /ttiCard\(\{ 맛보기: true \}\)/,
    '인트로에 순위를 안 그린다 — 10초 동안 볼 알맹이가 없다');
});

test('순위가 인트로 맨 위에 선다', () => {
  // ⚠️ 아래로 내려야 보이는 것은 10초짜리 손님에게는 없는 것과 같다.
  //    브랜드 이름 바로 다음이어야 한다.
  const i = main.indexOf("case 'intro':");
  const intro = main.slice(i, i + 900);
  const 순위 = intro.indexOf('ttiCard(');
  const 소개 = intro.indexOf('무엇을 볼 수 있나요');
  assert.ok(순위 > 0 && (소개 === -1 || 순위 < 소개),
    '순위가 소개 문단보다 아래에 있다 — 10초 안에 안 보인다');
});

test('인트로에서도 순위를 받아 온다', () => {
  // 그리기만 하고 안 부르면 state.tti 가 비어 아무것도 안 나온다.
  const boot = 몸통(main, 'async function boot()');
  assert.match(boot, /loadTtiToday\(\)/,
    '로그인 전에 순위를 안 부른다 — 인트로 칸이 늘 비어 있게 된다');
});

const 칸 = 몸통(main, 'function ttiCard(');

test('맛보기에는 엽전 단추를 달지 않는다', () => {
  // 계정이 없어 눌러도 튕기고, 5원 받으러 온 사람에게 첫 화면부터 값을 들이민다.
  assert.match(칸, /맛보기/, '맛보기 갈래가 없다');
  assert.match(칸, /맛보기[\s\S]{0,40}tti-today-hint/,
    '맛보기일 때 엽전 단추 대신 안내를 보여주지 않는다');
});

test('맛보기는 열두 띠를 다 보여 준다', () => {
  // ⚠️ 상위 셋만 보여 주면 자기 띠가 거기 있을 확률이 4분의 1이다.
  //    10초 안에 제 띠를 못 찾으면 그냥 나간다.
  assert.match(칸, /맛보기 \? t\.rows : t\.rows\.slice\(0, 3\)/,
    '맛보기에서도 상위 셋만 보여 준다');
});

test('맛보기 안내가 로그인할 이유를 말한다', () => {
  // ⚠️ 2026-10-20 에 뜻이 조금 바뀌었다. 전에는 「내 띠가 몇 위인지」가 로그인해서
  //    얻는 것이었는데, 이제 그건 **로그인 없이** 띠를 눌러 바로 본다.
  //    로그인해서 얻는 것은 **띠보다 정확한 것** — 생년월일시로 보는 사주다.
  //    (띠는 태어난 해만 본다.) 그 말이 없으면 띠만 보고 나간다.
  const i = 칸.indexOf('tti-today-hint');
  assert.notEqual(i, -1);
  const 안내 = 칸.slice(i, i + 400);
  assert.match(안내, /태어난 해|생년월일시/,
    '로그인하면 뭐가 더 정확해지는지 말하지 않는다');
});
