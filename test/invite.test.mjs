// 궁합 초대 링크.
//
// 남의 생년월일을 받는 자리라 지켜야 할 선이 있다. 그 선을 여기서 못 박아 둔다.
//   · 링크를 연 사람에게 초대한 사람의 생년월일이 새면 안 된다
//   · 받는 쪽에 로그인도 이름도 요구하지 않는다
//   · 한 번 답하면 덮어쓰지 않는다 — 링크를 주워도 남의 답을 못 바꾼다
//   · 답이 실제로 왔을 때만 엽전을 준다. 링크만 뿌려서는 안 준다
//   · 오래된 초대는 지운다

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const H = await loadWorker([
  'handleInviteCreate', 'handleInviteList', 'handleInviteAnswer',
  'handleInvitePage', 'purgeStaleInvites', 'createSessionToken', 'accountBalance',
]);

const SECRET = 'invite-secret';
const KEY = 'CI-INVITE';
// 초대한 사람의 생년월일. 이 값이 받는 쪽 화면에 나타나면 안 된다.
const INVITER = { y: 1988, m: 3, d: 9, h: '인시' };

function setup() {
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO mini_users (user_key,name,birth_year,birth_month,birth_day,birth_hour,gender)
     VALUES (?,?,?,?,?,?,?)`
  ).run(KEY, '안태현', INVITER.y, INVITER.m, INVITER.d, INVITER.h, 'M');
  return { db, env: { SESSION_SECRET: SECRET, DB } };
}

const authed = async (env, path, body) => new Request('https://myan.example' + path, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await H.createSessionToken('mini:' + KEY, env)}`,
  },
  body: JSON.stringify(body || {}),
});

const plain = (path, body) => new Request('https://myan.example' + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function makeInvite(env) {
  const res = await H.handleInviteCreate(await authed(env, '/mini/api/invite'), env);
  assert.equal(res.status, 200);
  return JSON.parse(await res.text());
}

const 상대 = { year: 1992, month: 11, day: 4, hour: '오시' };

// ── 만들기 ──

test('초대를 만들면 열 수 있는 주소가 나온다', async () => {
  const { env } = setup();
  const r = await makeInvite(env);
  assert.match(r.url, /^https:\/\/myan\.example\/i\/[0-9a-f]{24}$/, `주소가 이상하다: ${r.url}`);
});

test('초대 번호는 추측할 수 없어야 한다', async () => {
  // 순번이면 남의 초대를 열어 볼 수 있다. 링크를 아는 사람만 열려야 한다.
  const { env } = setup();
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await makeInvite(env)).id);
  assert.equal(new Set(ids).size, 5, '같은 번호가 나왔다');
  for (const id of ids) assert.match(id, /^[0-9a-f]{24}$/);
});

test('생년월일을 안 넣은 사람은 초대를 못 만든다', async () => {
  const { db, DB } = createD1();
  db.prepare('INSERT INTO mini_users (user_key,name) VALUES (?,?)').run(KEY, '안태현');
  const env = { SESSION_SECRET: SECRET, DB };
  const res = await H.handleInviteCreate(await authed(env, '/mini/api/invite'), env);
  assert.equal(res.status, 400);
});

test('로그인하지 않으면 초대를 못 만든다', async () => {
  const { env } = setup();
  const res = await H.handleInviteCreate(plain('/mini/api/invite', {}), env);
  assert.equal(res.status, 401);
});

// ── 답하기 ──

test('링크를 받은 사람은 로그인 없이 답한다', async () => {
  const { env } = setup();
  const { id } = await makeInvite(env);
  const res = await H.handleInviteAnswer(plain('/api/invite/' + id, { birth: 상대 }), env, id);
  const text = await res.text();
  assert.equal(res.status, 200, text);
  assert.ok(JSON.parse(text).cards.length > 0, '둘의 결이 하나도 안 나왔다');
});

test('⚠️ 답한 사람에게 초대한 사람의 생년월일이 새지 않는다', async () => {
  const { env } = setup();
  const { id } = await makeInvite(env);
  const body = await (await H.handleInviteAnswer(
    plain('/api/invite/' + id, { birth: 상대 }), env, id)).text();
  for (const v of [INVITER.y, INVITER.m + '월', INVITER.d + '일', INVITER.h]) {
    assert.doesNotMatch(body, new RegExp(String(v)), `초대한 사람의 생년월일(${v})이 응답에 실렸다`);
  }
  assert.doesNotMatch(body, /birth|inviterBirth/i, '생년월일 자리가 응답에 있다');
});

test('⚠️ 공개 페이지에도 초대한 사람의 생년월일이 없다', async () => {
  const { env } = setup();
  const { id } = await makeInvite(env);
  const raw = await (await H.handleInvitePage(
    new Request('https://myan.example/i/' + id), env, id)).text();
  assert.match(raw, /안태현/, '누가 물었는지는 보여야 한다');

  // ⚠️ 초대 번호(24자리 16진수)를 먼저 걷어내고 본다.
  // 안 그러면 무작위 번호 안에 우연히 '1988' 같은 네 글자가 들어갈 때마다
  // 유출이 아닌데도 실패한다 — 3천 번에 한 번쯤 터지던 헛알람이었다.
  // 번호는 우리가 방금 만든 값이라 정확히 지울 수 있다.
  const html = raw.split(id).join('«초대번호»');

  assert.doesNotMatch(html, new RegExp(String(INVITER.y)), '생년이 페이지에 박혀 있다');

  // 시 고르는 칸에는 열두 시가 다 들어 있다. 그건 받는 사람이 자기 것을 고르는
  // 자리라 초대한 사람과 무관하다. 그 칸을 뺀 나머지에 '인시'가 있으면 새는 것이다.
  const 폼밖 = html.replace(/<select[\s\S]*?<\/select>/g, '');
  assert.doesNotMatch(폼밖, /인시/, '태어난 시가 페이지에 박혀 있다');
  // 미리 골라 둔 값이 있으면 그것도 새는 길이다.
  assert.doesNotMatch(html, /selected|value="[^"]*시"/, '초대한 사람의 시가 미리 골라져 있다');
});

test('초대 번호에 생년이 섞여도 헛알람이 나지 않는다', async () => {
  // 위 검사가 번호를 걷어내는지 확인한다. 번호에 1988 을 일부러 심어 둔다.
  const { env } = setup();
  const { id } = await makeInvite(env);
  const raw = await (await H.handleInvitePage(
    new Request('https://myan.example/i/' + id), env, id)).text();
  const 심은것 = raw.split(id).join('aaaa1988bbbbccccdddd0000');
  const 걷어낸것 = 심은것.split('aaaa1988bbbbccccdddd0000').join('«초대번호»');
  assert.doesNotMatch(걷어낸것, /1988/, '번호를 걷어내는 방식이 통하지 않는다');
});

test('공개 페이지는 이름도 로그인도 요구하지 않는다', async () => {
  const { env } = setup();
  const { id } = await makeInvite(env);
  const html = await (await H.handleInvitePage(
    new Request('https://myan.example/i/' + id), env, id)).text();
  assert.match(html, /id="y"/, '생년월일 칸이 없다');
  assert.doesNotMatch(html, /<input[^>]+id="(?:name|nm)"/, '이름을 받고 있다');
  assert.doesNotMatch(html, /로그인|가입하/, '로그인을 요구한다');
});

test('공개 페이지는 검색에 걸리지 않고 캐시에도 남지 않는다', async () => {
  const { env } = setup();
  const { id } = await makeInvite(env);
  const res = await H.handleInvitePage(new Request('https://myan.example/i/' + id), env, id);
  assert.match(await res.text(), /noindex/, '남의 초대가 검색에 걸린다');
  assert.match(res.headers.get('Cache-Control') || '', /no-store/, '답이 캐시에 남는다');
});

test('⚠️ 한 번 답하면 덮어쓸 수 없다', async () => {
  // 링크가 단톡방에 돌아도 먼저 답한 사람의 값이 바뀌면 안 된다.
  const { db, env } = setup();
  const { id } = await makeInvite(env);
  await H.handleInviteAnswer(plain('/api/invite/' + id, { birth: 상대 }), env, id);

  const 다른사람 = { year: 2001, month: 1, day: 1, hour: '' };
  const res = await H.handleInviteAnswer(plain('/api/invite/' + id, { birth: 다른사람 }), env, id);
  assert.equal(res.status, 409, '두 번째 답이 먹혔다');

  const row = db.prepare('SELECT partner_birth FROM mini_invites WHERE id = ?').get(id);
  assert.equal(JSON.parse(row.partner_birth).year, 상대.year, '먼저 답한 값이 덮어써졌다');
});

test('없는 초대는 404 다', async () => {
  const { env } = setup();
  const res = await H.handleInviteAnswer(plain('/api/invite/없다', { birth: 상대 }), env, '없다');
  assert.equal(res.status, 404);
  const page = await H.handleInvitePage(new Request('https://x/i/없다'), env, '없다');
  assert.equal(page.status, 404);
});

test('말이 안 되는 생년월일은 받지 않는다', async () => {
  const { env } = setup();
  for (const bad of [
    null, {}, { year: 1899, month: 1, day: 1 }, { year: 3000, month: 1, day: 1 },
    { year: 1990, month: 13, day: 1 }, { year: 1990, month: 1, day: 32 },
    { year: 'abc', month: 1, day: 1 },
  ]) {
    const { id } = await makeInvite(env);
    const res = await H.handleInviteAnswer(plain('/api/invite/' + id, { birth: bad }), env, id);
    assert.equal(res.status, 400, `${JSON.stringify(bad)} 를 받아들였다`);
  }
});

test('안 받은 값 때문에 초대가 잠기지 않는다', async () => {
  // 잘못 적어 400 이 났다고 초대가 답한 것으로 표시되면, 제대로 적을 기회가 사라진다.
  const { env } = setup();
  const { id } = await makeInvite(env);
  await H.handleInviteAnswer(plain('/api/invite/' + id, { birth: { year: 1 } }), env, id);
  const res = await H.handleInviteAnswer(plain('/api/invite/' + id, { birth: 상대 }), env, id);
  assert.equal(res.status, 200, '한 번 잘못 적었다고 초대가 막혔다');
});

// ── 보상 ──

test('답이 왔을 때만 엽전을 준다', async () => {
  const { env } = setup();
  const { id } = await makeInvite(env);
  assert.equal(await H.accountBalance(env, { kind: 'mini', key: KEY }), 0, '링크만 만들었는데 엽전이 들어왔다');

  await H.handleInviteAnswer(plain('/api/invite/' + id, { birth: 상대 }), env, id);
  assert.equal(await H.accountBalance(env, { kind: 'mini', key: KEY }), 1, '답이 왔는데 엽전이 안 들어왔다');
});

test('하루 보상에는 끝이 있다', async () => {
  // 링크를 뿌려 무한히 받는 길을 막는다.
  const { env } = setup();
  for (let i = 0; i < 6; i++) {
    const { id } = await makeInvite(env);
    await H.handleInviteAnswer(
      plain('/api/invite/' + id, { birth: { ...상대, day: 1 + i } }), env, id);
  }
  assert.equal(await H.accountBalance(env, { kind: 'mini', key: KEY }), 3, '하루 상한을 넘겼다');
});

// ── 내 초대 보기 ──

test('내가 만든 초대만 보인다', async () => {
  const { db, env } = setup();
  const { id } = await makeInvite(env);
  db.prepare(
    `INSERT INTO mini_invites (id,user_key,kind,inviter_birth)
     VALUES ('남의것','OTHER','intimacy','{"year":1970,"month":1,"day":1}')`
  ).run();

  const res = await H.handleInviteList(new Request('https://myan.example/mini/api/invite', {
    headers: { Authorization: `Bearer ${await H.createSessionToken('mini:' + KEY, env)}` },
  }), env);
  const { invites } = JSON.parse(await res.text());
  assert.deepEqual(invites.map(i => i.id), [id], '남의 초대가 섞였다');
});

test('답이 오면 상대 생년월일을 받아 온다', async () => {
  const { env } = setup();
  const { id } = await makeInvite(env);
  await H.handleInviteAnswer(plain('/api/invite/' + id, { birth: 상대 }), env, id);

  const res = await H.handleInviteList(new Request('https://myan.example/mini/api/invite', {
    headers: { Authorization: `Bearer ${await H.createSessionToken('mini:' + KEY, env)}` },
  }), env);
  const { invites } = JSON.parse(await res.text());
  assert.equal(invites[0].answered, true);
  assert.deepEqual(invites[0].partner, 상대, '앱이 그대로 쓸 수 있는 모양이 아니다');
});

// ── 지우기 ──

test('오래된 초대는 지운다', async () => {
  const { db, env } = setup();
  const { id: 최근 } = await makeInvite(env);
  const { id: 옛것 } = await makeInvite(env);
  const now = Math.floor(Date.now() / 1000);
  db.prepare('UPDATE mini_invites SET created_at = ? WHERE id = ?').run(now - 91 * 86400, 옛것);

  const gone = await H.purgeStaleInvites(env, now);
  assert.equal(gone, 1);
  const left = db.prepare('SELECT id FROM mini_invites').all().map(r => r.id);
  assert.deepEqual(left, [최근], '남길 것을 지웠거나 지울 것을 남겼다');
});
