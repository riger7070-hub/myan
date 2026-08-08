// 게스트 체험(무료 1회) 제한 테스트.
//
// 하루 1회 제한을 SELECT 로 확인만 하고 실제 기록은 Gemini 응답을 받은 뒤에 남기고 있었다.
// 그 사이가 비어 있어서 같은 IP 로 동시에 들어온 요청이 전부 검사를 통과했고, 무료 Gemini
// 호출이 그만큼 여러 번 나갔다(로그인도 결제도 없이 부를 수 있는 유일한 경로다).
//
// 반대로, 우리 쪽 사정으로 풀이를 못 준 경우엔 오늘의 1회를 소모시키면 안 된다.
// 두 방향을 같이 고정한다.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const { handleGuestChat } = await loadWorker(['handleGuestChat']);

const IP = '203.0.113.9';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const okReading = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{
    text: JSON.stringify({ reading: '오늘은 물의 기운이 돕니다 #水', ohaeng: { 木:20,火:20,土:20,金:20,水:20 } }),
  }] } }],
}), { status: 200 });

const req = (ip = IP, body = { birth: '1990-03-15', name: '손님' }) =>
  new Request('https://x/chat-guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });

const usedCount = (db, ip) => {
  const r = db.prepare('SELECT used_count FROM guest_usage WHERE ip=?').get(ip);
  return r ? Number(r.used_count) : 0;
};

test('같은 IP 의 동시 요청은 하루 1회만 통과한다', async () => {
  const { db, DB } = createD1();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return okReading(); };

  const results = await Promise.all([
    handleGuestChat(req(), { DB, GEMINI_API_KEY: 'k' }),
    handleGuestChat(req(), { DB, GEMINI_API_KEY: 'k' }),
    handleGuestChat(req(), { DB, GEMINI_API_KEY: 'k' }),
  ]);

  const ok = results.filter(r => r.status === 200);
  assert.equal(ok.length, 1, '무료 체험이 여러 번 통과했다');
  assert.equal(calls, 1, `Gemini 를 ${calls}번 불렀다 — 무료 호출이 새고 있다`);
  assert.equal(usedCount(db, IP), 1);
});

test('두 번째 요청은 GUEST_LIMIT 로 거절된다', async () => {
  const { DB } = createD1();
  globalThis.fetch = async () => okReading();
  const env = { DB, GEMINI_API_KEY: 'k' };

  assert.equal((await handleGuestChat(req(), env)).status, 200);
  const second = await handleGuestChat(req(), env);
  const body = await second.json();

  assert.equal(second.status, 429);
  assert.equal(body.error.code, 'GUEST_LIMIT');
});

test('Gemini 가 실패하면 오늘의 무료 1회를 소모하지 않는다', async () => {
  const { db, DB } = createD1();
  const env = { DB, GEMINI_API_KEY: 'k' };

  globalThis.fetch = async () => { throw new TypeError('network error'); };
  const failed = await handleGuestChat(req(), env);
  assert.equal(failed.status, 500);
  assert.equal(usedCount(db, IP), 0, '우리 쪽 실패인데 무료 1회가 날아갔다');

  globalThis.fetch = async () => okReading();
  assert.equal((await handleGuestChat(req(), env)).status, 200, '다시 시도할 수 있어야 한다');
});

test('업스트림 오류 원문을 응답에 싣지 않는다', async () => {
  const { DB } = createD1();
  globalThis.fetch = async () => new Response(
    '{"error":{"message":"API key not valid: AIzaSyINTERNAL","status":"INVALID_ARGUMENT"}}',
    { status: 400 });

  const res = await handleGuestChat(req(), { DB, GEMINI_API_KEY: 'k' });
  const text = await res.text();

  assert.doesNotMatch(text, /AIzaSy|INVALID_ARGUMENT|API key/,
    '업스트림 원문이 클라이언트로 새어나갔다');
});

test('운영자 IP 는 시크릿이 설정된 경우에만 무제한이다', async () => {
  const { DB } = createD1();
  globalThis.fetch = async () => okReading();
  const master = '198.51.100.7';

  // 시크릿 없음 → 특별 대우 없음
  const noSecret = { DB, GEMINI_API_KEY: 'k' };
  assert.equal((await handleGuestChat(req(master), noSecret)).status, 200);
  assert.equal((await handleGuestChat(req(master), noSecret)).status, 429);

  // 시크릿 설정 → 계속 통과
  const withSecret = { DB, GEMINI_API_KEY: 'k', MASTER_IP: master };
  assert.equal((await handleGuestChat(req(master), withSecret)).status, 200);
  assert.equal((await handleGuestChat(req(master), withSecret)).status, 200);
});

test('IP 가 코드에 하드코딩되어 있지 않다', async () => {
  // 공개 저장소다. 예전엔 운영자 실제 IP 가 그대로 박혀 있었다.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'worker.js'), 'utf8');

  const literals = [...src.matchAll(/'(\d{1,3}(?:\.\d{1,3}){3})'/g)]
    .map(m => m[1])
    .filter(v => v !== '0.0.0.0' && v !== '127.0.0.1');
  assert.deepEqual(literals, [], `IP 리터럴이 남아 있다: ${literals.join(', ')}`);
});
