// 블로그에 붙여 넣을 글은 **기호 없는 순수 글**이어야 한다.
//
// 네이버 블로그 편집기에 그대로 붙여 넣는 글이다. 마크다운 기호가 섞이면 井 이나
// 별표가 글자 그대로 찍혀 나가고, 그걸 손으로 지우다 보면 결국 안 쓰게 된다.
// 가운뎃점과 따옴표도 뺀다 — 이런 기호가 늘어날수록 사람이 쓴 글로 안 보인다.
//
// ⚠️ .md 가 아니라 .txt 로 둔다. 확장자가 md 면 다음에 고칠 때 무심코 마크다운을
//    다시 쓰게 된다. 붙여 넣는 글에는 문법이 없다는 뜻을 확장자로 남긴다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'blog');
const 글 = readdirSync(DIR).filter((f) => f.endsWith('.txt'));

test('붙여 넣을 글이 세 편 있다', () => {
  assert.ok(글.length >= 3, `blog 에 .txt 가 ${글.length}편뿐이다`);
});

// 이름과 정규식. 마크다운 문법과 장식 기호를 모두 본다.
const 금지 = [
  ['우물정(제목 문법)', /#/],
  ['별표(굵게)', /\*/],
  ['인용부호', /^>/m],
  ['표', /\|/],
  ['가운뎃점', /·/],
  ['둥근 따옴표', /[“”‘’]/],
  ['화살표', /[←-⇿]/],
  ['말줄임표 기호', /…/],
  ['줄표', /[–—]/],
  ['대괄호', /[[\]]/],
  ['백틱', /`/],
  ['이모지', /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}]/u],
];

for (const f of 글) {
  const src = readFileSync(join(DIR, f), 'utf8');

  test(`${f} 에 기호가 없다`, () => {
    for (const [이름, re] of 금지) {
      const m = re.exec(src);
      assert.equal(m, null, `${이름} 이 남아 있다: "${src.slice(Math.max(0, (m?.index ?? 0) - 30), (m?.index ?? 0) + 30).replace(/\n/g, ' ')}"`);
    }
  });

  test(`${f} 가 실제로 있는 주소를 가리킨다`, () => {
    // 오타 난 주소를 블로그에 박아 두면 들어온 사람이 그대로 튕긴다.
    const 주소 = [...src.matchAll(/myan\.riger7070\.workers\.dev(\/[\w/-]*)/g)].map((m) => m[1]);
    assert.ok(주소.length >= 1, '앱으로 보내는 주소가 없다');
    const 있는것 = ['/calc/sonnal', '/gunghap', '/calc/manseryeok', '/calc', '/tti', '/app'];
    for (const p of 주소) assert.ok(있는것.includes(p), `없는 주소를 가리킨다: ${p}`);
  });

  test(`${f} 에 사진 자리가 표시되어 있다`, () => {
    // 글만 있는 네이버 블로그 글은 검색에서도 밀리고 읽히지도 않는다.
    assert.match(src, /사진 넣는 자리/, '사진 넣을 곳이 안 적혀 있다');
  });
}
