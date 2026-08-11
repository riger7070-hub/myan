// 오행 퀴즈 테스트.
//
// 여기가 틀리면 사용자는 정답을 골랐는데 오답 처리된다. 그리고 하루 한 번뿐이라
// 다시 시도할 수도 없다. 특히 보기 순서를 섞어 놓고 채점 때 되돌리는 구간은
// 한 칸만 어긋나도 조용히 전부 오답이 된다.
//
// 문제 은행 자체도 함께 지킨다. 사주 상식을 다루는 콘텐츠라 정답이 틀리면
// 서비스 신뢰가 깨진다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');

const { handleMiniQuiz, handleMiniQuizSubmit, createSessionToken } = await loadWorker([
  'handleMiniQuiz', 'handleMiniQuizSubmit', 'createSessionToken',
]);

const SECRET = 'mini-quiz-test-secret';
const USER = 'UK-QUIZ';

async function setup() {
  const { db, DB } = createD1();
  const env = { DB, SESSION_SECRET: SECRET };
  const session = await createSessionToken(`mini:${USER}`, env);
  const auth = { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' };
  const get = () => handleMiniQuiz(new Request('https://x/mini/api/quiz', { headers: auth }), env);
  const post = (body) => handleMiniQuizSubmit(new Request('https://x/mini/api/quiz', {
    method: 'POST', headers: auth, body: JSON.stringify(body),
  }), env);
  return { db, env, get, post };
}

/** 문제 은행을 소스에서 그대로 꺼낸다(정답까지 알아야 만점을 낼 수 있다). */
function bank() {
  const a = worker.indexOf('const MINI_QUIZ_BANK = [');
  const b = worker.indexOf('\nconst MINI_QUIZ_COUNT', a);
  // eslint-disable-next-line no-eval
  return eval(worker.slice(a, b).replace('const MINI_QUIZ_BANK =', ''));
}

test('문제 은행이 형식을 지킨다', () => {
  const B = bank();
  assert.ok(B.length >= 30, `문항이 ${B.length}개뿐이다 — 며칠이면 다 본다`);
  for (const item of B) {
    assert.ok(item.q && item.why, `문제나 해설이 비었다: ${item.q}`);
    assert.equal(item.c.length, 4, `보기가 4개가 아니다: ${item.q}`);
    assert.equal(new Set(item.c).size, 4, `보기가 중복이다: ${item.q}`);
    assert.ok(Number.isInteger(item.a) && item.a >= 0 && item.a < 4, `정답 번호가 이상하다: ${item.q}`);
  }
  const qs = B.map(x => x.q);
  assert.equal(new Set(qs).size, qs.length, '같은 문제가 두 번 들어 있다');
});

test('문제를 낼 때 정답을 함께 내려보내지 않는다', async () => {
  const { get } = await setup();
  const body = await (await get()).json();
  assert.equal(body.questions.length, 3);
  for (const q of body.questions) {
    assert.deepEqual(Object.keys(q).sort(), ['c', 'q'], '문제에 정답이 섞여 나간다');
  }
  assert.ok(body.payload && body.sig, '서명이 없다');
});

test('보기 순서를 섞어도 정답을 고르면 만점이다', async () => {
  // 이 테스트가 없으면 섞기/되돌리기가 한 칸 어긋나도 아무도 모른다.
  const B = bank();
  const { get, post } = await setup();
  const q = await (await get()).json();

  // 화면에 보이는 보기 중 정답 문구가 몇 번째인지 찾아서 고른다.
  const answers = q.questions.map((item) => {
    const src = B.find(x => x.q === item.q);
    return item.c.indexOf(src.c[src.a]);
  });
  assert.ok(answers.every(i => i >= 0), '정답 문구가 보기에 없다 — 섞기가 깨졌다');

  const r = await (await post({ payload: q.payload, sig: q.sig, answers })).json();
  assert.equal(r.allRight, true, '정답을 골랐는데 만점이 아니다');
  assert.equal(r.granted, true);
  assert.equal(r.tokens, 1);
});

test('오답을 고르면 보상이 없고, 정답 위치를 알려준다', async () => {
  const B = bank();
  const { get, post } = await setup();
  const q = await (await get()).json();

  // 일부러 정답이 아닌 자리를 고른다.
  const answers = q.questions.map((item) => {
    const src = B.find(x => x.q === item.q);
    const right = item.c.indexOf(src.c[src.a]);
    return (right + 1) % 4;
  });

  const r = await (await post({ payload: q.payload, sig: q.sig, answers })).json();
  assert.equal(r.allRight, false);
  assert.equal(r.granted, false);
  // 해설 화면이 '정답은 ○○' 를 보여주려면 화면에 보인 자리를 받아야 한다.
  r.results.forEach((res, i) => {
    const src = B.find(x => x.q === q.questions[i].q);
    assert.equal(q.questions[i].c[res.answer], src.c[src.a], '알려준 정답 위치가 틀렸다');
  });
});

test('서명이 없거나 변조되면 채점하지 않는다', async () => {
  const { get, post } = await setup();
  const q = await (await get()).json();

  for (const body of [
    { payload: q.payload, sig: 'deadbeef', answers: [0, 0, 0] },
    { payload: '0.0123,1.0123,2.0123', sig: q.sig, answers: [0, 0, 0] },
    { payload: q.payload, answers: [0, 0, 0] },
  ]) {
    const res = await post(body);
    assert.equal(res.status, 400, `${JSON.stringify(body).slice(0, 40)} 가 통과했다`);
  }
});

test('만점이어도 하루 한 번만 지급한다', async () => {
  const B = bank();
  const { db, get, post } = await setup();
  const solve = async () => {
    const q = await (await get()).json();
    const answers = q.questions.map((item) => {
      const src = B.find(x => x.q === item.q);
      return item.c.indexOf(src.c[src.a]);
    });
    return (await post({ payload: q.payload, sig: q.sig, answers })).json();
  };

  const first = await solve();
  const second = await solve();
  assert.equal(first.granted, true);
  assert.equal(second.allRight, true, '두 번째도 만점이어야 한다');
  assert.equal(second.granted, false, '두 번째에도 토큰이 나갔다');

  const bal = db.prepare(
    `SELECT COALESCE(SUM(tokens),0) b FROM mini_payment_requests WHERE user_key=? AND status='approved'`
  ).get(USER).b;
  assert.equal(Number(bal), 1, '지급이 중복됐다');
});
