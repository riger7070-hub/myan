// 「이 풀이가 도움이 되셨나요」 와 알림 동의를 지킨다.
//
// ⚠️ 왜 이 둘이 한 파일에 있는가. 둘 다 **2026-09-02 의 같은 물음**에서 나왔다 —
//    43명이 왔고 29명(67%)이 안 돌아왔는데, 도장과 알림은 「좋았는데 잊은 사람」을
//    되부르는 장치다. 애초에 안 좋았던 거라면 알림은 차단만 부른다.
//    그 둘을 가르는 것이 「도움이 됐나요」이고, 그래서 붙어 있어야 한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../mini/src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../mini/src/style.css', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');

const 물음 = main.slice(main.indexOf('function feedbackRow('), main.indexOf('function streakRow('));
const 보냄 = main.slice(main.indexOf('async function sendFeedback('), main.indexOf('// ── 알림'));
const 알림 = main.slice(main.indexOf('function askNotify()'), main.indexOf('function askNotify()') + 1600);
const 서버 = worker.slice(worker.indexOf('async function handleMiniFeedback('),
  worker.indexOf('/** 출석 도장 + 7일 개근 보상. */'));

// ── 도움이 됐나요 ────────────────────────────────────────────
test('풀이 끝에 물어보는 자리가 있다', () => {
  const res = main.slice(main.indexOf("case 'result': {"), main.indexOf("case 'history':"));
  assert.ok(res.includes('${feedbackRow(r)}'), '결과 화면에서 안 묻는다');
  assert.match(worker, /path === '\/mini\/api\/feedback'/, '받는 길이 없다');
});

test('값을 매기게 하지 않는다', () => {
  // 별 다섯 개처럼 고르게 하면 안 누른다. 우리가 알아야 할 것도 하나뿐이다.
  assert.match(물음, /data-fb="up"/);
  assert.match(물음, /data-fb="down"/);
  assert.ok(!/[1-5]점|별|★/.test(물음), '점수를 매기게 되어 있다');
});

test('누른 단추가 실제로 이어져 있다', () => {
  // ⚠️ 그리기만 하고 안 잇는 실수를 막는다 — 눌러도 아무 일이 안 일어나고
  //    오류도 안 난다. 표가 영영 0건인 채로 남는다(전에 그랬다).
  assert.match(main, /all\('\[data-fb\]'\)/, 'data-fb 를 아무도 안 듣는다');
  assert.match(main, /sendFeedback\(el\.dataset\.fb\)/);
});

test('두 번 누르면 두 번 세지 않는다', () => {
  assert.match(보냄, /if \(!item \|\| state\.feedback\[item\.id\]\) return/, '앱에서 두 번 보낸다');
  assert.match(서버, /ON CONFLICT\(id\) DO NOTHING/, '서버가 두 번 센다');
  assert.match(서버, /\$\{userKey\}:\$\{feature\}:\$\{today\}/, 'id 에 사람·기능·날짜가 다 없다');
});

test('실패해도 그분에게 알리지 않는다', () => {
  // 우리가 알고 싶어서 물은 것이지 그분이 해야 할 일이 아니다.
  assert.ok(보냄.includes('catch'), '실패를 안 받아 낸다');
  assert.ok(!보냄.includes('state.error'), '오류를 화면에 띄운다');
  assert.ok(!보냄.includes('withBusy'), '로딩 화면을 덮는다');
  assert.match(서버, /return miniCors\(request, JSON\.stringify\(\{ ok: true \}\), 200\);\s*\n\s*\}\s*\n\}/,
    '서버가 실패를 오류로 돌려준다');
});

test('모르는 이름은 받지 않는다', () => {
  // 아무 글자나 받으면 표가 쓰레기가 된다.
  assert.match(서버, /\/\^\[a-z\]\{1,20\}\$\//, '들어오는 이름을 안 거른다');
});

test('생년월일이나 이름을 담지 않는다', () => {
  // 어느 콘텐츠가 좋았나만 알면 된다. 그것 말고는 담을 이유가 없다.
  for (const 금지 of ['birth', 'name', 'gender', 'profile']) {
    assert.ok(!서버.includes(금지), `되먹임에 ${금지} 를 담는다`);
  }
});

test('물어보는 자리에 모양이 붙어 있다', () => {
  assert.match(css, /\.fb-row \{/, '맨몸으로 나온다');
});

// ── 알림 ─────────────────────────────────────────────────────
test('처음 온 사람에게는 알림을 묻지 않는다', () => {
  // ⚠️ 이게 이 기능의 전부다. 처음 온 사람에게 물으면 대개 거절이고, 거절은
  //    되돌리기 어렵다. 다시 왔다는 것은 이미 좋았다는 뜻이라 그때가 유일하게
  //    예라고 할 만한 순간이다.
  assert.match(알림, /state\.checkin\.streak < 2/,
    '이틀째부터 묻는 조건이 없다 — 한 번뿐인 기회를 첫날에 버린다');
});

test('한 번만 묻는다', () => {
  assert.match(알림, /NOTIFY_ASKED_KEY/, '물어본 적이 있는지 기억하지 않는다');
  assert.match(알림, /localStorage\.getItem\(NOTIFY_ASKED_KEY\)/);
});

test('콘솔 템플릿이 없으면 아예 묻지 않는다', () => {
  // 코드 없이 부르면 열리다 마는 창을 보여 주고 그 한 번뿐인 기회를 버린다.
  assert.match(알림, /if \(!NOTIFY_TEMPLATE\) return/, '템플릿 없이도 부른다');
});

test('옛 토스 앱에서는 묻지 않는다', () => {
  assert.match(알림, /isSupported/, '이 창이 없는 기기에서도 부른다');
});

test('SDK 가 시키는 대로 콜백을 풀어 준다', () => {
  assert.match(알림, /cleanup\?\.\(\)/, '콜백을 안 푼다 — SDK 규약이다');
});

test('Notification 을 실제로 들여왔다', () => {
  assert.match(main, /Notification,?\s*\n?\s*\} from '@apps-in-toss\/web-framework'/,
    'Notification 을 안 들여왔다');
});
