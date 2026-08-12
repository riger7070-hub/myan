// 미니앱 화면이 없는 이름을 참조하지 않는지.
//
// 실제로 당했다. '공유 보상 제거' 커밋이 `const SHARE_TOKENS` 를 지우면서 결과 화면의
// 버튼에 남은 `${SHARE_TOKENS}` 는 그대로 뒀다. render() 가 ReferenceError 를 던지면
// DOM 은 직전 화면(로딩) 그대로 멈추고, 그 예외는 runItem 의 catch 가 삼킨다 —
// state.screen 은 이미 'result' 라 catch 안의 가드에 걸려 조용히 return 한다.
// 화면에는 아무 에러도 안 뜨고 로딩만 영원히 돈다. "결과가 안 떠요" 신고가 여기서 나왔다.
//
// 번들러도 못 잡는다(전역 변수일 수 있으니 통과시킨다). 그래서 여기서 잡는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'mini', 'src');
const FILES = ['main.js', 'contents.js', 'icons.js'];

// 화면은 전부 템플릿 리터럴로 짓는다. 그래서 `${…}` 안만 본다 — 위험한 곳이 거기고,
// 문자열이나 정규식 리터럴을 코드로 오해할 일도 없다. 중괄호는 짝을 세어 따라간다
// (안에 또 템플릿이 들어가는 경우가 흔하다).
function interpolations(src) {
  const out = [];
  for (let i = 0; i < src.length - 1; i++) {
    if (src[i] !== '$' || src[i + 1] !== '{') continue;
    let depth = 1, j = i + 2;
    for (; j < src.length && depth; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
    }
    out.push(src.slice(i + 2, j - 1));
  }
  return out;
}

for (const file of FILES) {
  test(`${file} — 화면이 선언되지 않은 상수를 참조하지 않는다`, () => {
    const src = readFileSync(join(SRC, file), 'utf8');

    // 이 프로젝트의 모듈 상수는 전부 대문자 스네이크다. 범위를 여기로 좁히면
    // 지역 변수·프로퍼티를 흉내 내는 파서 없이도 확실하게 본다.
    const declared = new Set([
      ...[...src.matchAll(/\b(?:const|let|var|function)\s+([A-Z][A-Z0-9_]{2,})\b/g)].map(m => m[1]),
      // import { A, B } from '…'
      ...[...src.matchAll(/import\s+([\s\S]*?)\s+from/g)].flatMap(m =>
        [...m[1].matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map(x => x[1])),
    ]);
    const globals = new Set(['JSON', 'URL', 'API', 'IAP', 'NaN']);

    // `${/* … */''}` 처럼 주석만 담은 자리가 있다. 주석 속 낱말은 코드가 아니다.
    const used = new Set(interpolations(src)
      .map(code => code.replace(/\/\*[\s\S]*?\*\//g, ' '))
      .flatMap(code =>
        [...code.matchAll(/(?<![.\w$])([A-Z][A-Z0-9_]{2,})\b(?!\s*:)/g)].map(m => m[1])));

    const missing = [...used].filter(n => !declared.has(n) && !globals.has(n));
    assert.deepEqual(missing, [],
      `선언 없이 쓰인 이름: ${missing.join(', ')} — render() 가 ReferenceError 로 죽는다`);
  });
}

test('결과 화면이 지운 공유 보상을 다시 약속하지 않는다', () => {
  // 공유 보상은 없앴다. 문구만 남아 있으면 사용자는 받지도 못할 토큰을 기대한다.
  const main = readFileSync(join(SRC, 'main.js'), 'utf8');
  assert.doesNotMatch(main, /알리고 토큰/, '공유하면 토큰을 준다는 문구가 남아 있다');
});
