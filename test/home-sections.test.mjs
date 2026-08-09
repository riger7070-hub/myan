// 홈 화면의 콘텐츠 타일이 실제로 눌리는지.
//
// _homeSections() 는 각 타일의 동작을 `fn:'openXxx()'` 라는 문자열로 들고 있다가
// onclick 에 그대로 박는다. 문자열이라 이름을 잘못 적어도 어디서도 터지지 않고,
// 배포된 뒤 사용자가 눌렀을 때 콘솔에서만 조용히 실패한다. 라벨도 마찬가지로
// `t.someKey` 를 참조하는데 그 키가 없으면 화면에 undefined 가 뜬다.
//
// 콘텐츠가 늘고 묶음을 다시 나눌 때 가장 깨지기 쉬운 자리라 여기서 붙잡는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');

// _homeSections() 본문만 떼어낸다 — app.js 전체를 평가할 수는 없다(브라우저 전역 투성이).
const body = appSrc.match(/function _homeSections\(\) \{[\s\S]*?\n\}/);
assert.ok(body, '_homeSections 를 찾지 못했다 — 함수 이름이 바뀌었는지 확인할 것');

// t.someKey 를 그대로 돌려주는 스텁으로 평가하면 어떤 키를 참조하는지 그대로 드러난다.
const usedKeys = new Set();
const tStub = new Proxy({}, { get: (_o, p) => { usedKeys.add(String(p)); return undefined; } });
const sections = runInNewContext(
  `${body[0]}\n; __out = _homeSections();`,
  { getT: () => tStub, __out: null },
  { timeout: 2000 },
) ?? runInNewContext(`${body[0]}\n_homeSections()`, { getT: () => tStub });

// locales.js 의 ko 블록 (번역 4개국어 대조는 locales-parity 가 따로 본다)
const localesSrc = ['constants.js', 'locales.js']
  .map(f => readFileSync(join(ROOT, 'js', f), 'utf8')).join('\n');
const anyStub = new Proxy(function () {}, {
  get: (_t, p) => (p === Symbol.toPrimitive || p === 'toString' ? () => '' : anyStub),
  apply: () => anyStub, set: () => true,
});
const sandbox = {
  localStorage: anyStub, document: anyStub, window: anyStub, navigator: anyStub,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  fetch: () => Promise.resolve(anyStub), console, __TX: null,
};
runInNewContext(`${localesSrc}\n; __TX = TX;`, sandbox);
const ko = sandbox.__TX.ko;

test('모든 타일이 실제로 존재하는 함수를 부른다', () => {
  const calls = sections.flatMap(s => s.items.map(i => i.fn));
  assert.ok(calls.length >= 15, `타일이 너무 적다(${calls.length})`);

  for (const call of calls) {
    const m = call.match(/^(\w+)\(\)$/);
    assert.ok(m, `호출 형태가 아니다: ${call}`);
    assert.match(appSrc, new RegExp(`function ${m[1]}\\s*\\(`),
      `${call} 에 해당하는 함수가 app.js 에 없다 — 누르면 아무 일도 안 일어난다`);
  }
});

test('타일이 참조하는 번역 키가 모두 있다', () => {
  assert.ok(usedKeys.size > 0, '번역 키를 하나도 참조하지 않는다 — 스텁이 동작하지 않았다');
  for (const key of usedKeys) {
    assert.ok(key in ko, `번역 키가 없다: ${key} (화면에 undefined 가 뜬다)`);
  }
});

test('같은 콘텐츠가 두 칸에 중복해서 놓이지 않는다', () => {
  const calls = sections.flatMap(s => s.items.map(i => i.fn));
  assert.equal(new Set(calls).size, calls.length,
    `중복된 타일이 있다: ${calls.filter((c, i) => calls.indexOf(c) !== i).join(', ')}`);
});

test('묶음이 한쪽으로 몰리지 않는다', () => {
  // 계열이 아니라 목적으로 나눈 이유가 이것이다 — 한 칸이 비대해지면 다시 나눌 때가 된 것.
  assert.ok(sections.length >= 3, '묶음이 너무 적다');
  for (const s of sections) {
    assert.ok(s.items.length >= 2, `${s.title}: 타일이 2개 미만이면 묶음이 될 이유가 없다`);
    assert.ok(s.items.length <= 7, `${s.title}: ${s.items.length}개는 한 칸에 너무 많다 — 다시 나눌 것`);
  }
});

test('토큰 비용이 타일마다 붙어 있다', () => {
  // 누르기 전에 값을 알 수 있어야 한다. 무료(0)는 있어도 되지만 undefined 는 안 된다.
  for (const s of sections) {
    for (const i of s.items) {
      assert.equal(typeof i.cost, 'number', `${i.fn}: 비용이 숫자가 아니다`);
      assert.ok(i.cost >= 0 && i.cost <= 5, `${i.fn}: 비용이 ${i.cost} 다`);
    }
  }
});
