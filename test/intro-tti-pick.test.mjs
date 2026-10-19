// 인트로에서 **로그인 없이 제 띠를 눌러 바로 보는지.**
//
// ⚠️ 2026-10-20 에 넣었다. 토스 프로모션이 돌던 9일 동안 **약 900분**이 오셨는데
//    로그인까지 오신 분이 **11분(1.2%)** 이었다. 10초를 보고 나가시는데 그 안에
//    열두 줄을 훑어 제 띠를 찾는 것은 **일**이기 때문이다.
//
//    그래서 읽을 것보다 **누를 것**을 먼저 둔다. 띠 하나를 누르면 바로
//    「오늘 7위」가 뜬다 — 로그인도, 생년월일도, 기다림도 없다.
//
// ⚠️ 서버를 다시 부르지 않는다. 열두 줄은 이미 손에 있다(loadTtiToday).
//    여기서 네트워크를 타면 10초짜리 손님에게는 없는 기능이 된다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../mini/src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../mini/src/style.css', import.meta.url), 'utf8');

/** 함수 몸통. 매개변수의 중괄호에 속지 않게 괄호 깊이를 함께 센다. */
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

const 코드만 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const 칸 = 몸통(main, 'function ttiCard(');

test('맛보기에 띠를 고르는 단추가 있다', () => {
  assert.match(칸, /data-tti="/, '누를 단추가 없다 — 열두 줄을 읽게 한다');
  assert.match(칸, /tti-pick-ask/, '무엇을 하라는 말이 없다');
});

test('누르는 자리가 실제로 이어져 있다', () => {
  // ⚠️ 그리기만 하고 안 잇는 실수를 막는다 — 눌러도 아무 일이 없고 오류도 안 난다.
  assert.match(main, /all\('\[data-tti\]'\)/, 'data-tti 를 아무도 안 듣는다');
  assert.match(main, /내띠고르기\(el\.dataset\.tti\)/, '누른 띠를 받지 않는다');
});

test('누르면 서버를 다시 부르지 않는다', () => {
  // 열두 줄은 이미 손에 있다. 여기서 네트워크를 타면 10초 안에 못 본다.
  const f = 코드만(몸통(main, 'function 내띠고르기('));
  assert.ok(!/api\(|fetch\(/.test(f), '띠를 누를 때 서버를 부른다');
  assert.match(f, /render\(\)/, '눌러도 화면이 안 바뀐다');
});

test('띠 단추는 쥐·소·호랑이 차례다', () => {
  // ⚠️ 순위 차례로 놓으면 날마다 자리가 바뀌어, 어제 눌렀던 곳을 오늘 또 찾아야
  //    한다. 열두 띠의 차례는 누구나 알고 바뀌지 않는다.
  const m = /const 지지차례 = \[([^\]]+)\]/.exec(main);
  assert.ok(m, '지지 차례가 없다');
  const 차례 = m[1].replace(/['\s]/g, '').split(',');
  assert.deepEqual(차례, ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'],
    '열두 지지의 차례가 아니다');
  assert.match(코드만(칸), /지지차례\.map/, '단추를 그 차례로 놓지 않는다');
});

test('고른 띠를 기기에 적어 둔다', () => {
  // 다시 오셨을 때 또 고르게 하면 그 한 번이 다시 일이 된다.
  const f = 코드만(몸통(main, 'function 내띠고르기('));
  assert.match(f, /localStorage\.setItem/, '고른 띠를 안 적어 둔다');
  const g = 코드만(몸통(main, 'function 내띠읽기('));
  assert.match(g, /localStorage\.getItem/, '적어 둔 띠를 안 읽는다');
  assert.match(g, /catch/, '저장이 막힌 기기에서 터진다');
});

test('고르면 내 것이 제일 크게 보인다', () => {
  // 10초짜리 손님에게는 「몇 위인가」 하나가 전부다.
  assert.match(칸, /tti-mine-big/, '고른 뒤에 크게 보여주는 자리가 없다');
  assert.match(칸, /오늘 <b>\$\{mine\.rank\}위<\/b>/, '몇 위인지 크게 안 보여준다');
  assert.match(css, /\.tti-mine-rank \{[^}]*font-size/, '크기가 안 정해져 있다');
});

test('고르기 전에는 열두 줄을 늘어놓지 않는다', () => {
  // 읽을 것부터 내밀면 누를 것이 묻힌다.
  assert.match(코드만(칸), /!맛보기 \|\| mine \?/, '고르기 전에도 목록을 그린다');
});

test('고른 뒤에는 로그인할 까닭을 말한다', () => {
  // 띠는 태어난 해만 본다. 그게 사주와 다르다는 것이 로그인할 유일한 이유다.
  assert.match(칸, /태어난 해/, '띠가 거친 셈이라는 말이 없다');
  assert.match(칸, /생년월일시/, '무엇을 더 주는지 말하지 않는다');
});

test('로그인한 사람 것이 고른 띠보다 앞선다', () => {
  // ⚠️ 생년월일을 넣으신 분은 그게 참이다. 눌러 둔 띠가 그걸 덮으면 안 된다.
  assert.match(코드만(칸), /t\.mine \|\| \(고른/, '고른 띠가 실제 사주를 덮는다');
});

test('띠 단추에 모양이 붙어 있다', () => {
  assert.match(css, /\.tti-chip \{/, '맨몸으로 나온다');
  assert.match(css, /\.tti-pick \{[^}]*grid/, '열두 개가 줄줄이 늘어선다');
});
