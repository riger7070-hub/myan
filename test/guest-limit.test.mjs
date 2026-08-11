// 게스트 체험(무료 1회) 제한 테스트.
//
// 하루 1회 제한을 SELECT 로 확인만 하고 실제 기록은 Gemini 응답을 받은 뒤에 남기고 있었다.
// 그 사이가 비어 있어서 같은 IP 로 동시에 들어온 요청이 전부 검사를 통과했고, 무료 Gemini
// 호출이 그만큼 여러 번 나갔다(로그인도 결제도 없이 부를 수 있는 유일한 경로다).
//
// 반대로, 우리 쪽 사정으로 풀이를 못 준 경우엔 오늘의 1회를 소모시키면 안 된다.
// 두 방향을 같이 고정한다.
//
// "하루"의 경계도 여기서 지킨다. used_date 를 UTC 날짜로 잡고 있었는데, 워커 로컬이 UTC 라
// 실제 초기화가 09:00 KST 에 일어났다 — 08시에 쓰고 10시에 또 쓰면 두 번 통과했고, 밤 11시에
// 쓴 사람은 한국 날짜가 바뀐 새벽에도 거절당했다. 스트릭·캐시·일진이 다 KST 자정이라
// 여기만 어긋나 있었다.

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

const usedDate = (db, ip) => {
  const r = db.prepare('SELECT used_date FROM guest_usage WHERE ip=?').get(ip);
  return r ? String(r.used_date) : null;
};

/** 시계를 t 로 고정하고 f() 를 부른다. localAsUtc 면 로컬 존이 UTC 인 런타임(=워커)을 흉내 낸다. */
async function at(t, f, { localAsUtc = false } = {}) {
  const RealDate = Date;
  class Fake extends RealDate {
    constructor(...a) { super(...(a.length ? a : [t])); }
    static now() { return t; }
  }
  class FakeUtc extends Fake {
    getFullYear() { return this.getUTCFullYear(); }
    getMonth()    { return this.getUTCMonth(); }
    getDate()     { return this.getUTCDate(); }
    getHours()    { return this.getUTCHours(); }
    setDate(...a) { return this.setUTCDate(...a); }
    setHours(...a){ return this.setUTCHours(...a); }
    getTimezoneOffset() { return 0; }
  }
  globalThis.Date = localAsUtc ? FakeUtc : Fake;
  try { return await f(); } finally { globalThis.Date = RealDate; }
}

/** 주어진 KST 날짜·시각의 epoch ms. */
const kstAt = (y, m, d, hh) => Date.UTC(y, m - 1, d, hh - 9, 0, 0);

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

test('하루 경계가 KST 자정이다 — 오전 8시와 10시는 같은 하루다', async () => {
  // 옛 구현은 09:00 KST 에 날이 넘어가서 이 둘이 다른 하루로 갈렸고, 무료 1회가 두 번 나갔다.
  const { db, DB } = createD1();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return okReading(); };
  const env = { DB, GEMINI_API_KEY: 'k' };

  const first  = await at(kstAt(2026, 8, 12, 8),  () => handleGuestChat(req(), env), { localAsUtc: true });
  const second = await at(kstAt(2026, 8, 12, 10), () => handleGuestChat(req(), env), { localAsUtc: true });

  assert.equal(first.status, 200);
  assert.equal(second.status, 429, '같은 KST 날짜인데 무료 1회가 또 나갔다');
  assert.equal(calls, 1, `Gemini 를 ${calls}번 불렀다`);
  assert.equal(usedDate(db, IP), '2026-08-12', 'used_date 가 KST 날짜가 아니다');
});

test('KST 자정을 넘기면 새 하루다 — 밤 11시와 다음 새벽 1시', async () => {
  // 옛 구현에서는 둘 다 UTC 로 같은 날이라 새벽에 거절당했다.
  const { DB } = createD1();
  globalThis.fetch = async () => okReading();
  const env = { DB, GEMINI_API_KEY: 'k' };

  const night = await at(kstAt(2026, 8, 12, 23), () => handleGuestChat(req(), env), { localAsUtc: true });
  const dawn  = await at(kstAt(2026, 8, 13, 1),  () => handleGuestChat(req(), env), { localAsUtc: true });

  assert.equal(night.status, 200);
  assert.equal(dawn.status, 200, '한국 날짜가 바뀌었는데 아직 어제로 묶여 있다');
});

test('resetAt 은 다음 KST 자정이고 resetIn 이 그와 맞는다', async () => {
  const { DB } = createD1();
  globalThis.fetch = async () => okReading();
  const env = { DB, GEMINI_API_KEY: 'k' };

  const now = kstAt(2026, 8, 12, 23);              // 23:00 KST → 자정까지 1시간
  await at(now, () => handleGuestChat(req(), env), { localAsUtc: true });
  const res = await at(now, () => handleGuestChat(req(), env), { localAsUtc: true });
  const body = await res.json();

  assert.equal(res.status, 429);
  // 2026-08-13 00:00 KST = 2026-08-12T15:00:00Z
  assert.equal(body.error.resetAt, '2026-08-12T15:00:00.000Z',
    '초기화 시각이 다음 KST 자정이 아니다');
  assert.equal(body.error.resetIn, 1, `자정까지 1시간인데 ${body.error.resetIn} 이라고 알려 준다`);
});

test('달·해가 넘어가는 날에도 초기화 시각이 어긋나지 않는다', async () => {
  const { DB } = createD1();
  globalThis.fetch = async () => okReading();

  for (const [y, m, d, wantIso] of [
    [2026, 8, 31, '2026-08-31T15:00:00.000Z'],     // → 9월 1일 00:00 KST
    [2026, 12, 31, '2026-12-31T15:00:00.000Z'],    // → 2027년 1월 1일 00:00 KST
    [2028, 2, 28, '2028-02-28T15:00:00.000Z'],     // → 윤년 2월 29일 00:00 KST
  ]) {
    const { DB: db2 } = createD1();
    const env = { DB: db2, GEMINI_API_KEY: 'k' };
    const now = kstAt(y, m, d, 23);
    await at(now, () => handleGuestChat(req(), env), { localAsUtc: true });
    const res = await at(now, () => handleGuestChat(req(), env), { localAsUtc: true });
    const body = await res.json();
    assert.equal(body.error.resetAt, wantIso, `${y}-${m}-${d} 의 초기화 시각이 어긋난다`);
  }
});

test('하루 경계가 실행 환경의 로컬 존에 좌우되지 않는다', async () => {
  // 워커는 UTC 로 돌고 이 저장소는 KST 에서 개발한다. 로컬 시간을 읽으면 두 곳의 동작이 갈린다.
  const seen = [];
  for (const localAsUtc of [true, false]) {
    const { db, DB } = createD1();
    globalThis.fetch = async () => okReading();
    const env = { DB, GEMINI_API_KEY: 'k' };
    const now = kstAt(2026, 8, 12, 2);             // 새벽 2시 KST — UTC 로는 아직 8월 11일
    await at(now, () => handleGuestChat(req(), env), { localAsUtc });
    const res = await at(now, () => handleGuestChat(req(), env), { localAsUtc });
    seen.push({ date: usedDate(db, IP), resetAt: (await res.json()).error.resetAt });
  }
  assert.deepEqual(seen[0], seen[1], '로컬 존에 따라 하루 경계가 달라진다');
  assert.equal(seen[0].date, '2026-08-12', 'used_date 가 KST 날짜가 아니다');
});
