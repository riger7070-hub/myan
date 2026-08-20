// CSS 가 통째로 죽지 않았는지.
//
// 중괄호 하나가 남으면 그 뒤의 규칙이 전부 무시된다. 그런데 화면은 그냥
// "좀 이상하게" 보일 뿐이라 눈으로는 잘 안 잡힌다 — 실제로 여는 화면을 고치다가
// 짝 안 맞는 } 를 하나 남겼고, 그 아래 있던 .gate 규칙이 통째로 사라져
// 문짝이 화면 절반을 덮었다.
//
// 브라우저는 조용히 넘어가므로 여기서 잡는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['mini/src/style.css', 'css/style.css'];

/** 주석을 지운 본문.
 *  ⚠️ 줄 수는 그대로 둔다 — 주석을 통째로 지우면 줄이 당겨져서
 *     "몇 번째 줄이 잘못됐다"가 엉뚱한 곳을 가리킨다(실제로 그랬다). */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g,
  (m) => m.replace(/[^\n]/g, ' '));

for (const rel of FILES) {
  const css = readFileSync(join(ROOT, rel), 'utf8');

  test(`${rel} — 중괄호 짝이 맞는다`, () => {
    const body = strip(css);
    let depth = 0, line = 1, firstBad = null;
    for (const ch of body) {
      if (ch === '\n') line++;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth < 0 && firstBad === null) firstBad = line; }
    }
    assert.equal(firstBad, null, `${firstBad}번째 줄에서 } 가 먼저 나온다 — 그 뒤 규칙이 다 죽는다`);
    assert.equal(depth, 0, `여닫는 괄호가 ${depth}개 어긋난다`);
  });

  test(`${rel} — 선택자 없이 떠 있는 블록이 없다`, () => {
    // 깊이 0 에서 시작한 줄이 '}' 하나로만 되어 있으면 잘라 붙이다 남긴 괄호다.
    // @media·@keyframes 안쪽은 깊이가 1 이상이라 걸리지 않는다.
    const bad = [];
    let depth = 0;
    strip(css).split('\n').forEach((l, i) => {
      const before = depth;
      for (const ch of l) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      if (before === 0 && l.trim() === '}') bad.push(i + 1);
    });
    assert.deepEqual(bad, [], `선택자 없이 닫히는 줄: ${bad.join(', ')}번째 줄`);
  });
}

test('여는 화면의 뼈대 규칙이 살아 있다', () => {
  // 위 검사가 잡아 주긴 하지만, 이 규칙들이 사라지면 화면이 대놓고 무너지므로
  // 이름으로 한 번 더 확인해 둔다.
  const css = readFileSync(join(ROOT, 'mini/src/style.css'), 'utf8');
  for (const sel of ['.splash', '.gate', '.door', '.moon', '.sky']) {
    assert.ok(new RegExp('^\\' + sel + '\\s*\\{', 'm').test(css), `${sel} 규칙이 없다`);
  }
  // .gate 는 문짝의 기준점이다. position 이 빠지면 문이 화면 전체로 퍼진다.
  const gate = css.slice(css.indexOf('.gate {'));
  assert.match(gate.slice(0, gate.indexOf('}')), /position:\s*relative/,
    '.gate 에 position 이 없다 — 문짝이 화면 전체를 덮는다');
});
