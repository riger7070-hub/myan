// 사람마다 달라지지 않는 운세를 두 번 만들지 않는지.
//
// 이 캐시는 원래 Gemini 무료 등급의 분당 요청 한도 때문에 생겼다. 배포본 측정 결과
// 순차 12건은 전부 성공했지만 동시 5건은 5건 다 실패했다(모두 ~6.4초 뒤 422).
// 2026-08-11 에 유료 키로 바꿔 그 이유는 없어졌지만, 캐시가 지켜야 할 계약은 그대로다 —
// 이제는 한도가 아니라 **요금**이 걸려 있다. 같은 글을 두 번 사지 않는다.
// 그래서 여기서 볼 것은 "결과가 같다"가 아니라 **"호출 횟수가 줄어든다"** 이다.
// 호출 횟수를 세지 않는 테스트는 캐시가 통째로 빠져도 통과하므로 의미가 없다.
//
// 특히 동시 요청 케이스가 핵심이다. D1 은 네트워크 왕복이라, 캐시가 빈 상태로 5건이
// 한꺼번에 들어오면 5건 다 조회에 실패하고 5번 다 Gemini 를 부른다 — 캐시를 붙여 놓고도
// 정확히 원래 터지던 상황이 그대로 재현된다. d1-sqlite 셤이 질의마다 매크로태스크 한 틱을
// 양보하는 것이 그 경합을 재현하는 장치다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const { cachedFortune, storeFortune } =
  await loadWorker(['cachedFortune', 'storeFortune']);

function setup() {
  const { db, DB } = createD1();
  return { db, env: { DB } };
}

/** 부른 횟수를 세는 생성기. */
function counter(text = '만들어진 글') {
  const calls = { n: 0 };
  return [calls, async () => { calls.n++; return typeof text === 'function' ? text(calls.n) : text; }];
}

test('처음 한 번만 만들고 두 번째부터는 캐시에서 준다', async () => {
  const { env } = setup();
  const [calls, gen] = counter();

  const a = await cachedFortune(env, 'tarot|ko|0|u', gen);
  const b = await cachedFortune(env, 'tarot|ko|0|u', gen);

  assert.equal(a, '만들어진 글');
  assert.equal(b, '만들어진 글');
  assert.equal(calls.n, 1, `Gemini 를 ${calls.n}번 불렀다 — 캐시가 동작하지 않는다`);
});

test('bucket 이 다르면 각각 만든다', async () => {
  const { env } = setup();
  const [calls, gen] = counter();

  await cachedFortune(env, 'tarot|ko|0|u', gen);
  await cachedFortune(env, 'tarot|ko|1|u', gen);   // 다른 카드
  await cachedFortune(env, 'tarot|en|0|u', gen);   // 다른 언어

  assert.equal(calls.n, 3);
});

test('동시에 들어온 5건이 Gemini 를 한 번만 부른다', async () => {
  // 이 테스트가 캐시를 붙인 진짜 이유다. cachedFortune 의 in-flight 묶음을 빼면 5가 된다.
  const { env } = setup();
  const [calls, gen] = counter();

  const results = await Promise.all(
    [1, 2, 3, 4, 5].map(() => cachedFortune(env, 'zodiac|ko|6|1|2026-08-09', gen)),
  );

  assert.equal(calls.n, 1, `동시 5건이 Gemini 를 ${calls.n}번 불렀다 — 한 글을 다섯 번 산다`);
  for (const r of results) assert.equal(r, '만들어진 글');
});

test('생성에 실패하면 캐시에 남기지 않는다', async () => {
  // 빈 문자열을 저장해 버리면 그 bucket 은 하루 종일(타로·룬은 영원히) 빈 글을 돌려준다.
  const { db, env } = setup();
  let n = 0;
  const gen = async () => (++n === 1 ? '' : '두 번째엔 성공');

  const first = await cachedFortune(env, 'rune|ko|3|u', gen);
  assert.equal(first, '');
  const rows = db.prepare('SELECT COUNT(*) AS c FROM fortune_cache WHERE bucket = ?').get('rune|ko|3|u');
  assert.equal(rows.c, 0, '실패한 결과가 캐시에 들어갔다');

  const second = await cachedFortune(env, 'rune|ko|3|u', gen);
  assert.equal(second, '두 번째엔 성공', '실패 뒤에 다시 시도할 수 있어야 한다');
});

test('생성이 던져도 캐시가 잠기지 않는다', async () => {
  // fetch 가 던지는 경로(커넥션 리셋 등). in-flight 자리를 치우지 않으면 그 bucket 은
  // 이 isolate 가 살아 있는 동안 계속 같은 예외를 돌려준다.
  const { env } = setup();
  let n = 0;
  const gen = async () => { if (++n === 1) throw new TypeError('network error'); return '복구됨'; };

  await assert.rejects(() => cachedFortune(env, 'lucky|ko|2026-08-09', gen), /network error/);
  assert.equal(await cachedFortune(env, 'lucky|ko|2026-08-09', gen), '복구됨');
});

test('변형이 여러 개면 그중 하나를 준다 (한 사람만 보는 글이 아니게)', async () => {
  const { env } = setup();
  const bucket = 'zodiac|ko|0|0|2026-08-09';
  for (const v of ['변형 A', '변형 B', '변형 C']) await storeFortune(env, bucket, v);

  const [calls, gen] = counter();
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(await cachedFortune(env, bucket, gen));

  assert.equal(calls.n, 0, '이미 있는데도 새로 만들었다');
  assert.ok(seen.size >= 2, `40번 뽑았는데 ${seen.size}종류만 나왔다 — 무작위로 고르지 않는다`);
  for (const s of seen) assert.ok(['변형 A', '변형 B', '변형 C'].includes(s));
});

test('변형을 여러 번 넣어도 서로 덮어쓰지 않는다', async () => {
  const { db, env } = setup();
  const bucket = 'typecompat|ko|木|火';
  await storeFortune(env, bucket, '첫 번째');
  await storeFortune(env, bucket, '두 번째');

  const { c } = db.prepare('SELECT COUNT(*) AS c FROM fortune_cache WHERE bucket = ?').get(bucket);
  assert.equal(c, 2, '같은 id 로 덮어써서 변형이 쌓이지 않는다');
});
