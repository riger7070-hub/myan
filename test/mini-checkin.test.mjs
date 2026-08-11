// 출석 도장 테스트.
//
// 처음 배포했을 때 누르면 "처리에 실패했습니다"만 떴다. 원인은 INSERT 의 물음표가
// 둘인데 bind 에 값을 셋 넘긴 것이었다 — D1 이 통째로 거부하는데, 그 실패가
// catch 에 잡혀 한 줄짜리 메시지로만 나오니 밖에서는 원인을 알 수가 없었다.
//
// 소스만 훑는 검사로는 이런 걸 못 잡는다. 진짜 SQL 을 실행해 봐야 한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const { handleMiniCheckin, createSessionToken } = await loadWorker([
  'handleMiniCheckin', 'createSessionToken',
]);

const SECRET = 'mini-checkin-test-secret';
const USER = 'UK-CHECKIN';
const DAY = 86400000;

async function setup() {
  const { db, DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET };
  const session = await createSessionToken(`mini:${USER}`, env);
  const checkin = () => handleMiniCheckin(new Request('https://x/mini/api/checkin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
    body: '{}',
  }), env);
  const balance = () => Number(db.prepare(
    `SELECT COALESCE(SUM(tokens),0) b FROM mini_payment_requests WHERE user_key=? AND status='approved'`
  ).get(USER).b);
  /** 과거 날짜에 도장을 미리 찍어 둔다(연속 일수 계산을 확인하려고). */
  const stamp = (daysAgo) => {
    const d = new Date(Date.now() + 9 * 3600000 - daysAgo * DAY).toISOString().slice(0, 10);
    db.prepare(
      `INSERT OR IGNORE INTO mini_payment_requests (id,user_key,pkg,amount,tokens,status,approved_at)
       VALUES (?,?,'checkin',0,0,'approved',unixepoch())`
    ).run(`checkin:${USER}:${d}`, USER);
  };
  return { db, checkin, balance, stamp };
}

test('출석을 누르면 실패하지 않는다', async () => {
  // 이 테스트 하나면 물음표 개수가 어긋난 걸 바로 잡을 수 있었다.
  const { checkin } = await setup();
  const res = await checkin();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true, JSON.stringify(body));
  assert.equal(body.streak, 1);
});

test('같은 날 여러 번 눌러도 하루로 센다', async () => {
  const { checkin } = await setup();
  await checkin();
  const body = await (await checkin()).json();
  assert.equal(body.streak, 1, '같은 날인데 연속 일수가 늘었다');
});

test('연속으로 오면 일수가 쌓인다', async () => {
  const { checkin, stamp } = await setup();
  for (let i = 1; i <= 3; i++) stamp(i);      // 어제·그제·그끄제
  const body = await (await checkin()).json();
  assert.equal(body.streak, 4);
});

test('하루라도 빠지면 다시 1부터 센다', async () => {
  const { checkin, stamp } = await setup();
  stamp(1); stamp(3); stamp(4);                // 이틀 전이 비어 있다
  const body = await (await checkin()).json();
  assert.equal(body.streak, 2, '끊긴 날 너머까지 이어서 셌다');
});

test('7일 개근이면 토큰을 주고, 같은 날 또 누르면 한 번만 준다', async () => {
  const { checkin, balance } = await setup();
  const { stamp } = await setup();             // (독립 인스턴스라 아래에서 다시 만든다)
  void stamp;

  const s = await setup();
  for (let i = 1; i <= 6; i++) s.stamp(i);     // 어제까지 6일
  const first = await (await s.checkin()).json();
  assert.equal(first.streak, 7);
  assert.equal(first.granted, true);
  assert.equal(s.balance(), 3);

  const second = await (await s.checkin()).json();
  assert.equal(second.granted, false, '같은 날 두 번째에도 지급됐다');
  assert.equal(s.balance(), 3);
  void balance;
});

test('7일이 아니면 지급하지 않고 남은 일수를 알려준다', async () => {
  const { checkin, stamp, balance } = await setup();
  for (let i = 1; i <= 2; i++) stamp(i);
  const body = await (await checkin()).json();
  assert.equal(body.streak, 3);
  assert.equal(body.granted, false);
  assert.equal(body.toNext, 4, '7일까지 남은 일수가 틀렸다');
  assert.equal(balance(), 0);
});

test('로그인하지 않았으면 도장을 찍지 않는다', async () => {
  const { DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET };
  const web = await createSessionToken('user@example.com', env);

  for (const auth of [null, `Bearer ${web}`]) {
    const res = await handleMiniCheckin(new Request('https://x/mini/api/checkin', {
      method: 'POST',
      headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json' },
      body: '{}',
    }), env);
    assert.equal(res.status, 401);
  }
});
