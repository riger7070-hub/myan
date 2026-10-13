// 최초 화면에서 뒤로가기를 누르면 **앱이 닫히는지.**
//
// ⚠️ 이 파일은 2026-10-14 에 **뜻이 뒤집혔다.**
//
//    원래는 「닫기 전에 한 번 물어본다」를 지키는 시험이었다. 홈에서 뒤로가기를
//    잘못 눌러 앱이 사라지는 게 아까워서 「오늘운빨을 닫을까요?」를 띄웠다.
//    사용자를 생각한 선택이었지만 **심사에서 반려됐다** —
//
//      "최초 화면에서 내비게이션 바의 뒤로가기 클릭 시 미니앱이 종료되지
//       않아요. 최초 화면에서 내비게이션 바 뒤로가기 클릭 시 미니앱이
//       종료되도록 구현해 주세요."
//
//    비게임 출시 가이드라인에도 "초기 화면 뒤로가기는 미니앱을 종료한다" 로
//    못 박혀 있다. 토스 안에서는 **뒤로가기가 곧 나가기**이고, 그게 사람들이
//    토스의 다른 모든 미니앱에서 익힌 동작이다. 우리만 다르게 굴 자리가 아니다.
//
//    ⚠️ 「물어보는 게 친절하다」는 생각으로 되돌리지 말 것. 친절한 쪽이 아니라
//       **규정을 지키는 쪽**이 맞는 자리다. 되돌리면 또 반려된다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'mini', 'src', 'main.js'), 'utf8');

const fnOf = (name) => {
  const i = SRC.indexOf(`function ${name}(`);
  assert.ok(i > 0, `${name} 을 못 찾았다`);
  return SRC.slice(i, SRC.indexOf('\n}', i) + 2);
};

/** 주석을 걷는다 — 왜 바꿨는지를 주석에 적어 두므로 그걸 코드로 세면 안 된다. */
const 코드만 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('돌아갈 곳이 없으면 곧장 닫는다', () => {
  const f = 코드만(fnOf('goBack'));
  assert.match(f, /closeApp\(\)/, '마지막에 앱을 닫지 않는다 — 심사 반려 사유다');
  assert.ok(!/confirmExit/.test(f), '아직 나가기 전에 물어본다');
});

test('닫는 함수가 실제로 닫는다', () => {
  // ⚠️ SDK 함수 **이름**을 못 박지 않는다. 이름이 바뀌면 시험이 옛 이름을 지키는
  //    꼴이 된다. 실제로 공유 쪽이 그랬다 — 시험이 낡은 getTossShareLink 를
  //    붙들고 있어서 고장 난 코드가 초록불로 남아 있었다.
  assert.match(fnOf('closeApp'), /(Screen\.close|closeView)\(\)/, '닫는 함수가 실제로 닫지 않는다');
});

test('나가기를 묻는 칸이 남아 있지 않다', () => {
  // 남겨 두면 영영 안 뜨는 죽은 칸이고, 되살리기도 쉬워진다.
  assert.ok(!SRC.includes('confirmExit'), 'confirmExit 이 아직 코드에 있다');
  assert.ok(!SRC.includes('btn-exit-yes'), '나가기 확인 단추가 아직 있다');
  assert.ok(!SRC.includes('btn-exit-no'), '「더 볼래요」 단추가 아직 있다');
});

test('뒤로가기는 덮인 것부터 걷는다', () => {
  // 메뉴나 광고 물음이 떠 있으면 그것부터 닫는다. 그건 「최초 화면」이 아니다.
  const f = 코드만(fnOf('goBack'));
  assert.match(f, /if \(state\.menu\)/, '메뉴가 열려 있어도 앱을 닫아 버린다');
  assert.ok(f.indexOf('state.menu') < f.indexOf('closeApp()'), '메뉴를 걷기 전에 앱을 닫는다');
});

test('뒤로가기가 네이티브에 이어져 있다', () => {
  // 이게 없으면 토스 바의 뒤로가기가 goBack 까지 못 온다.
  assert.match(SRC, /graniteEvent\.addEventListener\('backEvent'/, '뒤로가기 구독이 없다');
  assert.match(SRC, /onEvent: \(\) => goBack\(\)/, '뒤로가기가 goBack 으로 안 간다');
});
