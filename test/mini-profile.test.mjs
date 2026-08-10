// 미니앱 프로필 저장 테스트.
//
// 샌드박스 첫 테스트에서 "입력해도 저장이 안 된다"는 증상이 나왔다. 원인은 두 겹이었다.
//
//   1) 로그인 핸들러가 mini_users INSERT 실패를 catch 로 삼키고 세션만 발급했다.
//      그래서 "로그인은 됐는데 행은 없는" 상태가 만들어졌다.
//   2) 프로필 저장이 UPDATE 라서, 그 행이 없으면 0건을 고치고도 ok:true 를 돌려줬다.
//      사용자에겐 저장했다는데 안 남는 걸로 보인다.
//
// 게다가 그 UPDATE 문에는 name 이 아예 빠져 있어서 이름은 처음부터 저장되지 않았다.
//
// 아래 테스트는 세 가지를 계약으로 고정한다: 행이 없어도 스스로 복구할 것,
// 이름을 저장할 것, 이 화면에서 안 받는 gender 를 덮어쓰지 말 것.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const { handleMiniSaveProfile, createSessionToken } = await loadWorker([
  'handleMiniSaveProfile', 'createSessionToken',
]);

const SECRET = 'mini-profile-test-secret';
const USER = 'UK-PROFILE';

async function setup() {
  const { db, DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET };
  const session = await createSessionToken(`mini:${USER}`, env);
  const save = (body) => handleMiniSaveProfile(new Request('https://x/mini/api/profile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env);
  const row = () => db.prepare(`SELECT * FROM mini_users WHERE user_key = ?`).get(USER);
  return { db, save, row };
}

const FORM = { name: '안태현', birthYear: '1990', birthMonth: '5', birthDay: '15', birthHour: '오전 9시' };

test('로그인 행이 없어도 프로필 저장이 행을 만든다', async () => {
  // 이게 실패하면 사용자는 "저장했다는데 안 남는" 상태에 갇힌다.
  const { save, row } = await setup();
  assert.equal(row(), undefined, '준비 상태가 잘못됐다 — 행이 없어야 한다');

  const res = await save(FORM);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);

  const r = row();
  assert.ok(r, '행이 만들어지지 않았다');
  assert.equal(r.birth_year, 1990);
  assert.equal(r.birth_month, 5);
  assert.equal(r.birth_day, 15);
});

test('이름도 저장한다', async () => {
  // 예전 UPDATE 문에는 name 이 빠져 있어서 이름만 조용히 사라졌다.
  const { save, row } = await setup();
  await save(FORM);
  assert.equal(row().name, '안태현');
});

test('다시 저장하면 값이 갱신된다', async () => {
  const { save, row } = await setup();
  await save(FORM);
  await save({ ...FORM, birthYear: '1991', birthHour: '' });
  const r = row();
  assert.equal(r.birth_year, 1991);
  assert.equal(r.birth_hour, null, '빈 값으로 지울 수 있어야 한다');
});

test('이 화면에서 안 받는 gender 는 덮어쓰지 않는다', async () => {
  // 토스 로그인으로 받아 둔 성별이 프로필 저장 한 번에 날아가면 안 된다.
  const { db, save, row } = await setup();
  db.prepare(`INSERT INTO mini_users (user_key, gender) VALUES (?, 'M')`).run(USER);

  await save(FORM);          // 폼에는 gender 가 없다
  assert.equal(row().gender, 'M', 'gender 가 덮어써졌다');
  assert.equal(row().birth_year, 1990);
});

test('생년이 비정상이면 거부하고 아무것도 쓰지 않는다', async () => {
  const { save, row } = await setup();
  for (const bad of ['1800', '3000']) {
    const res = await save({ ...FORM, birthYear: bad });
    assert.equal(res.status, 400, `${bad} 는 거부되어야 한다`);
  }
  assert.equal(row(), undefined, '거부했는데 행이 생겼다');
});

test('로그인하지 않았으면 저장하지 않는다', async () => {
  const { db, DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET };
  const web = await createSessionToken('user@example.com', env);   // 웹 세션

  for (const auth of [null, `Bearer ${web}`]) {
    const res = await handleMiniSaveProfile(new Request('https://x/mini/api/profile', {
      method: 'POST',
      headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify(FORM),
    }), env);
    assert.equal(res.status, 401);
  }
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM mini_users`).get().c, 0);
});
