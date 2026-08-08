// 푸시 개인화 문구 선택 테스트.
//
// sendDailyPush() 는 크론에서만 돌고 실제 발송까지 하므로 통째로 돌려볼 수는 없다.
// 대신 "어떤 상태의 사람에게 어떤 문구가 가는가"라는 계약을 고정한다 — 이게 틀리면
// 휴면 사용자에게 스트릭 독촉이 가는 식으로 어긋나고, 알림은 한 번 잘못 나가면 주워담을 수 없다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { PUSH_MSG, DORMANT_DAYS, _ELEM_FR } = await loadWorker(['PUSH_MSG', 'DORMANT_DAYS', '_ELEM_FR']);

const LANGS = ['ko', 'en', 'zh', 'ja'];

// sendDailyPush() 안의 선택 규칙과 같은 순서. 규칙을 바꾸면 여기도 같이 바꿔야 한다.
function pickBody({ email, streaks, recent, lang, dayElem }) {
  if (email && streaks.has(email)) return PUSH_MSG.streak[lang](streaks.get(email));
  if (email && !recent.has(email)) return PUSH_MSG.dormant[lang];
  return PUSH_MSG.daily[lang]((_ELEM_FR[lang] || _ELEM_FR.ko)[dayElem] || dayElem);
}

test('스트릭이 살아 있으면 스트릭 문구가 우선한다', () => {
  const body = pickBody({
    email: 'a@b.c', streaks: new Map([['a@b.c', 12]]), recent: new Set(),
    lang: 'ko', dayElem: '木',
  });
  assert.match(body, /12/, '연속 일수가 문구에 들어가야 한다');
  // 휴면 조건도 동시에 만족하지만(recent 비어 있음) 스트릭이 이긴다
  assert.notEqual(body, PUSH_MSG.dormant.ko);
});

test('오래 안 온 사람에게는 지난 리딩 안내가 간다', () => {
  const body = pickBody({
    email: 'a@b.c', streaks: new Map(), recent: new Set(), lang: 'ko', dayElem: '木',
  });
  assert.equal(body, PUSH_MSG.dormant.ko);
});

test('최근 이용자에게는 오늘의 일진 문구가 간다', () => {
  const body = pickBody({
    email: 'a@b.c', streaks: new Map(), recent: new Set(['a@b.c']), lang: 'ko', dayElem: '火',
  });
  assert.match(body, /화\(불\)/, '한국어 오행 이름이 들어가야 한다');
});

test('비로그인 구독(email 없음)은 개인화 없이 기본 문구가 간다', () => {
  const body = pickBody({
    email: null, streaks: new Map(), recent: new Set(), lang: 'ko', dayElem: '水',
  });
  assert.match(body, /수\(물\)/);
  assert.notEqual(body, PUSH_MSG.dormant.ko, '휴면 문구가 가면 안 된다');
});

test('세 종류 문구가 모두 4개국어로 있다', () => {
  for (const lang of LANGS) {
    assert.equal(typeof PUSH_MSG.streak[lang], 'function', `streak.${lang}`);
    assert.equal(typeof PUSH_MSG.dormant[lang], 'string', `dormant.${lang}`);
    assert.equal(typeof PUSH_MSG.daily[lang], 'function', `daily.${lang}`);

    assert.ok(PUSH_MSG.streak[lang](5).includes('5'), `streak.${lang} 에 일수가 안 들어갔다`);
    assert.ok(PUSH_MSG.dormant[lang].length > 0, `dormant.${lang} 가 비었다`);
    assert.ok(PUSH_MSG.daily[lang]('X').includes('X'), `daily.${lang} 에 오행이 안 들어갔다`);
  }
});

test('오행 이름표가 4개국어를 모두 덮는다', () => {
  for (const lang of LANGS) {
    for (const elem of ['木', '火', '土', '金', '水']) {
      assert.ok(_ELEM_FR[lang]?.[elem], `_ELEM_FR.${lang}.${elem} 없음`);
    }
  }
});

test('휴면 기준일이 상식적인 범위다', () => {
  // 너무 짧으면 매일 오는 사람에게도 휴면 문구가 가고, 너무 길면 복귀 유도가 무의미해진다
  assert.ok(DORMANT_DAYS >= 3 && DORMANT_DAYS <= 30, `DORMANT_DAYS=${DORMANT_DAYS}`);
});
