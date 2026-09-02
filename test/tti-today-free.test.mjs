// 홈 첫 화면의 「오늘의 띠 순위」가 **공짜로** 남아 있는지 지킨다.
//
// ⚠️ 왜 시험까지 두는가. 2026-09-02 에 숫자를 보고 값을 뗐다 —
//
//    미니앱에 온 43명 가운데 29명(67%)이 한 번 켜고 다시 오지 않았다. 까닭이
//    값 매김에 있었다. **공짜로 주던 「내 사주 풀이」는 평생 안 바뀌고**(한 번
//    읽으면 끝이다) **날마다 바뀌는 「오늘 어때요」에는 1엽전을 받았다.**
//    가입 엽전 3개를 쓰고 나면 내일 다시 열 이유가 없다. 그래서 홍보를 아무리
//    해도 그날 온 사람만 세어지고 다음 날 0으로 돌아갔다.
//
// 이 자리에 값을 도로 붙이면 그때로 돌아간다. 아무 시험도 안 깨지고, 몇 주
// 뒤에 「또 안 늘었네」 로만 나타난다. 그래서 여기서 못 박는다.
//
// 나누는 자리는 **돈이 드는가** 이다. 순위 계산은 한 푼도 안 들고, 풀이는
// Gemini 를 부르므로 돈이 나간다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../mini/src/main.js', import.meta.url), 'utf8');
const contents = readFileSync(new URL('../mini/src/contents.js', import.meta.url), 'utf8');

/** handleTtiToday 의 몸통만 잘라 낸다. 옆 함수의 코드에 걸려 오판하지 않도록. */
function 몸통(이름) {
  const 시작 = worker.indexOf(`async function ${이름}(request, env) {`);
  assert.notEqual(시작, -1, `${이름} 이 없다`);
  const 끝 = worker.indexOf('\nasync function ', 시작 + 10);
  return worker.slice(시작, 끝 === -1 ? worker.length : 끝);
}

test('공짜 순위 엔드포인트가 있다', () => {
  assert.match(worker, /path === '\/api\/tti-today'/, '/api/tti-today 길이 없다');
  assert.match(worker, /async function handleTtiToday\(/);
});

test('공짜 순위는 엽전을 쓰지 않는다', () => {
  const b = 몸통('handleTtiToday');
  for (const 금지 of ['accountSpend', 'accountRefund', 'accountBalance']) {
    assert.ok(!b.includes(금지),
      `handleTtiToday 가 ${금지} 를 부른다 — 이 칸은 공짜여야 한다`);
  }
});

test('공짜 순위는 AI 를 부르지 않는다', () => {
  // 부르는 순간 돈이 나가고, 돈이 나가면 언젠가 값을 다시 붙이게 된다.
  // 순위는 computeTtiRanking() 만으로 나온다.
  const b = 몸통('handleTtiToday');
  for (const 금지 of ['geminiText', 'cachedReading']) {
    assert.ok(!b.includes(금지),
      `handleTtiToday 가 ${금지} 를 부른다 — 순위는 계산만으로 나와야 한다`);
  }
  assert.ok(b.includes('computeTtiRanking'), '순위를 계산하지 않는다');
});

test('잔액이 0 이어도 순위는 나온다', () => {
  // 엽전이 없는 사람이야말로 이 칸이 붙잡아야 할 사람이다. 잔액을 확인하면
  // 그 사람에게는 이 칸이 실패로 보인다.
  const b = 몸통('handleTtiToday');
  assert.ok(!/엽전.{0,20}필요/.test(b), '엽전이 필요하다고 막는 자리가 있다');
  assert.ok(!b.includes('402'), '402(결제 필요)를 돌려주는 자리가 있다');
});

test('돈이 드는 풀이는 그대로 값을 받는다', () => {
  // 파는 것을 깎은 게 아니다. Gemini 를 부르는 쪽은 그대로다.
  const b = 몸통('handleTtiRanking');
  assert.ok(b.includes('accountSpend'), 'AI 풀이가 공짜가 됐다 — 그건 돈이 나간다');
  assert.ok(b.includes('geminiText') || b.includes('cachedReading'));
});

test('홈 첫 화면에 그 칸이 선다', () => {
  assert.ok(main.includes('function ttiCard()'), 'ttiCard 가 없다');
  const home = main.slice(main.indexOf("case 'home': {"), main.indexOf("case 'home': {") + 1200);
  assert.ok(home.includes('${ttiCard()}'), '홈에 그 칸을 안 그린다');
});

test('그 칸에 「무료」라고 적혀 있다', () => {
  // 공짜인 걸 안 적으면 눌러 보지 않는다 — 다른 칸이 다 값이 붙어 있어서
  // 이것도 돈을 낼 것처럼 보인다.
  const card = main.slice(main.indexOf('function ttiCard()'),
    main.indexOf('const MENU_ITEMS'));
  assert.ok(card.includes('무료'), '공짜라는 말이 그 칸에 없다');
  assert.ok(!/tti-today-free[\s\S]{0,200}엽전.{0,6}<\/span>/.test(card),
    '공짜 표시 자리에 값이 붙었다');
});

test('앱을 켜면 순위를 받아 온다', () => {
  assert.ok(main.includes('loadTtiToday()'), '순위를 부르는 자리가 없다');
  assert.match(main, /\/api\/tti-today/, '미니앱이 공짜 길을 안 쓴다');
});

test('순위를 못 받아도 홈은 선다', () => {
  // 덤으로 얹는 칸이다. 이것 때문에 홈 전체가 빨개지면 안 된다.
  const f = main.slice(main.indexOf('async function loadTtiToday()'),
    main.indexOf('async function loadTtiToday()') + 900);
  assert.ok(f.includes('catch'), '실패를 안 받아 낸다');
  assert.ok(!f.includes('state.error'), 'state.error 를 세운다 — 홈에 빨간 띠가 뜬다');
});

test('공짜 칸에서 돈 내는 풀이로 갈 길이 있다', () => {
  // 공짜로 끌어와서 파는 것으로 잇는다. 그 길이 없으면 그냥 공짜만 주는 셈이다.
  const card = main.slice(main.indexOf('function ttiCard()'),
    main.indexOf('const MENU_ITEMS'));
  assert.match(card, /data-item="ttirank"/, 'AI 풀이로 가는 길이 없다');
});

test('ttirank 는 여전히 목록에 있다', () => {
  // 홈 칸이 data-item="ttirank" 로 여는데, 목록에서 빠지면 눌러도 아무 일이
  // 안 일어난다(itemById 가 못 찾는다). 오류도 안 난다.
  assert.match(contents, /id: 'ttirank'/, 'ttirank 가 목록에서 사라졌다');
});
