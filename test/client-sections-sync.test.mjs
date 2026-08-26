// 웹과 미니앱의 홈 묶음이 같은가.
//
// 두 클라이언트는 하나의 워커를 쓰지만 화면은 각자 들고 있다. 그래서 조용히
// 갈라진다 — 실제로 웹 홈에 18개, 미니앱에 30개가 올라가 있었고, 차이는 기획이
// 아니라 그냥 웹에 화면을 안 만든 것이었다. 그 상태로 몇 달이 갔다.
//
// 여기서는 **담긴 항목**까지 같기를 요구하지 않는다. 로또는 웹에만, 출석·산가지는
// 미니앱에만 있는 것이 맞다. 대신 **묶음의 제목과 순서**를 맞춘다 — 그것이 어긋나면
// 같은 서비스의 두 얼굴이 서로 다른 지도를 들고 있는 셈이 된다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
const miniSrc = readFileSync(join(ROOT, 'mini', 'src', 'contents.js'), 'utf8');

// 웹: _homeSections() 만 떼어 평가한다. t 를 undefined 만 돌려주는 스텁으로 두면
// `t.csMe || '사주로 보는 나'` 의 **한국어 기본값**이 남는다 — 미니앱이 들고 있는
// 문자열도 그 한국어라 이대로 맞대 볼 수 있다.
const body = appSrc.match(/function _homeSections\(\) \{[\s\S]*?\n\}/);
assert.ok(body, '_homeSections 를 찾지 못했다');

// 타일의 값은 함수 밖 CONTENT_COST 표에서 읽으므로 그 표도 함께 떼어 온다.
const costTable = appSrc.match(/const CONTENT_COST = \{[\s\S]*?\n\};/);
assert.ok(costTable, 'CONTENT_COST 표를 찾지 못했다 — js/app.js 의 값표 이름이 바뀌었는가?');
const tStub = new Proxy({}, { get: () => undefined });
const web = runInNewContext(
  `${costTable[0]}
${body[0]}\n; __out = _homeSections();`,
  { getT: () => tStub, __out: null },
);

// 미니앱: SECTIONS 배열에서 묶음 머리만 훑는다.
const mini = [...miniSrc.matchAll(/icon:\s*'(\w+)',\s*title:\s*'([^']+)'/g)]
  .map(m => ({ icon: m[1], title: m[2] }));

test('양쪽 다 묶음을 읽어 냈다', () => {
  assert.ok(web.length >= 4, `웹 묶음이 ${web.length}개다 — 추출이 실패했을 수 있다`);
  assert.ok(mini.length >= 4, `미니앱 묶음이 ${mini.length}개다 — 추출 정규식을 확인할 것`);
});

// ⚠️ web 은 runInNewContext 안에서 만들어진 배열이라 **다른 realm 의 Array** 다.
// deepStrictEqual 은 프로토타입까지 보므로 내용이 같아도 어긋난다(실제로 겪었다).
// 한 줄로 이어 문자열로 맞댄다 — 어디가 다른지도 이쪽이 더 잘 보인다.
const line = (list, pick) => list.map(pick).join(' > ');

test('묶음의 제목과 순서가 웹·미니앱에서 같다', () => {
  assert.equal(
    line(mini, s => s.title),
    line(web, s => s.title),
    '한쪽만 묶음을 고쳤다 — 같은 서비스가 두 개의 다른 지도를 들게 된다',
  );
});

test('묶음 아이콘도 같은 것을 쓴다', () => {
  assert.equal(line(mini, s => s.icon), line(web, s => s.icon),
    '제목은 같은데 아이콘이 다르다 — 두 화면이 달라 보인다');
});

test('미니앱도 한 묶음에 2~7개까지만 담는다', () => {
  // 웹에는 같은 규칙이 home-sections.test.mjs 에 있다. 미니앱에는 없어서
  // 한쪽만 부풀 수 있었다 — 실제로 웹이 넷으로 버티는 동안 미니앱은 서른까지 갔다.
  const blocks = miniSrc.slice(miniSrc.indexOf('export const SECTIONS = [')).split(/icon:\s*'sec/);
  for (let i = 1; i < blocks.length; i++) {
    const title = (blocks[i].match(/title:\s*'([^']+)'/) || [])[1] || `#${i}`;
    const n = (blocks[i].match(/\{ id: '/g) || []).length;
    assert.ok(n >= 2, `${title}: 타일이 ${n}개면 묶음이 될 이유가 없다`);
    assert.ok(n <= 7, `${title}: ${n}개는 한 칸에 너무 많다 — 다시 나눌 것`);
  }
});
