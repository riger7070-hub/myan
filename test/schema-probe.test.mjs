// `ensureDBExt` 가 **한 번만 물어보고 넘어가는지.**
//
// ⚠️ 2026-10-15, 사장님이 「로딩이 20초 걸린다」 하셨다. 범인은 이것이었다.
//
//    ensureDBExt 는 표와 인덱스를 만드는 문장 **서른넷**을 `_execEach` 로
//    **하나씩 차례로** D1 에 보낸다. 게다가 ALTER 아홉 개는 컬럼이 이미 있어
//    **매번 실패하는 게 정상**인데, 실패도 왕복은 왕복이다. 한 바퀴에 13초였다.
//
//    `_dbExtReady` 는 isolate 하나 안에서만 사는 기억이다. 이용자가 적어 거의
//    모든 요청이 **차가운 isolate** 에 떨어지므로, 앱이 부르는 길마다 그 값을
//    치렀다. 앱을 켜면 /mini/api/me · checkin · products 를 차례로 부르니
//    그게 쌓여 20초가 됐다.
//
//    이제 **맨 나중에 만들어지는 것 둘을 한 번에 물어보고**, 있으면 그냥 나간다.
//    서른네 번 왕복이 한 번이 됐다 — checkin 이 8.9초에서 2.0초로 내려갔다.
//
// ⚠️ 이걸 되돌리거나, 표를 더 붙이면서 물음을 안 고치면 **또 느려진다.**
//    느려지는 것뿐이라 아무 시험도 안 깨지고, 사람이 떠나는 것으로만 나타난다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');

/** ensureDBExt 의 몸통. */
const 몸통 = (() => {
  const i = worker.indexOf('async function ensureDBExt(env) {');
  assert.notEqual(i, -1, 'ensureDBExt 가 없다');
  let 깊이 = 0;
  for (let k = worker.indexOf('{', i); k < worker.length; k++) {
    if (worker[k] === '{') 깊이++;
    else if (worker[k] === '}' && --깊이 === 0) return worker.slice(i, k + 1);
  }
  throw new Error('ensureDBExt 의 끝을 못 찾았다');
})();

const 코드만 = 몸통.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('표를 만들기 전에 먼저 물어본다', () => {
  const 물음 = 코드만.indexOf('.first()');
  const 만들기 = 코드만.indexOf('_execEach');
  assert.notEqual(물음, -1, '한 번 물어보는 자리가 없다 — 매번 서른네 번 왕복한다');
  assert.ok(물음 < 만들기, '물어보기 전에 만들기부터 한다');
});

test('이미 있으면 곧장 나간다', () => {
  // 물어보고도 아래로 내려가면 아무것도 아낀 게 없다.
  const 앞 = 코드만.slice(0, 코드만.indexOf('_execEach'));
  assert.match(앞, /_dbExtReady = true;[\s\S]{0,40}return;/,
    '물음이 통해도 표 만들기로 내려간다');
});

test('물음은 왕복 한 번이다', () => {
  // 여러 번 물으면 아낀 것이 줄어든다.
  const 앞 = 코드만.slice(0, 코드만.indexOf('_execEach'));
  assert.equal((앞.match(/env\.DB\.prepare/g) || []).length, 1,
    '물음이 한 번이 아니다');
});

test('물음이 가장 나중에 만들어지는 것을 짚는다', () => {
  // ⚠️ 앞쪽 표를 물으면, 뒤쪽 표가 없는데도 「다 있다」고 지나간다.
  //    ensureDBExt 안에서 마지막 CREATE TABLE 과 마지막 ALTER 가 짚는 것이어야 한다.
  const 표들 = [...코드만.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  const 컬럼들 = [...코드만.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)];
  assert.ok(표들.length > 10, '표를 읽지 못했다');
  const 마지막표 = 표들.at(-1);
  const [, 마지막표이름, 마지막컬럼] = 컬럼들.at(-1);

  const 물음 = 코드만.slice(0, 코드만.indexOf('_execEach'));
  assert.ok(물음.includes(마지막표),
    `물음이 마지막 표(${마지막표})를 안 짚는다 — 그 표가 없어도 지나간다`);
  assert.ok(물음.includes(마지막컬럼) && 물음.includes(마지막표이름),
    `물음이 마지막 컬럼(${마지막표이름}.${마지막컬럼})을 안 짚는다`);
});

test('못 찾으면 그때는 다 만든다', () => {
  // 스스로 고치는 길이 살아 있어야 첫 배포에서도 선다.
  assert.match(코드만, /catch[\s\S]{0,80}_execEach|\}\s*catch\s*\{[^}]*\}\s*await _execEach/,
    '물음이 실패했을 때 표를 만들지 않는다');
  assert.ok((코드만.match(/_execEach/g) || []).length >= 2, '표·컬럼 두 배치가 다 있어야 한다');
});

test('순위 길은 아예 물어보지도 않는다', () => {
  // ⚠️ 표를 하나도 안 건드리는 길이다. 2026-10-13 에 여기서 13초를 걷어냈다.
  const i = worker.indexOf("path === '/api/tti-today'");
  assert.notEqual(i, -1, '순위 길이 없다');
  const 줄 = worker.slice(i, worker.indexOf('\n', i));
  assert.ok(!줄.includes('ensureDBExt'), '순위 길이 다시 표 확인을 한다');
});
