// 광고를 어디서 어떻게 트는지.
//
// 광고는 조금만 잘못 놓아도 앱을 끄게 만든다. 특히 자동 광고(사용자가 요청하지 않은
// 광고)는 규칙을 코드에 적어 두는 것만으로는 부족해서, 여기에 못박아 둔다.
//
//   1) 보상을 받은 화면을 **떠날 때** 튼다 — 축하 화면을 광고로 덮지 않는다
//   2) 하루 한 번까지 — 무료 콘텐츠가 셋이라 그때마다 틀면 하루 세 번이 된다
//   3) 방금 보상형 광고를 본 사람에게는 틀지 않는다 — 연달아 두 번은 최악이다
//   4) 돈을 낸 사람에게는 틀지 않는다
//   5) 실패하면 아무 말 없이 넘어간다 — 사용자가 요청한 일이 아니다

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

test('자동 광고는 하루 한 번까지', () => {
  const f = fnOf('runAutoAdIfDue');
  assert.match(f, /localStorage\.getItem\(AUTO_AD_DAY_KEY\) === today/, '오늘 튼 적이 있는지 안 본다');
  assert.match(f, /localStorage\.setItem\(AUTO_AD_DAY_KEY, today\)/, '튼 날을 기록하지 않는다');
  assert.match(f, /_kstDay\(\)/, '날짜 기준을 _kstDay 로 잡지 않는다');
  // 기준일은 KST. UTC 로 잡으면 09:00 에 하루가 넘어가 아침마다 한 번 더 튼다.
  assert.match(SRC, /_kstDay = \(\) =>[^\n]*9 \* 3600000/, '_kstDay 가 KST 가 아니다');
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
  // 결과 화면과 로딩은 비켜 준다.
  assert.match(f, /screen !== 'loading' && screen !== 'result'/,
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

test('보상형 광고는 끝까지 본 경우에만 준다', () => {
  const f = fnOf('watchAd');
  assert.match(f, /if \(!rewarded\)/, '보상 여부를 확인하지 않는다');
  assert.match(fnOf('showAd'), /userEarnedReward/, '보상 신호를 보지 않는다');
});

test("'광고 시청 시 무료 엽전 +N' 이 누를 수 있는 자리다", () => {
  const f = fnOf('adPrompt');
  assert.match(f, /<button[^>]*id="btn-ad"/, '글만 있고 누를 곳이 없다');
  assert.match(f, /광고 시청 시 무료 .*엽전 \+\$\{AD_TOKENS\}/, '문구가 다르다');
  assert.match(SRC, /on\('btn-ad', watchAd\)/, 'btn-ad 가 광고에 연결돼 있지 않다');
});

test('엽전이 늘어난 때에만 효과를 튼다', () => {
  const f = fnOf('gainCoins');
  assert.match(f, /if \(state\.tokens <= before\) return;/, '줄거나 그대로일 때도 효과가 난다');
  assert.match(f, /coinRain\(/, '효과를 부르지 않는다');
  assert.match(fnOf('coinRain'), /prefers-reduced-motion/, '움직임을 줄인 기기를 배려하지 않는다');
});
