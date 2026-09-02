// 출석 도장이 **앱을 켜면 저절로 찍히고, 홈에 보이는지** 지킨다.
//
// ⚠️ 왜 시험까지 두는가. 2026-09-02 에 숫자를 보고 바꿨다 —
//
//    미니앱을 쓴 43명 가운데 **도장을 가진 사람이 1명**이었다. 도장이 없어서가
//    아니라 **홈 → 메뉴 → 무료 엽전 받기 → 출석 도장** 으로 세 단계 안쪽에
//    있었기 때문이다. 한 번 켜고 마는 사람(29명, 67%)은 거기까지 못 간다.
//
//    다시 온 사람에게 또 일을 시키면 거기서 또 샌다. 그래서 열었다는 것 자체에
//    도장을 찍고, 연속 일수를 홈에 내놓는다 — 눈에 보여야 내일 또 올 이유가 된다.
//
// 이걸 도로 안쪽에 넣거나 다시 누르게 만들면 아무 시험도 안 깨지고, 몇 주 뒤에
// 「또 안 늘었네」 로만 나타난다. 그래서 여기서 못 박는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../mini/src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../mini/src/style.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');

/** boot() 안에서 홈으로 간 뒤의 대목. */
const 부팅끝 = (() => {
  const i = main.indexOf("    go('home');");
  assert.notEqual(i, -1, "boot 에서 go('home') 을 못 찾았다");
  return main.slice(i, i + 500);
})();

test('앱을 켜면 도장이 저절로 찍힌다', () => {
  assert.match(부팅끝, /doCheckin\(\{ quiet: true \}\)/,
    '앱을 켤 때 도장을 안 찍는다 — 다시 온 사람이 또 눌러야 한다');
});

test('저절로 찍을 때는 로딩 화면을 덮지 않는다', () => {
  // 앱을 켜자마자 로딩이 덮이면 도장 때문에 앱이 느려진 것처럼 보인다.
  const f = main.slice(main.indexOf('async function doCheckin('),
    main.indexOf('async function startQuiz('));
  const quiet = f.slice(f.indexOf('if (quiet)'), f.indexOf('await withBusy'));
  assert.ok(!quiet.includes('withBusy'), 'quiet 인데 withBusy 를 쓴다');
  assert.ok(f.includes('await withBusy(찍기)'), '손으로 누를 때는 로딩이 있어야 한다');
});

test('도장을 못 찍어도 앱은 쓸 수 있다', () => {
  const f = main.slice(main.indexOf('async function doCheckin('),
    main.indexOf('async function startQuiz('));
  const quiet = f.slice(f.indexOf('if (quiet)'), f.indexOf('await withBusy'));
  assert.ok(quiet.includes('catch'), '실패를 안 받아 낸다 — 앱이 통째로 막힌다');
});

test('날마다 성가시게 알리지 않는다', () => {
  // "1일째" 를 날마다 띄우면 그것부터 성가시다. 개근했을 때만 말한다.
  const f = main.slice(main.indexOf('async function doCheckin('),
    main.indexOf('async function startQuiz('));
  assert.match(f, /if \(!quiet \|\| r\.granted\)/,
    '조용히 찍을 때도 날마다 알린다');
});

test('연속 일수가 홈에 보인다', () => {
  assert.ok(main.includes('function streakRow()'), 'streakRow 가 없다');
  const home = main.slice(main.indexOf("case 'home': {"), main.indexOf("case 'home': {") + 1400);
  assert.ok(home.includes('${streakRow()}'), '홈에 도장 줄을 안 그린다');
});

test('도장 줄에 연속 일수와 다음 보상이 함께 있다', () => {
  const f = main.slice(main.indexOf('function streakRow()'),
    main.indexOf('const MINI_CHECKIN_TOKENS_HINT'));
  assert.match(f, /일째/, '며칠째인지 안 보여 준다');
  assert.match(f, /toNext/, '개근까지 며칠인지 안 보여 준다 — 그게 다시 올 이유다');
});

test('도장이 없는 사람에게는 빈 줄을 그리지 않는다', () => {
  // 자리만 잡아 두고 비워 두면 홈이 덜 그려진 것처럼 보인다.
  const f = main.slice(main.indexOf('function streakRow()'),
    main.indexOf('const MINI_CHECKIN_TOKENS_HINT'));
  assert.match(f, /if \(!c \|\| !c\.streak\) return ''/, '빈 줄을 그린다');
});

test('앱이 말하는 보상 개수와 서버가 주는 개수가 같다', () => {
  // ⚠️ 이게 어긋나면 "내일이면 3개" 라고 해 놓고 다른 수를 준다. 오류가 안 나고
  //    받은 사람만 속은 기분이 된다.
  const 앱 = /const MINI_CHECKIN_TOKENS_HINT = (\d+)/.exec(main)?.[1];
  const 서버 = /const MINI_CHECKIN_TOKENS = (\d+)/.exec(worker)?.[1];
  assert.ok(앱 && 서버, '둘 중 하나를 못 읽었다');
  assert.equal(앱, 서버, `앱은 ${앱}개라 하고 서버는 ${서버}개를 준다`);
});

test('도장 줄에 모양이 붙어 있다', () => {
  assert.match(css, /\.streak-row \{/, '도장 줄 모양이 없다 — 맨몸으로 나온다');
});

test('하루에 두 번은 안 찍힌다', () => {
  // 저절로 찍히므로, 앱을 하루에 열 번 켜도 연속 일수가 열이 되면 안 된다.
  // id 에 날짜가 박혀 있고 ON CONFLICT DO NOTHING 이 그걸 막는다.
  const f = worker.slice(worker.indexOf('async function handleMiniCheckin('),
    worker.indexOf('async function handleMiniCheckin(') + 1200);
  assert.match(f, /checkin:\$\{userKey\}:\$\{today\}/, 'id 에 날짜가 없다');
  assert.match(f, /ON CONFLICT\(id\) DO NOTHING/, '같은 날 또 찍히는 것을 안 막는다');
});
