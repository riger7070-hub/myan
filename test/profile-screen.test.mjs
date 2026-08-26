// "어디서 고치라"는 안내가 부르는 쪽 화면 이름과 맞는지.
//
// 한 핸들러가 웹과 미니앱을 함께 모신다. 그런데 안내 문구에 화면 이름을 고정으로
// 적어 두면 한쪽은 반드시 틀린다 — 웹에는 '내 정보'가 없고 미니앱에는 '마이페이지'가
// 없다. 실제로 대운은 "마이페이지에서 성별을 등록해 주세요", 이사 방위는 "내 정보에서
// …" 라고 서로 다르게 적혀 있어서, 각각 미니앱 사용자와 웹 사용자에게 **없는 화면**을
// 가리키고 있었다. (성별 검사는 차감 전에 하므로 엽전이 나가지는 않았다.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { _profileScreen, createSessionToken, handleDaeun, handleDirection } =
  await loadWorker(['_profileScreen', 'createSessionToken', 'handleDaeun', 'handleDirection']);

test('부르는 쪽에 따라 화면 이름이 달라진다', () => {
  assert.equal(_profileScreen({ kind: 'web', key: 'a@b.c' }), '마이페이지');
  assert.equal(_profileScreen({ kind: 'mini', key: '307515147' }), '내 정보');
  // acct 가 없을 때도 터지지 않고 웹 쪽 이름으로 떨어진다(웹이 기본 클라이언트다).
  assert.equal(_profileScreen(null), '마이페이지');
});

const ENV = { SESSION_SECRET: 'test-secret-for-ci', DB: null };

/** 성별 없이 대운/방위를 부르면 나오는 400 문구를 그대로 돌려준다. */
async function messageFor(handler, token, body) {
  const res = await handler(new Request('https://x/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }), ENV);
  const data = await res.json();
  return { status: res.status, message: data?.error?.message || '' };
}

test('⚠️ 웹 사용자에게는 마이페이지, 미니앱 사용자에게는 내 정보라고 안내한다', async () => {
  const web = await createSessionToken('someone@example.com', ENV);
  const mini = await createSessionToken('mini:CI-ABC', ENV);
  const birth = { year: 1990, month: 5, day: 5, hour: 10 };

  for (const [handler, name] of [[handleDaeun, '대운'], [handleDirection, '이사 방위']]) {
    const w = await messageFor(handler, web, { birth });          // 성별을 안 보낸다
    const m = await messageFor(handler, mini, { birth });
    assert.equal(w.status, 400, `${name}: 성별 없이도 통과했다`);
    assert.equal(m.status, 400, `${name}: 성별 없이도 통과했다(미니)`);
    assert.match(w.message, /마이페이지/, `${name}: 웹에 '내 정보'라고 안내한다`);
    assert.doesNotMatch(w.message, /내 정보/, `${name}: 웹에 없는 화면을 가리킨다`);
    assert.match(m.message, /내 정보/, `${name}: 미니앱에 '마이페이지'라고 안내한다`);
    assert.doesNotMatch(m.message, /마이페이지/, `${name}: 미니앱에 없는 화면을 가리킨다`);
  }
});

test('화면 이름을 문구에 박아 두지 않았다', () => {
  // 박아 두면 다시 한쪽이 틀린다. 안내는 _profileScreen 을 거쳐야 한다.
  // 한 줄씩 본다 — 여러 줄을 한꺼번에 훑으면 따옴표가 줄을 넘어가 주석에 적힌
  // '마이페이지'까지 문자열로 삼킨다(처음 짰을 때 실제로 그랬다).
  const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');
  const hardcoded = worker.split(String.fromCharCode(10))
    .flatMap((line) => [...line.matchAll(/'[^']*(?:마이페이지|내 정보)에서[^']*'/g)].map((m) => m[0]))
    .filter((s) => /등록|확인|바꾸|고치/.test(s));   // 사용자에게 보내는 안내만 본다
  assert.deepEqual(hardcoded, [],
    `화면 이름이 문구에 박혀 있다: ${hardcoded.join(' · ')} — _profileScreen(acct) 를 쓸 것`);
});
