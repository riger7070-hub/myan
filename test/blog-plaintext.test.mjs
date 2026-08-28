// 블로그에 붙여 넣을 글은 **정한 기호만** 쓴다.
//
// 네이버 블로그 편집기에 그대로 붙여 넣는 글이다. 마크다운 기호가 섞이면 우물정이나
// 별표가 글자 그대로 찍혀 나가고, 그걸 손으로 지우다 보면 결국 안 쓰게 된다.
//
// 쓰는 기호는 셋뿐이고 저마다 뜻이 있다. 아무 데나 흩뿌리면 장식이 되고,
// 장식은 눈이 그냥 넘긴다.
//
//   ◈  소제목
//   ※  주의할 것, 단서
//   ★  이 글에서 한 줄만 가져간다면 이것 (글마다 하나)
//
// 그 밖의 기호는 뺀다. 가운뎃점과 둥근 따옴표가 늘어날수록 사람이 쓴 글로 안 보인다.
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

// 이름과 정규식. 마크다운 문법과 장식 기호를 본다.
//
// ⚠️ 우물정을 통째로 막지 않는다. 태그(#손없는날)는 우물정이 있어야 네이버가
//    태그로 잡는다. 막는 것은 **제목 문법**(우물정 뒤에 빈칸)뿐이다.
const 금지 = [
  ['우물정 제목 문법', /^#{1,6}\s/m],
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

  test(`${f} 에 허락하지 않은 기호가 없다`, () => {
    // ⚠️ 정한 세 기호는 먼저 걷어내고 본다. ★ 은 유니코드로 이모지 구역에 앉아 있어서
    //    (U+2605) 이모지 검사에 걸린다. 뜻을 두고 쓰는 기호와 장식을 가르는 일이라,
    //    구역을 손보는 것보다 허락한 것을 빼고 보는 편이 읽기 쉽다.
    const 본문 = src.replace(/[★※◈]/g, '');
    for (const [이름, re] of 금지) {
      const m = re.exec(본문);
      assert.equal(m, null, `${이름} 이 남아 있다: "${본문.slice(Math.max(0, (m?.index ?? 0) - 30), (m?.index ?? 0) + 30).replace(/\n/g, ' ')}"`);
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

  test(`${f} 의 문단이 눈으로 갈린다`, () => {
    // 소제목 없이 죽 이어지면 스크롤하다 어디를 읽고 있는지 놓친다.
    // 마크다운 우물정은 편집기에 그대로 찍히므로 쓰지 않고, 글자 기호로 가른다.
    //
    // 기호마다 뜻이 다르다. 아무 데나 흩뿌리면 장식이 되고, 장식은 눈이 그냥 넘긴다.
    //   ◈  소제목
    //   ※  주의할 것, 단서
    //   ★  이 글에서 한 줄만 가져간다면 이것
    const 소제목 = (src.match(/^◈ /gm) || []).length;
    assert.ok(소제목 >= 4, `소제목이 ${소제목}개뿐이다 — 문단이 안 갈린다`);
    assert.equal((src.match(/^※ /gm) || []).length, 1, '주의 표시가 하나가 아니다');
    assert.equal((src.match(/★ /g) || []).length, 1,
      '핵심 표시가 하나가 아니다 — 여럿이면 어느 것이 핵심인지 알 수 없다');
  });

  test(`${f} 끝에 태그가 있다`, () => {
    // 네이버는 본문 끝 우물정 낱말을 태그로 잡는다. 없으면 검색에서 손해다.
    const 마지막 = src.trimEnd().split('\n').pop();
    assert.match(마지막, /^#\S/, `마지막 줄이 태그가 아니다: "${마지막.slice(0, 40)}"`);
    assert.ok((마지막.match(/#/g) || []).length >= 5,
      `태그가 ${(마지막.match(/#/g) || []).length}개뿐이다`);
  });
}

test('⚠️ 바깥으로 보내는 주소는 크몽 하나뿐이다', () => {
  // 블로그에서 남의 사이트로 보내는 링크가 늘어나면 글이 광고 모음이 된다.
  // 지금 밖으로 보내는 곳은 크몽 상세페이지 하나이고, 그것도 한 편에만 있다.
  const 밖 = 글.map((f) => [f, readFileSync(join(DIR, f), 'utf8')])
    .filter(([, s]) => /kmong\.com/.test(s));
  assert.equal(밖.length, 1, '크몽 링크가 여러 글에 있다: ' + 밖.map((x) => x[0]).join(', '));
  const [, src2] = 밖[0];
  assert.equal((src2.match(/kmong\.com/g) || []).length, 1, '한 글에 크몽 링크가 여럿이다');
  assert.match(src2, /kmong\.com\/gig\/766523/, '크몽 주소가 틀렸다');
});

test('⚠️ 건강 이야기에 과장이 없다', () => {
  // 식단 글은 면허 있는 영양사가 쓰는 글이다. 사주로 병이 낫는다고 하면 거짓이고,
  // 식품 표시광고법에 걸린다. 검증된 것과 전통을 나눠 적었는지 본다.
  const f = '오행식단.txt';
  if (!글.includes(f)) return;
  const src2 = readFileSync(join(DIR, f), 'utf8');

  // ⚠️ "치료가 필요하시면 병원에 가셔야 합니다" 는 오히려 있어야 하는 말이다.
  //    금지어를 그냥 찾으면 이 문장에 걸리니 먼저 걷어내고 본다.
  const 본문2 = src2.replace('치료가 필요하시면 병원에 가셔야 합니다', '');
  for (const 금지말 of ['치료', '완치', '효능', '낫습니다', '개선됩니다', '체질 개선', '해독']) {
    const i = 본문2.indexOf(금지말);
    assert.equal(i, -1, '과장으로 읽힐 말이 있다: ' + 금지말 + ' — '
      + 본문2.slice(Math.max(0, i - 25), i + 25).replace(/\n/g, ' '));
  }
  // 그리고 선을 긋는 두 문장은 반드시 있어야 한다.
  assert.match(src2, /영양학이 검증한 것이 아닙니다/, '검증되지 않았다는 말을 안 했다');
  assert.match(src2, /병원에 가셔야 합니다/, '치료가 필요할 때 어디로 가라는 말이 없다');
});

test('⚠️ 첫 글에만 인사말이 있다', () => {
  // 오랜만에 여는 블로그의 첫 글이라 인사로 연다. 나머지 글에까지 인사를 붙이면
  // 매번 처음 온 사람에게 말하는 꼴이 되어 어색하다.
  const 첫글 = readFileSync(join(DIR, '손없는날.txt'), 'utf8');
  assert.match(첫글, /안녕하세요/, '첫 글에 인사말이 없다');
  assert.match(첫글, /읽어 주셔서 고맙습니다/, '첫 글에 맺음말이 없다');
  for (const f of 글.filter((x) => x !== '손없는날.txt')) {
    assert.doesNotMatch(readFileSync(join(DIR, f), 'utf8'), /안녕하세요/,
      `${f} 에도 인사말이 있다 — 첫 글에만 둔다`);
  }
});
