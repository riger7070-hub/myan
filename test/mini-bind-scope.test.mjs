// bind() 가 화면 밖까지 손대지 않는지.
//
// 실제로 당했다. `document.querySelectorAll('[data-theme]')` 는 <html data-theme="dark">
// 를 함께 잡는다 — applyTheme() 가 그 속성을 documentElement 에 붙이기 때문이다.
// 그러면 <html> 에 onclick 이 걸리고, 화면 어디를 누르든 그리로 버블링돼
// render() 가 돌아 #app 이 통째로 다시 그려진다. 입력칸이 새 요소로 갈리니
// 포커스가 즉시 날아가고 글자를 칠 수 없다 — "이름 칸을 눌러도 무반응"의 정체다.
//
// 화면에 쓰는 요소는 전부 #app 안에 있으므로, 찾는 범위도 거기로 묶는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'mini', 'src', 'main.js'), 'utf8');

// bind() 본문만 떼어 낸다.
function bindBody() {
  const i = SRC.indexOf('function bind() {');
  assert.ok(i > 0, 'bind() 를 못 찾았다');
  const j = SRC.indexOf('\nfunction ', i + 10);
  return SRC.slice(i, j > 0 ? j : SRC.length);
}

test('bind() 는 document 전체를 훑지 않는다', () => {
  const body = bindBody();
  const hits = [...body.matchAll(/document\.querySelectorAll\((['"])(.*?)\1\)/g)].map(m => m[2]);
  assert.deepEqual(hits, [],
    `document 범위로 찾는 곳이 남아 있다: ${hits.join(', ')} — #app 안으로 묶을 것`);
});

test('밝기 설정은 documentElement 에 data-theme 을 붙인다', () => {
  // 위 테스트가 지키려는 전제. 이게 바뀌면 덫도 사라지므로 함께 확인해 둔다.
  assert.match(SRC, /documentElement\.setAttribute\('data-theme'/,
    'applyTheme 이 documentElement 를 건드리지 않는다 — bind() 규칙의 전제가 달라졌다');
});

test('화면 요소를 찾을 때는 app 을 기준으로 삼는다', () => {
  const body = bindBody();
  // all() 헬퍼(= app.querySelectorAll)로 통일돼 있어야 한다.
  assert.match(body, /const all = \(sel\) => app\.querySelectorAll\(sel\)/,
    'all() 헬퍼가 없다 — 범위를 묶는 지점이 사라졌다');
  const used = [...body.matchAll(/\ball\((['"])\[data-\w+\]\1\)/g)].length;
  assert.ok(used >= 5, `all() 로 찾는 곳이 ${used}곳뿐이다 — 일부가 빠졌는지 확인할 것`);
});
