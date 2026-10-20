// 비게임 미니앱 **출시 가이드라인**을 코드로 못 박는다.
//
// ⚠️ 2026-09-30 부터 한 달 동안 토스가 운영 중인 비게임 미니앱을 전수 점검한다.
//    전에는 "일부 기준을 유연하게" 적용했는데 이제 일괄이다. 결과를 받고
//    **14일 안에 못 고치면 미노출**된다(승인되면 자동 재노출).
//
// 여기 걸린 셋은 2026-09-10 에 실제로 걸릴 상태였던 것들이다. 되돌아오면
// 아무 시험도 안 깨지고 **점검에서 앱이 내려간 뒤에** 알게 된다.
//
// 출처: developers-apps-in-toss.toss.im/checklist/app-nongame.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../mini/src/main.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../mini/apps-in-toss.config.ts', import.meta.url), 'utf8');

/**
 * 함수 하나의 몸통을 잘라 낸다.
 *
 * ⚠️ 앞뒤 표시를 손으로 짚어 slice 하지 말 것. 처음에 그렇게 썼다가 **뒤 표시가
 *    앞 표시보다 위에 있어서**(MENU_ITEMS 가 header 보다 먼저였다) 빈 문자열을
 *    잘랐고, 시험 둘이 **아무것도 안 재고 통과했다.** 중괄호를 세어 끝을 찾는다.
 */
function 몸통(글, 머리) {
  const i = 글.indexOf(머리);
  assert.notEqual(i, -1, `${머리} 를 못 찾았다`);

  // ⚠️ 첫 `{` 를 몸통의 시작으로 삼으면 안 된다. 매개변수에도 중괄호가 있다 —
  //    `doCheckin({ quiet = false } = {})` 의 첫 `{` 를 잡는 바람에 몸통을
  //    42글자만 잘라 왔고, 시험이 아무것도 못 재고 헛돌았다.
  //    괄호가 다 닫힌 뒤에 나오는 `{` 가 진짜 몸통이다.
  let 괄호 = 0;
  let 시작 = -1;
  for (let k = i; k < 글.length; k++) {
    const c = 글[k];
    if (c === '(') 괄호++;
    else if (c === ')') 괄호--;
    else if (c === '{' && 괄호 === 0) { 시작 = k; break; }
  }
  assert.notEqual(시작, -1, `${머리} 의 몸통을 못 찾았다`);

  let 깊이 = 0;
  for (let k = 시작; k < 글.length; k++) {
    if (글[k] === '{') 깊이++;
    else if (글[k] === '}' && --깊이 === 0) return 글.slice(i, k + 1);
  }
  throw new Error(`${머리} 의 끝을 못 찾았다`);
}

/**
 * 주석을 걷어 낸다.
 *
 * ⚠️ 주석에 적힌 이름을 호출로 세면 안 된다. "askNotify 참고" 라고 적어 둔
 *    주석 때문에 「부르지 않는다」 시험이 빨개졌다 — 코드는 멀쩡했는데.
 */
const 코드만 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── ① 자체 뒤로가기 버튼 ─────────────────────────────────────
//
// 가이드라인: "토스 뒤로가기 버튼과 자체 구현 뒤로가기 버튼이 동시에 표시되지
// 않는다". 토스가 흔한 위반 1번으로 꼽았다. 우리는 토스 기본 네비게이션 바를
// 쓰므로(설정에 navigationBar 가 없다) 자체 뒤로가기를 그리면 곧바로 겹친다.
const 헤더 = 몸통(main, 'function header()');

test('헤더에 자체 뒤로가기 버튼이 없다', () => {
  // ⚠️ 주석을 걷고 본다. 왜 뺐는지를 주석에 적어 두었는데(그 안에 「뒤로」가
  //    들어 있다) 그걸 코드로 세면 고쳐 놓고도 빨개진다.
  const h = 코드만(헤더);
  assert.ok(!h.includes('tb-back'), '자체 뒤로가기 버튼(.tb-back)이 살아 있다');
  assert.ok(!/aria-label="뒤로"/.test(h), '「뒤로」라고 이름 붙은 단추가 있다');
  assert.ok(!h.includes('‹'), '뒤로가기처럼 보이는 ‹ 가 남아 있다');
});

// ⚠️ 2026-09-10 에는 「그 자리는 홈 버튼이다」를 지켰다. `‹` 를 집 모양으로
//    바꾸면 된다고 읽었기 때문이다. **모자랐다.** 2026-10-14 심사가 이렇게 왔다 —
//    "내비게이션 바의 뒤로가기 버튼과 **미니앱 자체 헤더 및** 뒤로가기 버튼이
//     함께 노출돼요." 지적받은 것은 단추 하나가 아니라 **머리줄 전체**였다.
//    제목(MY;安)까지 토스 바와 겹쳐 있었다. 이제 제목줄을 통째로 안 그린다.

test('자체 제목줄을 그리지 않는다', () => {
  const h = 코드만(헤더);
  assert.ok(!h.includes('tb-title'), '앱 이름을 또 그린다 — 토스 바에 이미 있다');
  assert.ok(!h.includes('class="topbar"'), '제목줄이 아직 있다');
  assert.ok(!h.includes('btn-home'), '홈 버튼이 아직 있다 — 머리줄을 통째로 뺐다');
});

// ⚠️ 2026-10-14 에는 「제목줄만 빼면 된다」고 읽고 엽전·메뉴 줄은 맨 위에 남겼다.
//    **모자랐다.** 10-20 에 같은 사유로 또 반려됐다 — 남은 줄이 여전히 웹뷰 맨 위,
//    토스 바 바로 아래에 있어서 그대로 머리줄로 읽혔다.
//    걸린 것은 **자리**였지 안에 무엇이 들었느냐가 아니었다.

test('화면 맨 위에 아무것도 그리지 않는다', () => {
  const h = 코드만(헤더);
  assert.ok(!h.includes('tokenbar'), '엽전 줄이 아직 맨 위에 있다');
  assert.ok(!h.includes('btn-menu'), '메뉴 단추가 아직 맨 위에 있다');
  assert.match(h, /return '';/, "header() 가 빈 글자를 돌려주지 않는다");
});

test('엽전·메뉴는 홈 본문 안에 있다', () => {
  // 없애는 게 아니라 자리를 옮기는 것이다. 홈 본문 안이면 머리줄이 아니다.
  const t = 코드만(몸통(main, 'function toolRow()'));
  assert.match(t, /class="tokenbar"/, '엽전 줄이 없다');
  assert.match(t, /id="btn-menu"/, '메뉴로 들어갈 길이 없다');

  const i = main.indexOf("case 'home': {");
  const home = main.slice(i, i + 2000);
  assert.match(home, /\$\{toolRow\(\)\}/, '홈 본문에 그 줄을 안 그린다');
  // ⚠️ 맨 위가 아니어야 한다 — 히어로와 순위 뒤에 와야 본문으로 읽힌다.
  assert.ok(home.indexOf('ttiCard()') < home.indexOf('toolRow()'),
    '엽전 줄이 순위보다 위에 있다 — 또 머리줄로 읽힌다');
});

test('뒤로가기는 토스와 안드로이드에 맡긴다', () => {
  // 자체 단추를 뺐으니 이쪽이 살아 있어야 뒤로가기가 아예 없어지지 않는다.
  assert.match(main, /graniteEvent\.addEventListener\('backEvent'/, '뒤로가기 구독이 없다');
  assert.match(main, /function goBack\(\)/, 'goBack 이 없다');
});

test('토스 기본 네비게이션 바를 쓴다', () => {
  // 가이드라인: "토스 네비게이션 바를 사용한다". 직접 감추면 위 시험의 전제가
  // 무너지므로, 감추기 시작하면 여기서 걸려 다시 판단하게 된다.
  assert.ok(!/navigationBar/i.test(config),
    'apps-in-toss.config.ts 가 네비게이션 바를 손대기 시작했다 — 뒤로가기 규칙을 다시 볼 것');
});

// ── ② 진입 시 자동으로 뜨는 하단 시트 ────────────────────────
//
// 가이드라인: "진입 시 자동으로 하단 시트(토스 로그인, 알림 동의)가 뜨지 않는다".
// 2026-09-02 에 boot 에서 askNotify() 를 불렀다가 09-10 에 뺐다.
test('알림 동의를 부르는 자리는 단추 하나뿐이다', () => {
  // ⚠️ 진입 지점을 하나씩 짚어 「여기서는 안 부른다」를 세지 말 것. 처음에
  //    boot() 만 봤는데 정작 앱을 켤 때 도는 자리는 saveProfile() 안이었고,
  //    **미끼를 넣어도 시험이 통과했다.** 부르는 자리를 통째로 세는 편이 낫다 —
  //    새 길이 생겨도 자동으로 걸린다.
  const 코드 = 코드만(main);
  const 부름 = [...코드.matchAll(/askNotify\(\)/g)].length;
  const 정의 = [...코드.matchAll(/function askNotify\(\)/g)].length;
  assert.equal(정의, 1, 'askNotify 정의가 하나가 아니다');
  assert.equal(부름 - 정의, 1,
    `askNotify 를 부르는 자리가 ${부름 - 정의}군데다 — 단추 하나여야 한다`
    + ' (앱을 켤 때 부르면 진입하자마자 하단 시트가 뜬다)');
});

test('그 하나가 단추 손잡이다', () => {
  const 코드 = 코드만(main);
  const i = 코드.indexOf("on('btn-notify'");
  assert.notEqual(i, -1, '알림 단추 손잡이가 없다');
  // 손잡이 한 줄 안에서 부른다. 다른 데서 부르면 위 시험이 2군데로 세어 잡는다.
  assert.match(코드.slice(i, i + 120), /askNotify\(\)/,
    '단추를 눌러도 동의를 안 묻는다');
});

test('도장을 저절로 찍는 길에서는 묻지 않는다', () => {
  // 이 길은 앱을 켤 때 돈다. 여기서 부르면 진입 시 하단 시트가 뜬다.
  const f = 코드만(몸통(main, 'async function doCheckin('));
  const quiet = f.slice(f.indexOf('if (quiet)'), f.indexOf('await withBusy'));
  assert.ok(quiet.length > 20, 'quiet 대목을 못 잡았다 — 시험이 헛돈다');
  assert.ok(!quiet.includes('askNotify'), 'quiet 길에서 알림 동의를 부른다');
});

test('알림 동의는 사용자가 누를 때만 묻는다', () => {
  assert.match(main, /on\('btn-notify'/, '알림 줄을 누르는 자리가 없다');
  assert.ok(main.includes('function notifyRow()'), '누를 줄 자체가 없다');
});

test('알림 줄을 내놓는 조건과 묻는 조건이 같다', () => {
  // ⚠️ 둘이 갈리면 안 보이는 줄을 누르거나, 보이는데 안 물어보는 일이 생긴다.
  //    한 함수에서 갈라져야 한다.
  assert.ok(main.includes('function notifyOffered()'), '조건이 한자리에 없다');
  const ask = 몸통(main, 'function askNotify()');
  assert.match(ask, /if \(!notifyOffered\(\)\) return/, 'askNotify 가 제 조건을 따로 센다');
});

// ── ③ 결제 내역 ─────────────────────────────────────────────
//
// 가이드라인: "구매한 인앱 상품에 대한 결제 내역을 확인할 수 있다".
// 「지난 기록」은 풀이 기록이라 이걸 대신하지 못한다.
test('엽전 구매 내역을 볼 수 있다', () => {
  assert.match(worker, /path === '\/mini\/api\/receipts'/, '내역을 주는 길이 없다');
  assert.ok(main.includes("case 'receipts':"), '내역 화면이 없다');
  assert.match(main, /on\('btn-receipts'/, '들어갈 자리가 없다');
  assert.match(main, /id: 'btn-receipts'/, '메뉴에 없다');
});

test('돈을 안 낸 줄은 결제 내역에 안 넣는다', () => {
  // ⚠️ 원장에는 출석 도장(amount 0)·가입 지급·관리자 선물이 함께 있다.
  //    그것까지 보여 주면 산 적 없는 결제가 있는 것처럼 읽힌다.
  const f = 몸통(worker, 'async function handleMiniReceipts(');
  assert.match(f, /amount > 0/, '결제가 아닌 줄까지 내보낸다');
});

test('결제 내역은 제 것만 본다', () => {
  const f = 몸통(worker, 'async function handleMiniReceipts(');
  assert.match(f, /getMiniUserKeyFromRequest/, '로그인을 확인하지 않는다');
  assert.match(f, /WHERE user_key = \?/, '남의 내역까지 보인다');
});

// ── 이미 지키고 있던 것들 (되돌아오면 걸린다) ────────────────
test('공유는 intoss:// 스킴을 쓴다', () => {
  // 가이드라인: "공유 기능은 intoss-private:// 가 아닌 intoss:// 스킴을 쓴다".
  assert.match(main, /const APP_DEEPLINK = 'intoss:\/\//, '공유 딥링크가 바뀌었다');
  assert.ok(!main.includes('intoss-private://'), 'intoss-private:// 가 코드에 있다');
});

test('광고 키가 테스트 키가 아니다', () => {
  // 가이드라인·공지 둘 다 "테스트 광고 키/프로모션 키 사용"을 흔한 위반으로 든다.
  for (const m of main.matchAll(/const AD\w*UNIT_ID = '([^']*)'/g)) {
    if (!m[1]) continue;
    assert.match(m[1], /^ait\.v2\.live\./, `광고 키가 실키가 아니다: ${m[1]}`);
  }
});

test('광고를 로딩·결과 화면에서 틀지 않는다', () => {
  // 가이드라인: "인앱 광고가 인트로/로딩/컷신/모달 화면에 없다".
  const m = /const AD_QUIET_SCREENS = new Set\(\[([^\]]*)\]\)/.exec(main);
  assert.ok(m, '광고를 안 트는 화면 목록이 없다');
  assert.match(m[1], /'loading'/, '로딩 화면에서 광고가 뜬다');
  assert.match(m[1], /'result'/, '결과 화면에서 광고가 뜬다');
});

test('SDK 는 3.x 다', () => {
  // 2026-10-05 까지 모든 WebView·Unity 프로젝트가 3.x 로 옮겨야 한다.
  // ⚠️ 3.x 로 배포하면 2.x 로 되돌릴 수 없다.
  const pkg = JSON.parse(readFileSync(new URL('../mini/package.json', import.meta.url), 'utf8'));
  assert.match(pkg.dependencies['@apps-in-toss/web-framework'], /^\^?3\./,
    'SDK 가 3.x 가 아니다 — 2026-10-05 마감이다');
});
