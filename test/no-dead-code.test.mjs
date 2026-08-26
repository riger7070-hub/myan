// 죽은 코드가 다시 쌓이지 않게 막는다.
//
// 한 번 걷어내도 몇 달 지나면 또 는다. 기능을 옮기고 옛 껍데기를 남기거나,
// 화면에서 버튼만 떼고 함수는 두는 식이다. 사람이 알아채기 어려우니 여기서 잡는다.
//
// 실제로 이렇게 쌓여 있었다(251줄) —
//   · notifications.js 로 옮긴 뒤 남은 래퍼 둘
//   · 홈 화면이 대신하게 된 뒤 남은 openExperienceHub 삼형제
//   · _sipsin() 엔진이 대신하게 된 뒤 남은 _SIPSEONG 표
//   · 보는 화면이 죽어서 **쓰기만 하고 아무도 안 읽던** localStorage 자리
//
// 새로 걸리면 둘 중 하나다. 지우거나, 정말 남겨야 하면 아래 ALLOW 에 이유와 함께 적는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDead, findShadowed } from '../tools/find-dead.mjs';

// 안 쓰이는 것이 정상인 이름. 반드시 이유를 적는다.
const ALLOW = new Map([
  // 예: ['handleFoo', '토스 심사용으로 남겨 둔 자리. 2026-12 이후 지운다'],
]);

test('⚠️ 선언해 놓고 아무 데서도 안 쓰는 것이 없다', () => {
  const { files, dead } = findDead();
  assert.ok(files > 50, `훑은 파일이 ${files}개뿐이다 — 탐지기가 폴더를 못 찾고 있다`);

  const left = dead.filter((d) => !ALLOW.has(d.name));
  assert.deepEqual(left, [],
    '죽은 선언:\n' + left.map((d) => `  ${d.file}:${d.line}  ${d.name}`).join('\n'));
});

test('⚠️ 나중에 실리는 파일이 앞의 전역을 덮지 않는다', () => {
  // index.html 이 <script> 를 줄줄이 싣는데 전역은 한 그릇이다. 같은 이름을 두 번
  // 선언하면 뒤엣것이 앞엣것을 **조용히** 덮는다 — 오류도 경고도 없다.
  // requestNotificationPermission 이 실제로 그랬다: notifications.js 의 진짜 함수를
  // app.js 에 남아 있던 껍데기가 덮고 있었다.
  const dup = findShadowed();
  assert.deepEqual(dup, [],
    '겹치는 전역:\n' + dup.map((d) => `  ${d.name}: ${d.at.join(' → ')}`).join('\n'));
});
