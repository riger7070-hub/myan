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

test('공유에는 언제나 들어올 주소가 붙는다', () => {
  // ⚠️ getTossShareLink 의 path 는 intoss:// 로 시작하는 딥링크여야 한다.
  // '/' 를 넘기고 있었더니 링크가 만들어지지 않아, 주소 없는 글이 나갔다.
  const f = SRC.match(/async function appLink\(\)[\s\S]*?\n\}/);
  assert.ok(f, 'appLink 를 못 찾았다');
  assert.match(SRC, /const APP_DEEPLINK = 'intoss:\/\/\w+'/, '딥링크가 intoss:// 형식이 아니다');
  assert.match(f[0], /getTossShareLink\(APP_DEEPLINK\)/, "여전히 '/' 같은 값을 넘긴다");
  assert.match(f[0], /return WEB_URL/, '링크를 못 만들었을 때 남길 주소가 없다');
  assert.match(SRC, /const WEB_URL = 'https:\/\//, '웹 주소가 없다');

  // 딥링크는 콘솔에 등록한 앱 이름과 같아야 한다.
  const cfg = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'mini', 'apps-in-toss.config.ts'), 'utf8');
  const appName = cfg.match(/appName:\s*'([^']+)'/)[1];
  const deep = SRC.match(/const APP_DEEPLINK = 'intoss:\/\/([^']+)'/)[1];
  assert.equal(deep, appName, `딥링크(${deep})와 앱 이름(${appName})이 다르다`);
});

test('메뉴의 친구에게 알리기에도 주소가 붙는다', () => {
  const f = SRC.match(/async function shareApp\(\)[\s\S]*?\n\}/)[0];
  assert.match(f, /await appLink\(\)/, '주소를 붙이지 않는다');
  assert.match(f, /\$\{link\}/, '만든 주소를 글에 넣지 않는다');
});

test('긴 풀이도 전문을 싣는다', () => {
  // 앞부분만 보내고 "나머지는 앱에서"라고 하면 보낸 사람에게나 맞는 말이다.
  // 받는 사람은 남의 계정 기록을 열 수 없으니, 잘라낸 만큼은 영영 못 본다.
  const 긴것 = { ...배우자궁, body: '가'.repeat(2000) };
  const t = _resultShareText(긴것, 'https://toss.im/x/abc');
  assert.ok(t.includes('가'.repeat(2000)), '풀이가 잘렸다');
  assert.doesNotMatch(t, /…/, '말줄임이 남아 있다 — 더 이상 자르지 않는다');
});

test('앱 링크는 맨 끝에 온다', () => {
  const t = _resultShareText(배우자궁, 'https://toss.im/x/abc');
  assert.ok(t.trimEnd().endsWith('https://toss.im/x/abc'),
    `링크가 끝에 있지 않다:\n${t.slice(-80)}`);
});

test('문단 사이 빈 줄을 살린다', () => {
  // 한 덩어리로 붙으면 메신저에서 읽기 어렵다.
  const t = _resultShareText(배우자궁, '');
  assert.match(t, /앉아 있습니다\.\n\n정재라 하는데/, '문단이 붙어 버렸다');
});

test('부가 정보가 없는 콘텐츠도 문제없다', () => {
  const t = _resultShareText({ item: { label: '오늘의 타로' }, body: '별 정방향입니다.' }, '');
  assert.match(t, /오늘의 타로/);
  assert.match(t, /별 정방향입니다/);
  // 부가 정보가 없다고 빈 자리가 남으면 안 된다(줄이 셋뿐이어야 한다).
  assert.equal(t.split('\n\n').length, 3, `덩어리가 3개가 아니다:\n${t}`);
});

test('결과 화면 버튼은 공유하기와 홈으로 둘뿐이다', () => {
  const i = SRC.indexOf('<div class="card reading">');
  const block = SRC.slice(i, i + 400);
  assert.match(block, /id="btn-share"[^>]*>공유하기</, '공유하기 버튼이 없다');
  assert.doesNotMatch(block, /이미지로 저장/, "'이미지로 저장'이 남아 있다");
  assert.doesNotMatch(block, /btn-shareapp/, "결과 화면에 '친구에게 알리기'가 남아 있다");
});
