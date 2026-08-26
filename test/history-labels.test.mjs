// 지난 기록 목록에 영어 id 가 뜨지 않는지.
//
// 서버는 풀이를 만들 때마다 feature_history 에 이름(feature)을 남기고, 웹은
// FEATURE_META 로 그 이름을 사람이 읽는 말로 바꿔 그린다. 표에 없으면 조용히
// `label: h.feature` 로 떨어지는데 — 오류도 경고도 없이 **"wealth · …" 처럼
// 영어 id 가 그대로 화면에 뜬다.** 실제로 스물아홉 중 열아홉이 그 상태였다.
// 4엽전 주고 본 재물운을 다시 찾을 때 목록에 "wealth" 라고 적혀 있었다.
//
// 콘텐츠를 더할 때 서버만 고치고 여기를 잊는 것이 이 버그의 유일한 원인이라,
// 서버가 남기는 이름 목록과 표를 직접 맞대 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const appSrc = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
const iconsSrc = readFileSync(join(ROOT, 'js', 'icons.js'), 'utf8');

/** 서버가 실제로 남기는 이름들. */
const serverFeatures = [...new Set(
  [...worker.matchAll(/saveFeatureHistory\(env, [^,]+, '([a-z_]+)'/g)].map((m) => m[1]),
)].sort();

/** 웹의 표. 함수 안에 있으므로 소스에서 떼어 읽는다. */
function featureMeta() {
  const at = appSrc.indexOf('const FEATURE_META = {');
  assert.ok(at >= 0, 'js/app.js 에서 FEATURE_META 를 못 찾았다');
  const end = appSrc.indexOf('\n    };', at);
  const block = appSrc.slice(at, end);
  return [...block.matchAll(/^\s{6}(\w+):\s*\{\s*icon:\s*'(\w+)',\s*label:\s*t\.(\w+)\s*\}/gm)]
    .map((m) => ({ feature: m[1], icon: m[2], key: m[3] }));
}

test('서버가 남기는 이름을 실제로 읽었다', () => {
  assert.ok(serverFeatures.length >= 25,
    `${serverFeatures.length}개만 찾았다 — saveFeatureHistory 호출 모양이 바뀌었는지 확인할 것`);
});

test('⚠️ 기록 목록에 영어 id 가 뜨는 콘텐츠가 없다', () => {
  const meta = featureMeta();
  const known = new Set(meta.map((m) => m.feature));
  const missing = serverFeatures.filter((f) => !known.has(f));
  assert.deepEqual(missing, [],
    `이 이름들이 목록에 영어 그대로 뜬다: ${missing.join(', ')} — js/app.js 의 FEATURE_META 에 한 줄씩 더할 것`);
});

test('표의 이름표가 네 언어에 다 있다', () => {
  const anyStub = new Proxy(function () {}, {
    get: (_t, p) => (p === Symbol.toPrimitive || p === 'toString' ? () => '' : anyStub),
    apply: () => anyStub, set: () => true,
  });
  const sandbox = {
    localStorage: anyStub, document: anyStub, window: anyStub, navigator: anyStub, matchMedia: () => anyStub,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    fetch: () => Promise.resolve(anyStub), console, __TX: null,
  };
  const src = ['constants.js', 'locales.js'].map((f) => readFileSync(join(ROOT, 'js', f), 'utf8')).join('\n');
  runInNewContext(`${src}\n; __TX = TX;`, sandbox);
  const TX = sandbox.__TX;
  const gaps = [];
  for (const m of featureMeta()) {
    for (const l of ['ko', 'en', 'zh', 'ja']) if (!TX[l][m.key]) gaps.push(`${l}.${m.key} (${m.feature})`);
  }
  assert.deepEqual(gaps, [], `이름표 번역이 빠졌다: ${gaps.join(', ')}`);
});

test('표가 가리키는 그림이 실제로 있다', () => {
  // 없는 이름을 주면 아이콘 자리가 빈 채로 그려진다 — 오류가 안 나서 눈으로만 보인다.
  const icons = new Set([...iconsSrc.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\s*:\s*S\(/gm)].map((m) => m[1]));
  const gaps = featureMeta().filter((m) => !icons.has(m.icon)).map((m) => `${m.feature}→${m.icon}`);
  assert.deepEqual(gaps, [], `js/icons.js 에 없는 그림을 쓴다: ${gaps.join(', ')}`);
});
