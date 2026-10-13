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

// ⚠️ 이 시험은 2026-09-02 부터 10-13 까지 **헛돌았다.** 「첫 `go('home');`」 을
//    부팅 지점이라 여기고 그 뒤 500자에 doCheckin 이 있는지만 봤는데, 그 첫
//    `go('home');` 은 `saveProfile()` 안의 것이었다. 프로필 저장은 생애 한 번뿐이라
//    **다시 온 사람은 그 길을 안 지나는데**, 시험은 초록불이었다.
//    그 바람에 도장이 아무에게도 2가 되지 않았고, 나는 그 숫자를 보고
//    「재방문이 0이다」라고 사장님께 말씀드렸다. 측정기가 고장 나 있었다.
//
//    그래서 이제 **홈으로 가는 길이 몇 개인지**를 센다. 길이 하나뿐이고 그
//    하나가 도장을 찍으면, 어느 경로로 들어오든 찍힌다.

// ⚠️ 「go('home') 을 부르는 자리는 하나뿐」으로 재면 안 된다. 처음에 그렇게 썼다가
//    결제가 끝난 뒤와 「홈으로」 단추까지 걸렸다 — 그 둘은 **앱 안에서 돌아가는**
//    길이지 앱에 **들어오는** 길이 아니다. 거기서 도장을 또 찍을 이유가 없다.
//    가려야 하는 것은 **들어오는 길**이고, 그건 둘뿐이다.
//
//      loginWithToss()  이미 가입한 사람이 앱을 열 때   ← 재방문은 전부 이쪽
//      saveProfile()    처음 온 사람이 생년월일을 넣을 때

test('도장을 찍는 자리는 홈 문 하나뿐이다', () => {
  // 여기저기서 찍으면 하루에 여러 번 부르게 되고, 한 군데를 빠뜨려도 모른다.
  const 코드 = main.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const 부름 = [...코드.matchAll(/doCheckin\(\{ quiet: true \}\)/g)].length;
  assert.equal(부름, 1, `저절로 찍는 자리가 ${부름}군데다 — enterHome() 안의 하나여야 한다`);
  const 문 = /function enterHome\(\)[\s\S]{0,600}?\n\}/.exec(코드)?.[0] || '';
  assert.match(문, /doCheckin\(\{ quiet: true \}\)/, '그 하나가 홈 문 안에 없다');
});

/**
 * 함수 하나의 몸통. 매개변수의 중괄호에 속지 않게 괄호 깊이를 함께 센다.
 *
 * ⚠️ 앞뒤 표시를 손으로 짚어 slice 하지 말 것. 이 파일에서만 세 번 틀렸다 —
 *    뒤 표시가 앞 표시보다 위에 있거나, 다음 함수가 사이에 끼어들어 남의
 *    코드까지 재고 있었다. 중괄호를 세면 그런 일이 없다.
 */
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

test('앱에 들어오는 두 길이 모두 홈 문을 지난다', () => {
  for (const 머리 of ['async function loginWithToss()', 'async function saveProfile(form)']) {
    const f = 몸통(main, 머리).replace(/^\s*\/\/.*$/gm, '');
    assert.match(f, /enterHome\(\)/,
      `${머리} 가 홈 문을 안 지난다 — 그 길로 온 사람은 도장이 안 찍힌다`);
    assert.ok(!/go\('home'\)/.test(f), `${머리} 가 홈으로 직접 간다 — enterHome() 을 쓸 것`);
  }
});

test('그 문이 도장을 찍고 순위를 부른다', () => {
  const i = main.indexOf('function enterHome()');
  assert.notEqual(i, -1, 'enterHome 이 없다');
  const 문 = main.slice(i, i + 600);
  assert.match(문, /doCheckin\(\{ quiet: true \}\)/, '홈에 들어와도 도장을 안 찍는다');
  assert.match(문, /loadTtiToday\(\)/, '홈에 들어와도 오늘 순위를 안 부른다');
});

test('로그인해서 들어오는 길도 그 문을 지난다', () => {
  // ⚠️ 여기가 2026-09-02 에 빠졌던 바로 그 길이다. 이미 가입한 사람이
  //    앱을 여는 길이고, 재방문은 전부 이쪽으로 들어온다.
  const i = main.indexOf('async function loginWithToss()');
  assert.notEqual(i, -1, 'loginWithToss 가 없다');
  const f = main.slice(i, main.indexOf('async function doLogin()'));
  assert.match(f, /enterHome\(\)/,
    '로그인하고 들어오는 사람이 홈 문을 안 지난다 — 다시 온 사람에게 도장이 안 찍힌다');
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
