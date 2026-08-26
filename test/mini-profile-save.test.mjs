// 내 정보를 고치고 저장하면 **그 자리에서** 바뀌어 보이는가.
//
// 실제로 당했다. 저장은 되는데 화면은 옛 값을 들고 있었고, 내 정보에서 나갔다
// 다시 들어와야 바뀐 것이 보였다. 원인은 둘이었다.
//
//   1. 저장 응답이 {ok:true} 뿐이라 앱이 /mini/api/me 를 다시 불러야 했다.
//   2. 그 GET 응답에 Cache-Control 이 없었다 — 토스 웹뷰가 캐시해서 옛 값을 줬다.
//
// 저장한 값을 저장 응답에 실어 주면 다시 물을 일이 없고, no-store 는 잔액·기록처럼
// 사람마다 다른 값이 캐시에 남는 것까지 막는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINI = readFileSync(join(ROOT, 'mini', 'src', 'main.js'), 'utf8');
const WORKER = readFileSync(join(ROOT, 'worker.js'), 'utf8');

const H = await loadWorker(['handleMiniSaveProfile', 'handleMiniMe', 'createSessionToken']);

const USER = 'toss-user-1';

// ⚠️ 미니앱 세션은 따로 만드는 함수가 없다. 웹과 같은 createSessionToken 에
//    'mini:' 를 붙인 값을 넣는다(worker.js 의 로그인 자리와 같은 방식).
const miniToken = (env) => H.createSessionToken(`mini:${USER}`, env);

function makeEnv() {
  const { db, DB } = createD1();
  return { db, env: { SESSION_SECRET: 'p', DB } };
}

/** getMiniUserKeyFromRequest 가 무엇을 보는지에 맞춰 요청을 만든다. */
async function saveReq(env, body, token) {
  return H.handleMiniSaveProfile(new Request('https://x/mini/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }), env);
}

test('⚠️ 저장 응답이 방금 저장한 값을 그대로 돌려준다', async () => {
  // 이것이 없으면 앱은 /mini/api/me 를 다시 물어야 하고, 그 길에 캐시가 낀다.
  const src = WORKER.slice(WORKER.indexOf('async function handleMiniSaveProfile'));
  const body = src.slice(0, src.indexOf('\r\n}') + 1);

  assert.ok(/SELECT[\s\S]{0,200}FROM mini_users/.test(body),
    '저장한 뒤 그 값을 읽지 않는다 — 앱이 다시 물어야 한다');
  assert.match(body, /profile:\s*\{/, '응답에 profile 이 없다');
  for (const k of ['birthYear', 'birthMonth', 'birthDay', 'birthHour', 'gender', 'name']) {
    assert.ok(body.includes(k), `응답 profile 에 ${k} 가 빠졌다`);
  }
});

test('⚠️ API 응답은 캐시되지 않는다', () => {
  // 여기가 비어 있어서 웹뷰가 GET 을 캐시했다. 잔액·지난 기록도 같은 길로 나간다 —
  // 남의 화면에 내 값이 남는 것도 함께 막는다.
  const at = WORKER.indexOf('function cors(body, status');
  assert.notEqual(at, -1, 'cors() 가 없다');
  const fn = WORKER.slice(at, WORKER.indexOf('\r\n}', at));
  assert.match(fn, /'Cache-Control':\s*'no-store'/,
    'API 응답에 Cache-Control: no-store 가 없다');
});

test('⚠️ 앱은 저장 응답을 그대로 쓰고 다시 묻지 않는다', () => {
  const at = MINI.indexOf('async function saveProfile(form)');
  assert.notEqual(at, -1, 'saveProfile 이 없다');
  const fn = MINI.slice(at, MINI.indexOf('\r\n}', at));

  assert.match(fn, /const saved = await api\('\/mini\/api\/profile'/,
    '저장 응답을 받지 않고 버린다');
  assert.match(fn, /saved\?\.\s*profile/, '저장 응답의 profile 을 쓰지 않는다');
  // 옛 서버를 위한 길은 남겨 두되, 그것이 **기본 경로**가 되면 안 된다.
  const meCall = fn.indexOf("api('/mini/api/me')");
  const savedUse = fn.indexOf('saved?.profile');
  assert.ok(savedUse !== -1 && (meCall === -1 || savedUse < meCall),
    '저장 응답보다 /me 를 먼저 본다 — 캐시에 다시 걸린다');
});

test('저장한 값이 실제로 남고, 곧바로 읽힌다', async () => {
  const { db, env } = makeEnv();
  db.prepare(`INSERT INTO mini_users (user_key, gender) VALUES (?, 'M')`).run(USER);

  const token = await miniToken(env);
  const res = await saveReq(env, {
    name: '안태현', birthYear: '1999', birthMonth: '7', birthDay: '18',
    birthHour: '사시', gender: '',
  }, token);

  const text = await res.text();          // 본문은 한 번만 읽힌다
  assert.equal(res.status, 200, `${res.status} 가 나왔다: ${text.slice(0, 120)}`);
  const data = JSON.parse(text);

  assert.equal(data.profile.name, '안태현');
  assert.equal(String(data.profile.birthYear), '1999');
  assert.equal(data.profile.birthHour, '사시');
  // ⚠️ 성별은 빈 값으로 보냈다. COALESCE 라 예전 값(M)이 남아야 하고,
  //    응답도 **저장된 값**을 줘야 화면이 실제와 같아진다.
  assert.equal(data.profile.gender, 'M',
    '빈 성별로 덮어썼다 — 대운이 순행·역행부터 뒤집힌다');
});
