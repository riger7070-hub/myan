// 이름 풀이 — 한글 초성에서 뽑는 발음오행(오음오행).
//
// 규칙 자체는 표 한 장이라 틀리기 쉽지 않아 보이지만, 틀리면 조용히 틀린다. 초성을
// 잘못 떼면(된소리·복잡한 받침) 엉뚱한 오행이 나오고, 화면에는 여전히 그럴듯한 글이
// 뜬다. 그래서 아설순치후(牙舌脣齒喉 = 木火土金水) 배정과 초성 분해를 글자로 못박는다.
//
// 사주 대조(빈 오행을 채우는지, 넘치는 오행을 더 미는지)와 토큰 경로도 함께 본다.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1, balanceOf } from './d1-sqlite.mjs';

const { analyzeName, handleNameReading, createSessionToken } =
  await loadWorker(['analyzeName', 'handleNameReading', 'createSessionToken']);

const SECRET = 'test-secret';
const EMAIL  = 'name@example.com';
const realFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = realFetch; });

const elemsOf = name => analyzeName(name).chars.map(c => c.elem);

// ── 발음오행 ─────────────────────────────────────────────

test('초성이 아설순치후 순서로 木火土金水에 배정된다', () => {
  assert.deepEqual(elemsOf('가나마사아'), ['木', '火', '土', '金', '水']);
  // 거센소리·된소리도 같은 자리에 든다
  assert.deepEqual(elemsOf('카타파차하'), ['木', '火', '土', '金', '水']);
  assert.deepEqual(elemsOf('까따빠싸짜'), ['木', '火', '土', '金', '金']);
  assert.deepEqual(elemsOf('라다'), ['火', '火']);
});

test('받침이 있어도 초성만 본다', () => {
  // 곽·김·박은 받침이 달라도 초성이 ㄱ/ㄱ/ㅂ 이다
  assert.deepEqual(elemsOf('곽김박'), ['木', '木', '土']);
  assert.deepEqual(elemsOf('강가'), ['木', '木']);
});

test('이웃한 글자의 상생·상극·비화를 가른다', () => {
  assert.equal(analyzeName('가나').pairs[0].relation, 'saeng');   // 木→火
  assert.equal(analyzeName('가마').pairs[0].relation, 'geuk');    // 木剋土
  assert.equal(analyzeName('가카').pairs[0].relation, 'bihwa');   // 木·木
  assert.equal(analyzeName('마가').pairs[0].relation, 'geuk');    // 방향이 반대여도 상극
});

test('상생은 점수를 올리고 상극은 내린다', () => {
  assert.ok(analyzeName('가나다').score > analyzeName('가마수').score,
    '상생만 있는 이름이 상극 섞인 이름보다 낮게 나왔다');
});

test('한글 이름 2~6자가 아니면 풀지 않는다', () => {
  assert.equal(analyzeName('김'), null, '한 글자');
  assert.equal(analyzeName('김수한무거북이'), null, '일곱 글자');
  assert.equal(analyzeName('金秀漢'), null, '한자');
  assert.equal(analyzeName('Kim'), null, '알파벳');
  assert.equal(analyzeName('김ㅅ우'), null, '자모 낱글자');
  assert.equal(analyzeName(''), null);
  assert.equal(analyzeName(undefined), null);
});

// ── 사주 대조 ────────────────────────────────────────────

test('사주에 없던 오행을 이름이 채우면 짚어 준다', () => {
  const elem = { 木:0, 火:2, 土:2, 金:2, 水:2 };       // 木이 비었다
  const r = analyzeName('가나', elem);                  // 가 = 木

  assert.deepEqual(r.fills, ['木']);
  assert.deepEqual(r.overs, []);
  assert.ok(r.score > analyzeName('가나').score, '빈 자리를 채웠는데 점수가 그대로다');
});

test('이미 많은 오행을 더 보태면 깎는다', () => {
  const elem = { 木:4, 火:1, 土:1, 金:1, 水:1 };       // 木이 넘친다
  const r = analyzeName('가나', elem);

  assert.deepEqual(r.overs, ['木']);
  assert.deepEqual(r.fills, []);
});

test('생년월일이 없으면 사주 대조는 건너뛴다', () => {
  const r = analyzeName('가나');
  assert.deepEqual(r.fills, []);
  assert.deepEqual(r.overs, []);
});

// ── 토큰 ─────────────────────────────────────────────────

function setup(startingTokens = 10) {
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO payment_requests (id,user_email,pkg,amount,tokens,status,approved_at)
     VALUES ('seed',?,'test',0,?,'approved',unixepoch())`
  ).run(EMAIL, startingTokens);
  return { db, env: { SESSION_SECRET: SECRET, GEMINI_API_KEY: 'k', DB } };
}

const post = (token, body) => new Request('https://x/api/name-reading', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

test('정상 응답이면 4토큰이 빠지고 화면이 읽는 필드가 다 있다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: '이름의 결이 부드럽습니다.' }] } }] }),
    { status: 200 });

  const res = await handleNameReading(
    post(token, { name: '김서연', birth: { year: 1990, month: 5, day: 15 }, lang: 'ko' }), env);
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(balanceOf(db, EMAIL), 6);
  assert.equal(data.name, '김서연');
  // js/app.js 의 _nameCharsHtml 이 읽는 필드들
  for (const f of ['ch', 'choseong', 'elem']) {
    assert.ok(data.chars[0][f] !== undefined, `화면이 읽는 필드가 없다: ${f}`);
  }
  assert.equal(data.pairs.length, data.chars.length - 1);
  assert.ok(data.sajuElem, '생년월일을 줬으면 사주 오행 분포도 와야 한다');
});

test('한글 이름이 아니면 차감 없이 400', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  const res = await handleNameReading(post(token, { name: 'John' }), env);

  assert.equal(res.status, 400);
  assert.equal(called, false, '풀 수 없는 이름인데 Gemini 를 불렀다');
  assert.equal(balanceOf(db, EMAIL), 10);
});

test('잔액이 모자라면 차감도 호출도 없다', async () => {
  const { db, env } = setup(1);
  const token = await createSessionToken(EMAIL, env);
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };

  const res = await handleNameReading(post(token, { name: '김서연' }), env);

  assert.equal(res.status, 402);
  assert.equal(called, false);
  assert.equal(balanceOf(db, EMAIL), 1);
});

test('Gemini 가 던져도 4토큰이 돌아온다', async () => {
  const { db, env } = setup();
  const token = await createSessionToken(EMAIL, env);
  globalThis.fetch = async () => { throw new TypeError('network error'); };

  const res = await handleNameReading(post(token, { name: '김서연' }), env);

  assert.ok(res.status >= 400);
  assert.equal(balanceOf(db, EMAIL), 10, '차감만 남고 환불되지 않았다');
});

test('인증 없이는 볼 수 없다', async () => {
  const { env } = setup();
  const res = await handleNameReading(
    new Request('https://x/api/name-reading', { method: 'POST', body: '{}' }), env);
  assert.equal(res.status, 401);
});
