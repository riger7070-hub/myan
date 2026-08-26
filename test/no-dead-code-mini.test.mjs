// 미니앱에도 죽은 코드가 다시 쌓이지 않게 막는다.
//
// 웹(test/no-dead-code.test.mjs)과 나눠 둔 이유: 미니앱은 ES 모듈이라 죽는 모양이
// 다르다. 전역에 쏟아 놓는 대신 import/export 로 주고받으니, 내보내 놓고 아무도
// 안 가져가거나 가져와 놓고 안 쓰는 자리가 생긴다. 안 쓰는 import 는 오류가 안 나고
// 번들에는 그대로 실린다.
//
// 실제로 이렇게 있었다 —
//   · ALL_ITEMS 를 가져와 놓고 한 번도 안 썼다
//   · search·camera 아이콘을 아무도 안 그렸다

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMiniDead } from '../tools/find-dead-mini.mjs';

const dead = findMiniDead();

test('⚠️ 내보내 놓고 아무도 안 가져가는 것이 없다', () => {
  assert.deepEqual(dead.exports, [], '안 쓰는 export:\n  ' + dead.exports.join('\n  '));
});

test('⚠️ 가져와 놓고 안 쓰는 것이 없다', () => {
  // 번들에 그대로 실린다. 오류가 안 나서 눈으로는 못 찾는다.
  assert.deepEqual(dead.imports, [], '안 쓰는 import:\n  ' + dead.imports.join('\n  '));
});

test('⚠️ 아무 데서도 안 부르는 함수가 없다', () => {
  assert.deepEqual(dead.funcs, [], '안 부르는 함수:\n  ' + dead.funcs.join('\n  '));
});

test('⚠️ 아무 데서도 안 그리는 아이콘이 없다', () => {
  // ⚠️ 이 검사는 **저장소 전체**를 본다. mini/src/icons.js 가 원본이고 웹의
  //    js/icons.js 가 tools/build-web-icons.mjs 로 여기서 만들어지기 때문이다.
  //    미니앱 안에서만 세면 웹이 쓰는 아이콘 아홉 개가 죽었다고 나온다 —
  //    그 말을 믿고 지웠으면 웹이 깨졌다.
  assert.deepEqual(dead.icons, [], '안 그리는 아이콘: ' + dead.icons.join(' '));
});
