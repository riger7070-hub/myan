// 광고를 어디서 어떻게 트는지.
//
// 광고는 조금만 잘못 놓아도 앱을 끄게 만든다. 특히 자동 광고(사용자가 요청하지 않은
// 광고)는 규칙을 코드에 적어 두는 것만으로는 부족해서, 여기에 못박아 둔다.
//
//   1) 무료로 받은 자리를 **떠날 때** 튼다 — 방금 받은 것을 광고로 덮지 않는다
//   2) 하루 셋까지, 보상형과 몫을 나눠 쓴다 — 예약되는 자리는 다섯이지만 뜨는 것은 셋
//   3) 방금 다른 광고를 본 사람에게는 틀지 않는다 — 연달아 두 번은 최악이다
//   4) 돈을 낸 사람에게는 틀지 않는다. 엽전을 낸 풀이에도 붙이지 않는다
//   5) 실패하면 아무 말 없이 넘어간다 — 사용자가 요청한 일이 아니다
//
// ⚠️ 2) 가 유일한 안전판이다. 예전에는 "하루 한 번" 제한이 하나 더 있었는데
//    무료 콘텐츠마다 틀라는 요청으로 걷어냈다. 이것까지 풀면 하루 다섯 번이 된다.

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
  const j = SRC.indexOf('\n}', i);
  return SRC.slice(i, j + 2);
};

test('SDK 에 넘기는 이름이 adGroupId 다', () => {
  // 실제로 당했다. adUnitId 로 넘기면 SDK 는 아무 말 없이 아무것도 안 한다 —
  // 눌러도 광고가 안 뜨는데 오류도 없어서 원인을 찾기 어렵다.
  // 콘솔이 주는 값의 이름도 '광고 그룹 ID' 다.
  const f = fnOf('showAd');
  assert.doesNotMatch(f, /adUnitId\s*:/, 'adUnitId 로 넘기고 있다 — 광고가 뜨지 않는다');
  assert.equal((f.match(/adGroupId:\s*groupId/g) || []).length, 2,
    'load·show 두 곳 모두 adGroupId 로 넘겨야 한다');
});

test('광고가 응답하지 않아도 화면이 잠기지 않는다', () => {
  const f = fnOf('showAd');
  assert.match(f, /setTimeout\(/, '응답이 없을 때 포기하는 장치가 없다');
  assert.match(f, /settled/, '두 번 끝날 수 있다 — busy 가 엉킨다');
});

test('못 띄운 광고는 하루 몫에서 세지 않는다', () => {
  // 보지도 못한 광고를 세면 억울하다. markAdSeen 은 성공한 뒤에 와야 한다.
  const w = fnOf('watchAd');
  const showAt = w.indexOf('await showAd(');
  const markAt = w.indexOf('markAdSeen()');
  assert.ok(showAt > 0 && markAt > showAt, 'markAdSeen 이 showAd 보다 먼저 온다');
});

test('광고 단위 두 가지가 모두 꽂혀 있다', () => {
  assert.match(SRC, /const AD_UNIT_ID = 'ait\.[\w.]+'/, '보상형 광고 단위가 비어 있다');
  assert.match(SRC, /const AD_AUTO_UNIT_ID = 'ait\.[\w.]+'/, '자동 광고 단위가 비어 있다');
  const a = SRC.match(/const AD_UNIT_ID = '([^']+)'/)[1];
  const b = SRC.match(/const AD_AUTO_UNIT_ID = '([^']+)'/)[1];
  assert.notEqual(a, b, '두 광고가 같은 단위를 쓰고 있다');
});

test('⚠️ 전면 광고를 막는 것은 이제 하루 몫과 간격뿐이다', () => {
  // 예전에는 "하루 한 번"(AUTO_AD_DAY_KEY) 제한이 따로 있었다. 무료 콘텐츠마다
  // 틀라는 요청으로 그것만 걷어냈다. 그래서 **남은 둘이 유일한 안전판**이다 —
  // 이것까지 풀면 예약되는 자리 다섯 곳에서 하루 다섯 번이 뜨고, 그쯤이면 앱을 지운다.
  const f = fnOf('runAutoAdIfDue');
  assert.match(f, /adsLeftToday\(\)/, '하루 몫을 보지 않는다 — 무료 자리마다 광고가 뜬다');
  assert.match(f, /_lastAdAt < AD_GAP_MS/, '광고 사이 간격을 두지 않는다');
  assert.match(SRC, /const AD_GAP_MS = 3 \* 60 \* 1000;/, '간격이 3분이 아니다');
  // 날짜 기준은 KST. UTC 로 잡으면 09:00 에 하루가 넘어가 아침마다 몫이 되살아난다.
  assert.match(SRC, /_kstDay = \(\) =>[^\n]*9 \* 3600000/, '_kstDay 가 KST 가 아니다');
});

test('⚠️ 무료 풀이를 본 뒤에 전면 광고를 예약한다', () => {
  const i = SRC.indexOf("go('result');");
  assert.ok(i > 0, "go('result') 를 못 찾았다");
  assert.match(SRC.slice(i, i + 600), /if \(item\.free\) state\.autoAdPending = true;/,
    '무료 풀이가 전면 광고를 예약하지 않는다');
  // 산가지는 서버를 타지 않는 별도 경로라 따로 걸어야 한다.
  assert.match(fnOf('drawStick'), /state\.autoAdPending = true;/,
    '산가지가 전면 광고를 예약하지 않는다');
});

test('⚠️ 엽전을 낸 풀이에는 전면 광고를 붙이지 않는다', () => {
  // 돈을 낸 자리에까지 광고를 붙이면 낸 값이 무색해진다.
  const i = SRC.indexOf("go('result');");
  assert.doesNotMatch(SRC.slice(i, i + 600), /^\s*state\.autoAdPending = true;/m,
    '무료 여부를 안 보고 예약한다 — 유료 풀이에도 광고가 붙는다');
});

test('⚠️ 예약은 go() 다음에 세우고, 결과 화면에서는 틀지 않는다', () => {
  // go() 안에 광고를 트는 자리가 있다. 먼저 세우면 방금 띄운 것을 광고가 덮는다.
  const f = fnOf('drawStick');
  assert.ok(f.indexOf('state.autoAdPending') > f.indexOf('go('),
    '산가지: 예약이 go() 앞에 있다 — 방금 뽑은 것이 광고에 덮인다');
  // ⚠️ '다시 뽑기' 가 같은 화면으로 다시 들어온다. stick 을 조용한 화면에 넣어 두지
  //    않으면 뽑을 때마다 광고가 튀어나온다.
  assert.match(SRC, /const AD_QUIET_SCREENS = new Set\(\['loading', 'result', 'stick'\]\);/,
    '광고를 참는 화면 목록이 loading·result·stick 이 아니다');
});

test('광고는 종류를 합쳐 하루 세 번까지', () => {
  assert.match(SRC, /const AD_DAILY_MAX = 3;/, '클라이언트 상한이 3이 아니다');
  // 보상형과 자동 광고가 같은 수를 함께 써야 한다. 따로 세면 합쳐서 대여섯 번이 된다.
  assert.match(fnOf('runAutoAdIfDue'), /adsLeftToday\(\)/, '자동 광고가 하루 몫을 보지 않는다');
  assert.match(fnOf('watchAd'), /adsLeftToday\(\)/, '보상형 광고가 하루 몫을 보지 않는다');
  assert.match(fnOf('watchAd'), /markAdSeen\(\)/, '본 횟수를 세지 않는다');
  assert.match(fnOf('runAutoAdIfDue'), /markAdSeen\(\)/, '본 횟수를 세지 않는다');
  assert.match(fnOf('adPrompt'), /adsLeftToday\(\)/, '몫을 다 써도 안내가 계속 보인다');
  // 실제로 막는 것은 서버다. 앱을 고쳐도 넘길 수 없어야 한다.
  const worker = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'worker.js'), 'utf8');
  assert.match(worker, /const MINI_AD_DAILY_MAX\s*=\s*3;/, '서버 상한이 3이 아니다');
});

test('보상형 광고는 퀴즈·부풀리기를 끝냈을 때 나온다', () => {
  // '무료 엽전 받기' 목록에 광고 타일을 두지 않는다 — 거기서는 광고가 콘텐츠처럼 보인다.
  const earn = SRC.slice(SRC.indexOf("case 'earn':"), SRC.indexOf("case 'need':"));
  assert.doesNotMatch(earn, /btn-ad/, "무료 엽전 받기 칸에 광고 타일이 남아 있다");
  // 대신 두 놀이를 끝낸 자리에 뜬다.
  const quiz = SRC.slice(SRC.indexOf("case 'quiz':"), SRC.indexOf("case 'pop':"));
  const pop = SRC.slice(SRC.indexOf("case 'pop':"), SRC.indexOf("case 'stick'"));
  assert.match(quiz, /\$\{adPrompt\(\)\}/, '퀴즈를 끝낸 자리에 안내가 없다');
  assert.match(pop, /\$\{adPrompt\(\)\}/, '부풀리기를 끝낸 자리에 안내가 없다');
});

test('결제한 사람에게는 자동 광고를 틀지 않는다', () => {
  assert.match(fnOf('runAutoAdIfDue'), /state\.noAds/, '결제 여부를 보지 않는다');
  // 판단은 서버가 한다 — 앱을 다시 깔아도 유지되어야 한다.
  const worker = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'worker.js'), 'utf8');
  assert.match(worker, /noAds: await _miniHasPaid\(env, userKey\)/, '/me 가 결제 여부를 안 준다');
  assert.match(worker, /amount > 0/, '무료로 받은 엽전까지 결제로 세고 있다');
  assert.match(SRC, /state\.noAds = !!me\.noAds/, '앱이 그 값을 받지 않는다');
});

test('충전 화면이 광고가 사라진다고 알린다', () => {
  const i = SRC.indexOf("case 'charge': {");
  const charge = SRC.slice(i, i + 3000);
  assert.match(charge, /광고가 사라집니다/, '결제로 무엇이 좋아지는지 적혀 있지 않다');
  assert.match(charge, /state\.noAds/, '이미 결제한 사람에게도 같은 말을 한다');
});

test('방금 광고를 본 사람에게는 자동 광고를 틀지 않는다', () => {
  const f = fnOf('runAutoAdIfDue');
  assert.match(f, /_lastAdAt/, '직전 광고 시각을 보지 않는다');
  assert.match(f, /return;/, '조건에 걸려도 그냥 진행한다');
});

test('자동 광고는 화면을 떠날 때 튼다', () => {
  const f = fnOf('go');
  assert.match(f, /runAutoAdIfDue\(\)/, 'go() 에서 자동 광고를 부르지 않는다');
  // 로딩과 결과 화면(산가지 포함)은 비켜 준다.
  assert.match(f, /!AD_QUIET_SCREENS\.has\(screen\)/,
    '풀이를 보러 가는 길목에서도 광고를 튼다');
});

test('돈을 낸 사람에게는 자동 광고를 예약하지 않는다', () => {
  // 결제 지급 두 곳(즉시·미완료 복구) 모두 ad:false 여야 한다.
  const paid = [...SRC.matchAll(/payment\/grant[\s\S]{0,220}?gainCoins\(([^)]*)\)/g)].map(m => m[1]);
  assert.ok(paid.length >= 2, `결제 지급 자리를 ${paid.length}곳만 찾았다`);
  for (const args of paid) {
    assert.match(args, /ad:\s*false/, `결제 지급이 자동 광고를 예약한다: gainCoins(${args})`);
  }
  // 광고 보상도 마찬가지 — 광고를 보고 받았는데 또 틀 수는 없다.
  const adGrant = SRC.match(/ad-reward[\s\S]{0,200}?gainCoins\(([^)]*)\)/);
  assert.match(adGrant[1], /ad:\s*false/, '광고 보상이 또 광고를 예약한다');
});

test('무료 보상 세 가지는 자동 광고를 예약한다', () => {
  for (const [api, 이름] of [['checkin', '출석'], ['quiz', '퀴즈'], ['pop', '부풀리기']]) {
    const m = SRC.match(new RegExp(`/mini/api/${api}'[\\s\\S]{0,260}?gainCoins\\(([^)]*)\\)`));
    assert.ok(m, `${이름} 에서 gainCoins 를 부르지 않는다`);
    assert.doesNotMatch(m[1], /ad:\s*false/, `${이름} 가 자동 광고를 막고 있다`);
  }
});

test('자동 광고가 실패해도 사용자에게 말하지 않는다', () => {
  const f = fnOf('runAutoAdIfDue');
  assert.match(f, /catch[\s\S]{0,60}console\.warn/, '실패를 콘솔에만 남기지 않는다');
  assert.doesNotMatch(f, /state\.error/, '자동 광고 실패를 화면에 띄운다');
});

test('광고를 본 뒤 그 놀이를 바로 다시 시작한다', () => {
  // 서버는 광고를 본 만큼 그날 놀이 기회를 늘려 준다(_miniAdBonusToday).
  // 그런데 화면이 그 기회를 열어 주지 않으면, 한 번 더 하려고 광고를 본 사람이
  // 결과 화면에 그대로 서 있게 된다 — 속은 셈이다.
  const f = fnOf('watchAd');
  assert.match(f, /state\.screen === 'quiz'[\s\S]{0,40}startQuiz\(\)/, '퀴즈를 다시 시작하지 않는다');
  assert.match(f, /state\.screen === 'pop'[\s\S]{0,40}startPop\(\)/, '부풀리기를 다시 시작하지 않는다');
  // 보상 지급이 실패했으면 다시 시작하지 않는다(기회가 안 늘었을 수 있다).
  assert.match(f, /보상 지급에 실패했어요[\s\S]{0,60}return;/, '지급 실패인데도 이어서 진행한다');
});

test('보상형 광고는 끝까지 본 경우에만 준다', () => {
  const f = fnOf('watchAd');
  assert.match(f, /if \(!rewarded\)/, '보상 여부를 확인하지 않는다');
  assert.match(fnOf('showAd'), /userEarnedReward/, '보상 신호를 보지 않는다');
});

test("'광고 시청 시 무료 엽전 +N' 이 누를 수 있는 자리다", () => {
  const f = fnOf('adPrompt');
  assert.match(f, /<button[^>]*id="btn-ad"/, '글만 있고 누를 곳이 없다');
  assert.match(f, /광고 시청 시 무료 .*엽전 \+\$\{AD_TOKENS\}/, '문구가 다르다');
  assert.match(f, /한 번 더/, '무엇이 더 생기는지 말해 주지 않는다');
  assert.match(SRC, /on\('btn-ad', watchAd\)/, 'btn-ad 가 광고에 연결돼 있지 않다');
});

test('엽전이 늘어난 때에만 효과를 튼다', () => {
  const f = fnOf('gainCoins');
  assert.match(f, /if \(state\.tokens <= before\) return;/, '줄거나 그대로일 때도 효과가 난다');
  assert.match(f, /coinRain\(/, '효과를 부르지 않는다');
  assert.match(fnOf('coinRain'), /prefers-reduced-motion/, '움직임을 줄인 기기를 배려하지 않는다');
});
