// 웹의 js/icons.js 가 원본(mini/src/icons.js)과 어긋나지 않는지.
//
// 아이콘을 두 벌 관리하면 반드시 갈라진다. 한쪽만 고치고 다른 쪽을 잊으면
// 미니앱과 웹이 서로 다른 그림을 쓰게 되는데, 화면을 나란히 놓기 전에는 아무도 모른다.
// js/icons.js 는 tools/build-web-icons.mjs 가 만든다 — 원본을 고쳤으면 다시 돌릴 것.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mini = readFileSync(join(ROOT, 'mini', 'src', 'icons.js'), 'utf8');
const web = readFileSync(join(ROOT, 'js', 'icons.js'), 'utf8');

// 이름: 그림 을 뽑아 비교한다. 파일 앞뒤의 주석·export 차이는 무시한다.
function iconMap(src) {
  const body = src.slice(src.indexOf('ICONS = {'));
  const out = new Map();
  for (const m of body.matchAll(/^\s{2}([a-zA-Z][\w]*):\s*S\(`([\s\S]*?)`\)/gm)) {
    out.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  }
  return out;
}

test('웹 아이콘이 원본과 같다', () => {
  const a = iconMap(mini), b = iconMap(web);
  assert.ok(a.size >= 30, `원본 아이콘이 너무 적다(${a.size}) — 뽑는 규칙을 확인할 것`);
  assert.deepEqual([...b.keys()].sort(), [...a.keys()].sort(),
    'js/icons.js 의 아이콘 목록이 다르다 — node tools/build-web-icons.mjs 를 돌릴 것');
  for (const [name, d] of a) {
    assert.equal(b.get(name), d,
      `${name} 의 그림이 다르다 — node tools/build-web-icons.mjs 를 돌릴 것`);
  }
});

test('웹 쪽은 모듈 문법을 쓰지 않는다', () => {
  // index.html 이 <script src> 로 읽는 고전 스크립트다. import/export 가 섞이면
  // 파일 전체가 로드에 실패하고 화면의 아이콘이 전부 사라진다.
  assert.doesNotMatch(web, /^\s*export\s/m, 'export 가 남아 있다');
  assert.doesNotMatch(web, /^\s*import\s/m, 'import 가 남아 있다');
  assert.match(web, /window\.icon\s*=\s*icon/, '전역으로 내보내지 않았다');
});

test('웹 화면이 부르는 아이콘 이름이 실제로 있다', () => {
  const app = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const known = iconMap(web);

  const used = new Set([
    // { icon:'daeun', … } 꼴
    ...[...app.matchAll(/\bicon:\s*'([a-zA-Z][\w]*)'/g)].map(m => m[1]),
    // icon('secAsk') 꼴
    ...[...app.matchAll(/\bicon\('([a-zA-Z][\w]*)'\)/g)].map(m => m[1]),
    // <span data-icon="secGift">
    ...[...html.matchAll(/data-icon="([a-zA-Z][\w]*)"/g)].map(m => m[1]),
  ]);

  const missing = [...used].filter(n => !known.has(n));
  assert.deepEqual(missing, [], `없는 아이콘을 부른다: ${missing.join(', ')}`);
});
