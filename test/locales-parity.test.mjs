// 4개국어(ko/en/zh/ja) 번역 키 정합성 테스트.
//
// 이 서비스는 고객 대면 문자열을 항상 4개국어로 제공한다는 규칙이 있는데, js/locales.js 는
// 언어별로 거대한 객체 4개를 나란히 두는 구조라 새 기능을 넣을 때 ko 만 추가하고 나머지를
// 빠뜨리기 아주 쉽다. 빠지면 그 언어 사용자에겐 `undefined` 가 그대로 화면에 뜬다.
// (실제로 '내 기록' 모달 전체가 한국어로 하드코딩돼 있던 것을 2026-08-08에 발견해 고쳤다.)
//
// 여기서는 "네 언어의 키 집합이 같은가"만 본다 — 번역 품질은 사람이 볼 문제고,
// 키 누락은 기계가 100% 잡을 수 있는 문제라서다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// locales.js 는 constants.js 가 먼저 로드된 걸 전제로 한다(`lang`, `CG_K` 등).
// index.html 의 script 순서를 그대로 재현해야 평가된다.
const src = ['constants.js', 'locales.js']
  .map(f => readFileSync(join(ROOT, 'js', f), 'utf8'))
  .join('\n');

// locales.js 는 브라우저용 클래식 스크립트(모듈이 아님)라 그대로 평가한다.
// 파일 끝에 테마를 적용하는 즉시실행 함수가 있어 localStorage/document 를 건드리므로,
// 어떤 속성 접근·호출에도 자기 자신을 돌려주는 만능 스텁을 넣어준다.
// (값 안의 화살표 함수가 참조하는 CG_K 등은 호출 시점에만 필요해 여기선 문제되지 않는다.)
const anyStub = new Proxy(function () {}, {
  get: (_t, p) => (p === Symbol.toPrimitive || p === 'toString' ? () => '' : anyStub),
  apply: () => anyStub,
  set: () => true,
});

const LANGS = ['ko', 'en', 'zh', 'ja'];
const sandbox = {
  localStorage: anyStub, document: anyStub, window: anyStub, navigator: anyStub,
  // 자정 갱신 타이머 등은 예약만 되고 실행되지 않으면 된다
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  fetch: () => Promise.resolve(anyStub), console,
};
runInNewContext(`${src}\n; __TX = TX;`, sandbox);
const TX = sandbox.__TX;

test('네 언어 블록이 모두 존재한다', () => {
  for (const l of LANGS) assert.ok(TX[l], `TX.${l} 가 없다`);
});

// ko 를 기준으로 삼는다 — 새 문자열은 한국어로 먼저 쓰이기 때문이다.
for (const lang of LANGS.filter(l => l !== 'ko')) {
  test(`${lang} 에 누락된 키가 없다 (ko 기준)`, () => {
    const missing = Object.keys(TX.ko).filter(k => TX[lang][k] === undefined);
    assert.deepEqual(missing, [],
      `${lang} 번역 누락 — 화면에 undefined 가 뜬다:\n  ${missing.join('\n  ')}`);
  });

  test(`${lang} 에 ko 에 없는 잉여 키가 없다`, () => {
    const extra = Object.keys(TX[lang]).filter(k => TX.ko[k] === undefined);
    assert.deepEqual(extra, [],
      `ko 에만 없는 키 — 오타이거나 ko 쪽 누락이다:\n  ${extra.join('\n  ')}`);
  });

  test(`${lang} 의 값 타입이 ko 와 같다`, () => {
    // 함수형 키(예: ilchin, rxlbl)를 한쪽만 문자열로 바꾸면 호출부에서 터진다.
    const mismatched = Object.keys(TX.ko).filter(k =>
      TX[lang][k] !== undefined && typeof TX[lang][k] !== typeof TX.ko[k]);
    assert.deepEqual(mismatched, [], `타입 불일치:\n  ${mismatched.join('\n  ')}`);
  });
}

test('이번에 추가한 내 기록 모달 키가 4개국어에 다 있다', () => {
  const keys = ['histTitle', 'histLoading', 'histEmpty', 'histEmptySub',
                'histFailed', 'histExpand', 'histCollapse', 'histMe', 'histP1', 'histP2'];
  for (const lang of LANGS) {
    for (const k of keys) {
      assert.equal(typeof TX[lang][k], 'string', `TX.${lang}.${k} 가 문자열이 아니다`);
      assert.ok(TX[lang][k].length > 0, `TX.${lang}.${k} 가 비어 있다`);
    }
  }
});
