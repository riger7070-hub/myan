// 상대에게 물어보기(궁합 초대 링크)가 앱 쪽에서 이어져 있는지.
//
// 화면에 버튼을 그려 놓고 bind() 에 손잡이를 안 달면, 눌러도 아무 일이 없다.
// 사용자는 앱이 멈춘 줄 안다 — 그런 신고를 이미 한 번 받았다. 그래서 이 파일은
// 초대뿐 아니라 화면의 모든 버튼이 실제로 연결돼 있는지를 함께 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'mini', 'src', 'main.js'), 'utf8');
const CSS = readFileSync(join(HERE, '..', 'mini', 'src', 'style.css'), 'utf8');

test('화면에 그린 버튼은 모두 손잡이가 달려 있다', () => {
  const ids = [...new Set([...SRC.matchAll(/id="(btn-[\w-]+)"/g)].map(m => m[1]))];
  assert.ok(ids.length > 10, `버튼을 ${ids.length}개밖에 못 찾았다 — 훑는 방식을 확인할 것`);
  const dead = ids.filter(id => !SRC.includes(`on('${id}'`));
  assert.deepEqual(dead, [], `눌러도 아무 일이 없는 버튼: ${dead.join(', ')}`);
});

test('상대방 생년월일 칸 아래에 물어보기 자리가 있다', () => {
  const m = SRC.match(/case 'partner':[\s\S]*?(?=case 'photo':)/);
  assert.ok(m, "partner 입력 화면을 못 찾았다");
  assert.match(m[0], /invitePanel\(\)/, '물어보기 자리가 안 붙었다');
});

test('초대는 답이 오기 전까지 하나만 유지한다', () => {
  // 누를 때마다 새로 만들면 상대는 링크를 여러 개 받고,
  // 서버에는 답 없는 남의 자리만 쌓인다.
  const f = SRC.match(/async function makeInvite\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /if \(!iv \|\| iv\.answered\)/, '누를 때마다 새 초대를 만든다');
});

test('답이 오면 상대 생년월일을 대신 채운다', () => {
  const f = SRC.match(/async function checkInvite\([\s\S]*?\n\}/)[0];
  assert.match(f, /partner: done\.partner/, '받아 온 값을 입력칸에 넣지 않는다');
  assert.match(f, /x\.answered && x\.partner/, '답이 안 온 초대까지 집어 온다');
});

test('앱을 켠 뒤 답 확인은 한 번만 한다', () => {
  // 궁합 화면에 들어올 때마다 서버를 부르면 호출만 늘어난다.
  assert.match(SRC, /inviteChecked/, '한 번만 부르게 하는 표시가 없다');
  const f = SRC.match(/function openItem\(item\)[\s\S]*?\n\}/)[0];
  assert.match(f, /state\.inviteChecked = true;\s*\n\s*checkInvite/,
    '표시를 세우기 전에 부르거나, 아예 안 부른다');
  assert.match(f, /quiet: true/, '조용히 확인해야 할 자리에서 오류를 띄운다');
});

test('링크만 뿌려서는 엽전이 들어오지 않는다고 적어 둔다', () => {
  const f = SRC.match(/function invitePanel\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /답이 오면/, '언제 엽전을 주는지 안 밝힌다');
});

test('적던 생년월일이 초대를 누르면서 날아가지 않는다', () => {
  // withBusy 는 화면을 다시 그린다. 입력칸 값은 DOM 에만 있으므로 그때 사라진다.
  const f = SRC.match(/async function makeInvite\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /_keepPartnerInput\(\)/, '적던 값을 챙기지 않는다');
});

test('물어보기 자리에 쓴 모양이 style.css 에 있다', () => {
  const f = SRC.match(/function invitePanel\(\)[\s\S]*?\n\}/)[0];
  const classes = [...new Set([...f.matchAll(/class="([^"$]+)"/g)]
    .flatMap(m => m[1].split(/\s+/)))];
  const missing = classes.filter(c => !CSS.includes('.' + c));
  assert.deepEqual(missing, [], `style.css 에 없는 모양: ${missing.join(', ')}`);
});
