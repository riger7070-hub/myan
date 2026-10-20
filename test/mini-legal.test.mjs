// 미니앱 약관·방침에 **구글 로그인 이야기가 없는지.**
//
// ⚠️ 2026-10-14 와 10-20, **두 번 연속** 같은 사유로 반려됐다 —
//    "토스 로그인 외에 별도의 자체 로그인 기능을 제공할 수 없어요."
//
//    앱 코드에는 토스 로그인뿐이라 한참 못 찾았다. 범인은 **모든 화면 아래의
//    「이용약관 · 개인정보처리방침」 링크**였다. 그게 웹 서비스 문서로 나가는데
//    그 문서가 이렇게 말하고 있었다 —
//
//      "본 서비스는 Google 소셜 로그인을 통해 가입 및 이용이 가능합니다."
//      "Google 로그인 시 수집:"
//      "Google LLC — 소셜 로그인 인증 (미국)"
//
//    심사자가 눌러 보면 **구글 로그인을 제공하는 서비스**로 읽힌다.
//    앱에는 없는데 **문서가 있다고 말하고 있었다.**
//
// ⚠️ 본문은 두 벌로 베끼지 않는다 — 베끼면 한쪽만 고치는 날이 반드시 온다.
//    웹 문서를 그대로 쓰되 로그인 대목만 바꾼다(MINI_LEGAL_SWAPS).
//    **그 짝의 왼쪽 글이 문서에서 사라지면 바꿔치기가 조용히 멈춘다.**
//    그러면 구글 이야기가 그대로 심사자에게 간다. 그걸 여기서 잡는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../mini/src/main.js', import.meta.url), 'utf8');

/** MINI_LEGAL_SWAPS 의 짝들. */
const 짝들 = (() => {
  const i = worker.indexOf('const MINI_LEGAL_SWAPS = [');
  assert.notEqual(i, -1, 'MINI_LEGAL_SWAPS 가 없다');
  const 블록 = worker.slice(i, worker.indexOf('\n];', i));
  const 글 = [...블록.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  assert.ok(글.length >= 6 &&글.length % 2 === 0, `짝이 홀수다: ${글.length}`);
  return 글.reduce((a, _, k) => (k % 2 ? a : [...a, [글[k], 글[k + 1]]]), []);
})();

/** 웹 문서 본문(두 handler 를 합쳐 본다). */
const 웹문서 = (() => {
  const 조각 = [];
  for (const 이름 of ['function handlePrivacyPage()', 'function handleTermsPage()']) {
    const i = worker.indexOf(이름);
    assert.notEqual(i, -1, `${이름} 이 없다`);
    조각.push(worker.slice(i, i + 12000));
  }
  return 조각.join('\n');
})();

test('미니앱 전용 약관·방침 길이 있다', () => {
  assert.match(worker, /path === '\/mini\/terms'/, '미니앱 약관 길이 없다');
  assert.match(worker, /path === '\/mini\/privacy-policy'/, '미니앱 방침 길이 없다');
});

test('앱이 그 길을 쓴다', () => {
  // ⚠️ 길만 만들고 앱이 옛 주소를 가리키면 아무것도 안 바뀐다. 두 번 반려된 자리다.
  const i = main.indexOf('const FOOTER');
  assert.notEqual(i, -1, 'FOOTER 가 없다');
  const f = main.slice(i, i + 500);
  assert.match(f, /\/mini\/terms/, '약관이 웹 문서를 가리킨다');
  assert.match(f, /\/mini\/privacy-policy/, '방침이 웹 문서를 가리킨다');
  assert.ok(!/\$\{API\}\/terms|\$\{API\}\/privacy-policy/.test(f), '옛 주소가 남아 있다');
});

test('바꿀 대목이 웹 문서에 실제로 있다', () => {
  // ⚠️ 이게 이 파일의 핵심이다. 웹 문서를 손보면서 이 글을 바꾸면 바꿔치기가
  //    조용히 멈추고, 구글 이야기가 그대로 심사자에게 간다.
  for (const [찾을것] of 짝들) {
    assert.ok(웹문서.includes(찾을것),
      `웹 문서에서 사라졌다 — 바꿔치기가 멈춘다: "${찾을것.slice(0, 45)}…"`);
  }
});

test('바꾼 뒤에는 구글 로그인 이야기가 없다', () => {
  let 바뀐것 = 웹문서;
  for (const [a, b] of 짝들) 바뀐것 = 바뀐것.split(a).join(b);

  // Gemini API·호스팅 같은 구글 언급은 사실이라 그대로 둔다.
  // 막아야 하는 것은 **로그인**에 관한 것뿐이다.
  const 걸린것 = [...바뀐것.matchAll(/[^\n]{0,60}Google[^\n]{0,60}/g)]
    .map((m) => m[0])
    .filter((줄) => /로그인|소셜|가입/.test(줄));
  assert.deepEqual(걸린것, [],
    '구글 로그인 이야기가 남았다:\n  ' + 걸린것.join('\n  '));
});

test('바꾼 글이 토스 로그인을 말한다', () => {
  for (const [, 바꿀것] of 짝들) {
    assert.ok(!/Google|구글/.test(바꿀것), `바꿔 넣는 글에 구글이 있다: ${바꿀것.slice(0, 40)}`);
  }
  assert.ok(짝들.some(([, b]) => /토스/.test(b)), '토스 로그인이라고 말하지 않는다');
});

test('못 찾아도 약관 페이지가 죽지는 않는다', () => {
  // 약관이 500 이면 그것대로 반려 사유다. 크게 남기되 서비스는 계속한다.
  const i = worker.indexOf('function miniLegalHtml(');
  assert.notEqual(i, -1, 'miniLegalHtml 이 없다');
  const f = worker.slice(i, worker.indexOf('\n}', i));
  assert.match(f, /console\.error/, '못 찾은 것을 안 남긴다');
  assert.ok(!/throw /.test(f), '못 찾으면 페이지를 죽인다');
});
