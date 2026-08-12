// 풀이를 공유할 때 정작 풀이가 실려 나가는지.
//
// 예전 결과 화면에는 '이미지로 저장'과 '친구에게 알리기'가 따로 있었다. 저장은 앨범에
// 넣을 뿐 남에게 보내는 동작이 아니었고, 알리기는 앱 링크만 보내서 방금 읽은 풀이가
// 빠졌다 — 받는 쪽은 무슨 이야기인지 알 수 없었다. 하나로 합치면서 내용을 싣게 했다.
//
// 토스 SDK 는 브라우저에서 돌지 않으므로, 글을 짓는 함수만 소스에서 떼어 확인한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'mini', 'src', 'main.js'), 'utf8');

const fn = SRC.match(/function _resultShareText\(r, link\) \{[\s\S]*?\n\}/);
assert.ok(fn, '_resultShareText 를 못 찾았다');
const _resultShareText = eval(`(${fn[0].replace('function _resultShareText', 'function')})`);

const 배우자궁 = {
  item: { label: '배우자궁 풀이', icon: 'spouse' },
  extras: [{ label: '배우자궁', value: '酉(金) · 정재' }, { label: '살펴볼 해', value: '2027년' }],
  body: '제가 기운을 살펴보니, 태현님의 배우자 자리에는 유금(酉金)이 앉아 있습니다.\n\n'
      + '정재라 하는데, 알뜰하고 성실한 결입니다.',
};

test('공유 글에 풀이 내용이 담긴다', () => {
  const t = _resultShareText(배우자궁, 'https://toss.im/x/abc');
  assert.match(t, /배우자궁 풀이/, '무엇을 본 것인지가 없다');
  assert.match(t, /유금\(酉金\)이 앉아 있습니다/, '정작 풀이가 빠졌다');
  assert.match(t, /https:\/\/toss\.im\/x\/abc/, '앱으로 오는 길이 없다');
});

test('부가 정보도 한 줄로 함께 나간다', () => {
  const t = _resultShareText(배우자궁, '');
  assert.match(t, /배우자궁 酉\(金\) · 정재/, '뽑은 값이 빠졌다');
  assert.match(t, /살펴볼 해 2027년/);
});

test('링크를 못 만들었으면 찾아오는 법을 알려준다', () => {
  const t = _resultShareText(배우자궁, '');
  assert.match(t, /오늘운빨/, '링크도 없고 안내도 없으면 받는 쪽이 갈 곳이 없다');
});

test('긴 풀이는 앞부분만 싣는다', () => {
  // 메신저 미리보기에서 잘리면 아무것도 안 보낸 것과 같다.
  const 긴것 = { ...배우자궁, body: '가'.repeat(2000) };
  const t = _resultShareText(긴것, 'https://toss.im/x/abc');
  assert.ok(t.length < 500, `공유 글이 너무 길다(${t.length}자)`);
  assert.match(t, /…/, '잘렸다는 표시가 없다');
  assert.match(t, /https:\/\/toss\.im\/x\/abc/, '잘라내면서 링크까지 날렸다');
});

test('부가 정보가 없는 콘텐츠도 문제없다', () => {
  const t = _resultShareText({ item: { label: '오늘의 타로' }, body: '별 정방향입니다.' }, '');
  assert.match(t, /오늘의 타로/);
  assert.match(t, /별 정방향입니다/);
  assert.doesNotMatch(t, /\n\n/, '빈 줄이 남았다 — 항목이 없을 때 줄을 지워야 한다');
});

test('결과 화면 버튼은 공유하기와 홈으로 둘뿐이다', () => {
  const i = SRC.indexOf('<div class="card reading">');
  const block = SRC.slice(i, i + 400);
  assert.match(block, /id="btn-share"[^>]*>공유하기</, '공유하기 버튼이 없다');
  assert.doesNotMatch(block, /이미지로 저장/, "'이미지로 저장'이 남아 있다");
  assert.doesNotMatch(block, /btn-shareapp/, "결과 화면에 '친구에게 알리기'가 남아 있다");
});
