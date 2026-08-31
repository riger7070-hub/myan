// 앱을 닫기 전에 한 번 물어보는지.
//
// 홈에서 뒤로가기를 한 번 잘못 누르면 아무 확인도 없이 앱이 사라졌다. 보던 풀이가
// 있어도 그대로 끝났다. 되돌릴 수 없는 동작이니 한 번은 물어야 한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'mini', 'src', 'main.js'), 'utf8');

const fnOf = (name) => {
  const i = SRC.indexOf(`function ${name}(`);
  assert.ok(i > 0, `${name} 을 못 찾았다`);
  return SRC.slice(i, SRC.indexOf('\n}', i) + 2);
};

test('돌아갈 곳이 없어도 곧장 닫지 않는다', () => {
  const f = fnOf('goBack');
  assert.match(f, /state\.confirmExit = true;/, '묻지 않고 넘어간다');
  assert.doesNotMatch(f, /closeView\(\)/, 'goBack 이 아직 직접 앱을 닫는다');
});

test('닫는 것은 사용자가 그렇다고 했을 때만', () => {
  // ⚠️ SDK 함수 **이름**을 못 박지 않는다. 이름이 바뀌면 시험이 옛 이름을 지키는
  //    꼴이 된다. 실제로 공유 쪽이 그랬다 — 시험이 낡은 getTossShareLink 를 붙들고
  //    있어서 고장 난 코드가 초록불로 남아 있었다.
  //    여기서는 **닫기는 한다**는 것만 본다. 낡은 이름을 쓰는지는
  //    mini-sdk-deprecated 가 SDK 의 @deprecated 를 읽어 따로 잡는다.
  assert.match(fnOf('closeApp'), /(Screen\.close|closeView)\(\)/, '닫는 함수가 실제로 닫지 않는다');
  assert.match(SRC, /on\('btn-exit-yes', closeApp\)/, '닫기 버튼이 연결돼 있지 않다');
});

test('물음을 거두는 길이 셋 다 있다', () => {
  // 버튼·바깥 누르기·뒤로가기. 어느 쪽으로도 빠져나올 수 있어야 한다.
  assert.match(SRC, /on\('btn-exit-no', stayIn\)/, "'더 볼래요' 가 없다");
  assert.match(SRC, /on\('btn-exit-scrim', stayIn\)/, '바깥을 눌러도 안 닫힌다');
  assert.match(fnOf('goBack'), /if \(state\.confirmExit\) \{ state\.confirmExit = false;/,
    '물음이 떠 있을 때 뒤로가기가 그 물음을 거두지 않는다');
});

test('물음과 가림막의 id 가 겹치지 않는다', () => {
  // 같은 id 를 두 번 쓰면 getElementById 가 앞의 것만 잡아 버튼이 죽는다.
  const ids = [...SRC.matchAll(/id="(btn-exit-[\w-]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `id 가 겹친다: ${ids.join(', ')}`);
});

test('무엇을 잃는지 알려 준다', () => {
  const i = SRC.indexOf('class="exit-ask"');
  assert.ok(i > 0, '물음 상자가 없다');
  const box = SRC.slice(i, i + 500);
  assert.match(box, /닫을까요/, '무엇을 묻는지 불분명하다');
  assert.match(box, /지난 기록에 남아/, '보던 것이 사라지는지 아닌지 말해 주지 않는다');
});
