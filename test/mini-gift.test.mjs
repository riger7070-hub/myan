// 지인에게 엽전 선물하기.
//
// 여기는 **돈 없이 엽전이 생기는 자리**다. 결제 자리보다 더 조심해야 한다 —
// 결제는 토스가 한 번 걸러 주지만 여기는 관리자 열쇠 하나가 전부다.
//
// 네 가지를 계약으로 못 박는다.
//   1) 열쇠 없이는 아무것도 안 된다
//   2) 같은 선물(note)은 몇 번을 불러도 한 번만 나간다
//   3) 원장에 **amount 0** 으로 남는다 — 매출로 세어지면 안 되고, 광고도 안 사라진다
//   4) 한 번에 줄 수 있는 양에 뚜껑이 있다

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const { handleMiniAdminGift, handleMiniAdminFind } = await loadWorker([
  'handleMiniAdminGift', 'handleMiniAdminFind',
]);

const KEY = 'admin-secret-for-test';
const USER = 'UK-friend-1';

function setup() {
  const { db, DB } = createD1();
  db.prepare(`INSERT INTO mini_users (user_key, name, birth_year, created_at, last_login_at)
              VALUES (?, ?, ?, unixepoch(), unixepoch())`).run(USER, '김지인', 1990);
  const env = { DB, ADMIN_SECRET: KEY };
  const gift = (body, key = KEY) => handleMiniAdminGift(new Request('https://x/admin/mini-gift', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env);
  const find = (q, key = KEY) => handleMiniAdminFind(
    new Request(`https://x/admin/mini-find?q=${encodeURIComponent(q)}&key=${key}`), env);
  return { db, env, gift, find };
}

const 원장 = (db) => db.prepare(
  `SELECT id, pkg, amount, tokens FROM mini_payment_requests WHERE user_key = ?`).all(USER);

test('열쇠가 없으면 아무것도 안 준다', async () => {
  const { gift, db } = setup();
  const r = await gift({ userKey: USER, tokens: 10, note: '생일' }, 'wrong-key');
  assert.equal(r.status, 401);
  assert.equal(원장(db).length, 0, '거부했는데 원장에 남았다');
});

test('열쇠가 아예 없는 서버에서는 거부한다', async () => {
  // ADMIN_SECRET 을 안 넣었으면 빈 문자열끼리 맞아떨어져 통과하면 안 된다.
  const { db, DB } = createD1();
  const r = await handleMiniAdminGift(new Request('https://x/admin/mini-gift', {
    method: 'POST', headers: { Authorization: 'Bearer ' }, body: '{}',
  }), { DB });
  assert.equal(r.status, 401);
  void db;
});

test('선물하면 엽전이 늘고, 원장에 amount 0 으로 남는다', async () => {
  const { gift, db } = setup();
  const r = await gift({ userKey: USER, tokens: 7, note: '생일선물' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.지급함, true);
  assert.equal(j.엽전, 7);
  assert.equal(j.잔액, 7);

  const rows = 원장(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tokens, 7);
  // ⚠️ 여기가 0 이 아니면 매출로 세어지고, 광고 없애기까지 딸려 나간다.
  //    (_miniHasPaid 가 amount > 0 을 본다)
  assert.equal(rows[0].amount, 0, '선물이 돈 받은 것으로 남았다');
  assert.equal(rows[0].pkg, 'gift');
});

test('같은 note 로는 두 번 나가지 않는다', async () => {
  const { gift, db } = setup();
  await gift({ userKey: USER, tokens: 5, note: '생일선물' });
  const 두번째 = await gift({ userKey: USER, tokens: 5, note: '생일선물' });
  assert.equal(두번째.status, 200);
  assert.equal((await 두번째.json()).지급함, false, '두 번째도 지급했다고 답한다');
  assert.equal(원장(db).length, 1, '같은 선물이 두 번 들어갔다');
});

test('note 를 달리 적으면 또 줄 수 있다', async () => {
  const { gift, db } = setup();
  await gift({ userKey: USER, tokens: 5, note: '생일선물' });
  await gift({ userKey: USER, tokens: 3, note: '이사선물' });
  assert.equal(원장(db).length, 2);
});

test('말이 안 되는 양은 막는다', async () => {
  const { gift, db } = setup();
  for (const t of [0, -5, 1.5, 101, 99999, 'many', null]) {
    const r = await gift({ userKey: USER, tokens: t, note: '시험' });
    assert.equal(r.status, 400, `${t} 개를 받아 줬다`);
  }
  assert.equal(원장(db).length, 0);
});

test('note 없이는 안 준다', async () => {
  // note 가 곧 중복 방지 열쇠다. 없으면 같은 선물이 몇 번이고 나간다.
  const { gift } = setup();
  assert.equal((await gift({ userKey: USER, tokens: 5 })).status, 400);
  assert.equal((await gift({ userKey: USER, tokens: 5, note: '   ' })).status, 400);
});

test('없는 사람에게는 안 준다', async () => {
  const { gift, db } = setup();
  const r = await gift({ userKey: 'UK-nobody', tokens: 5, note: '시험' });
  assert.equal(r.status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM mini_payment_requests').get().c, 0);
});

test('연결을 끊은 사람에게는 안 준다', async () => {
  const { gift, db } = setup();
  db.prepare('UPDATE mini_users SET unlinked_at = unixepoch() WHERE user_key = ?').run(USER);
  assert.equal((await gift({ userKey: USER, tokens: 5, note: '시험' })).status, 400);
});

test('이름으로 찾으면 고를 거리를 준다', async () => {
  const { find } = setup();
  const j = await (await find('지인')).json();
  assert.equal(j.찾은사람, 1);
  const p = j.사람[0];
  assert.equal(p.userKey, USER);
  assert.equal(p.이름, '김지인');
  // 동명이인을 가리려면 이만큼은 있어야 한다.
  assert.ok(p.가입 && p.마지막로그인, '언제 들어온 사람인지 알 수 없다');
  assert.equal(p.잔액, 0);
});

test('찾기도 열쇠가 있어야 한다', async () => {
  const { find } = setup();
  assert.equal((await find('지인', 'wrong')).status, 401);
});
