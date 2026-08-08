// 스트릭 체크인 보너스 — 같은 날 두 번 지급되지 않아야 한다.
//
// handleStreakCheckin 은 "오늘 이미 체크인했나"를 SELECT 로 먼저 보고, 통과하면 user_streaks 를
// 갱신한 뒤 7일째마다 5토큰을 원장에 넣는다. 읽기와 쓰기 사이에 await 가 있으므로 요청 두 개가
// 나란히 들어오면 **둘 다** 검사를 통과한다(버튼 두 번 누르기, 재시도, 오프라인 큐 재전송 등).
// 그러면 7일째 보너스가 5토큰이 아니라 10토큰 나간다 — 실제 돈이 걸린 원장 버그다.
//
// 이 테스트는 worker.js 의 진짜 DDL 위에서 핸들러 두 개를 동시에 돌려 그 상황을 그대로 만든다.
// (검증: 고정 id 를 랜덤 id 로 되돌리면 이 테스트는 실제로 실패한다.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1, balanceOf } from './d1-sqlite.mjs';

const { handleStreakCheckin, createSessionToken, _todayKST } =
  await loadWorker(['handleStreakCheckin', 'createSessionToken', '_todayKST']);

const SECRET = 'test-secret';
const EMAIL  = 'streak@example.com';

// 핸들러가 쓰는 것과 같은 식으로 "어제"를 만든다(KST 기준).
const yesterdayKST = () =>
  new Date(Date.now() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);

function setup({ streak, lastCheckin }) {
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO user_streaks (user_email,current_streak,max_streak,last_checkin,total_checkins,updated_at)
     VALUES (?,?,?,?,?,unixepoch())`
  ).run(EMAIL, streak, streak, lastCheckin, streak);
  return { db, env: { SESSION_SECRET: SECRET, DB } };
}

const req = token => new Request('https://x/api/streak/checkin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: '{}',
});

const bonusRows = db =>
  db.prepare(`SELECT id FROM payment_requests WHERE user_email=? AND pkg='streak_bonus'`).all(EMAIL);

test('7일째 체크인은 5토큰을 한 번만 지급한다', async () => {
  const { db, env } = setup({ streak: 6, lastCheckin: yesterdayKST() });
  const token = await createSessionToken(EMAIL, env);

  const res = await handleStreakCheckin(req(token), env);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.current, 7);
  assert.equal(body.bonus, true);
  assert.equal(bonusRows(db).length, 1);
  assert.equal(balanceOf(db, EMAIL), 5);
});

test('동시에 들어온 두 체크인이 보너스를 두 번 지급하지 않는다', async () => {
  const { db, env } = setup({ streak: 6, lastCheckin: yesterdayKST() });
  const token = await createSessionToken(EMAIL, env);

  // 같은 tick 에 두 요청을 띄운다 — SELECT 두 개가 모두 갱신 전 상태를 읽는다.
  await Promise.all([
    handleStreakCheckin(req(token), env),
    handleStreakCheckin(req(token), env),
  ]);

  assert.equal(bonusRows(db).length, 1, '보너스 행이 두 개 생겼다 — 토큰이 중복 지급된다');
  assert.equal(balanceOf(db, EMAIL), 5, '5토큰만 지급됐어야 한다');
});

test('동시 요청이 스트릭 카운터를 두 번 올리지 않는다', async () => {
  const { db, env } = setup({ streak: 2, lastCheckin: yesterdayKST() });
  const token = await createSessionToken(EMAIL, env);

  await Promise.all([
    handleStreakCheckin(req(token), env),
    handleStreakCheckin(req(token), env),
  ]);

  const row = db.prepare('SELECT * FROM user_streaks WHERE user_email=?').get(EMAIL);
  assert.equal(row.current_streak, 3);
  assert.equal(row.total_checkins, 3);
  assert.equal(row.last_checkin, _todayKST());
});

test('이미 오늘 체크인했으면 아무것도 지급하지 않는다', async () => {
  const { db, env } = setup({ streak: 7, lastCheckin: _todayKST() });
  const token = await createSessionToken(EMAIL, env);

  const res = await handleStreakCheckin(req(token), env);
  const body = await res.json();

  assert.equal(body.alreadyDone, true);
  assert.equal(bonusRows(db).length, 0);
  assert.equal(balanceOf(db, EMAIL), 0);
});

test('연속이 끊기면 1부터 다시 세고 보너스는 없다', async () => {
  const { db, env } = setup({ streak: 6, lastCheckin: '2020-01-01' });
  const token = await createSessionToken(EMAIL, env);

  const body = await (await handleStreakCheckin(req(token), env)).json();

  assert.equal(body.current, 1);
  assert.equal(body.bonus, false);
  assert.equal(body.max, 6, '최고 기록은 유지돼야 한다');
  assert.equal(bonusRows(db).length, 0);
});
