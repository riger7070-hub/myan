// ilchin() 중복 구현 동기화 테스트.
//
// 오늘의 일진(日辰)은 worker.js 와 js/constants.js 에 **똑같은 코드로 복붙**돼 있다.
// 백엔드는 이걸로 리딩을 만들고 프런트는 같은 값을 화면에 띄우므로, 한쪽만 고치면
// 화면에 뜬 오늘의 기운과 AI 가 실제로 참고한 기운이 서로 다른 말을 하게 된다.
// CLAUDE.md 도 "한쪽을 바꾸면 반드시 다른 쪽도 바꾸라"고 명시한 지점이다.
//
// 실패했다면 두 파일의 ilchin() 또는 오행 상수가 갈라진 것이다. 한쪽에 맞춰 나머지를 고칠 것.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const worker    = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const constants = readFileSync(join(ROOT, 'js', 'constants.js'), 'utf8');

/** 소스에서 특정 최상위 함수 본문을 통째로 뽑아 공백 차이를 지운다. */
function extractFn(src, name, label) {
  const m = src.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(m, `${label} 에서 ${name}() 를 찾지 못했다 — 이름이 바뀌었는지 확인할 것`);
  return m[0].replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

/** `const NAME = [...]` 한 줄을 뽑아 공백을 지운다. */
function extractConst(src, name, label) {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[[^\\]]*\\]`));
  assert.ok(m, `${label} 에서 ${name} 를 찾지 못했다`);
  return m[0].replace(/\s+/g, '');
}

test('ilchin() 이 worker.js 와 js/constants.js 에서 동일하다', () => {
  assert.equal(
    extractFn(worker, 'ilchin', 'worker.js'),
    extractFn(constants, 'ilchin', 'js/constants.js'),
    'ilchin() 구현이 갈라졌다 — 클라이언트가 표시하는 오늘의 기운과 백엔드가 리딩에 쓴 기운이 달라진다'
  );
});

// ilchin() 의 반환값은 CGO/JJO 인덱싱 결과라, 함수가 같아도 이 표가 다르면 결과가 갈라진다.
for (const name of ['CG', 'JJ', 'CGO', 'JJO']) {
  test(`오행 상수 ${name} 이 두 파일에서 동일하다`, () => {
    assert.equal(
      extractConst(worker, name, 'worker.js'),
      extractConst(constants, name, 'js/constants.js'),
      `${name} 이 갈라졌다`
    );
  });
}
