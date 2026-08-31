// 제미나이가 잠깐 막혔을 때 다시 걸어 본다.
//
// ⚠️ 왜 필요한가: 원장을 세어 보니 유료 콘텐츠 77번 시도에 37번이 환불이었다(48%).
//    엽전을 내고 아무것도 못 받았다는 뜻이다. 실패가 몰려서 터졌다 — 하루 종일 되는
//    날과 하나도 안 되는 날이 갈렸으니 잠깐 막히는 종류(429·503)다.
//
//    그때까지 geminiText 는 한 번 걸어 보고 실패하면 그대로 빈 글자를 돌려줬고,
//    부르는 쪽은 그걸 실패로 보고 엽전을 돌려줬다. **사용자에게는 그냥 안 되는 앱이다.**

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { geminiText } = await loadWorker(['geminiText']);

const 본문 = (t) => ({ candidates: [{ content: { parts: [{ text: t }] } }] });

/** fetch 를 흉내 낸다. 정해 둔 답을 차례로 내주고, 몇 번 불렸는지 센다. */
function 가짜fetch(답들) {
  const 부른것 = [];
  globalThis.fetch = async () => {
    const i = 부른것.length;
    부른것.push(1);
    const a = 답들[Math.min(i, 답들.length - 1)];
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return 부른것;
}

const 원래fetch = globalThis.fetch;
const env = { GEMINI_API_KEY: 'k' };

test('한 번에 되면 한 번만 부른다', async () => {
  const n = 가짜fetch([{ status: 200, body: 본문('좋은 글') }]);
  const t = await geminiText(env, '무엇');
  assert.match(t, /좋은 글/);
  assert.equal(n.length, 1, '잘 됐는데 또 불렀다');
  globalThis.fetch = 원래fetch;
});

test('429 로 막히면 다시 걸어 본다', async () => {
  // 분당 한도에 걸린 경우. 잠깐 뒤에는 대개 풀린다.
  const n = 가짜fetch([
    { status: 429, body: { error: { status: 'RESOURCE_EXHAUSTED', message: '한도' } } },
    { status: 200, body: 본문('두 번째에 나온 글') },
  ]);
  const t = await geminiText(env, '무엇');
  assert.match(t, /두 번째에 나온 글/, '다시 안 걸었다 — 엽전만 나가고 글은 안 나온다');
  assert.equal(n.length, 2);
  globalThis.fetch = 원래fetch;
});

test('503 으로 밀려도 다시 걸어 본다', async () => {
  const n = 가짜fetch([
    { status: 503, body: {} },
    { status: 503, body: {} },
    { status: 200, body: 본문('세 번째에 나온 글') },
  ]);
  const t = await geminiText(env, '무엇');
  assert.match(t, /세 번째에 나온 글/);
  assert.equal(n.length, 3);
  globalThis.fetch = 원래fetch;
});

test('끝까지 막히면 포기하되 무한히 걸지는 않는다', async () => {
  const n = 가짜fetch([{ status: 429, body: {} }]);
  const t = await geminiText(env, '무엇');
  assert.equal(t, '', '실패인데 글이 나왔다');
  assert.equal(n.length, 3, `${n.length}번 불렀다 — 세 번(첫 시도 + 재시도 둘)이어야 한다`);
  globalThis.fetch = 원래fetch;
});

test('400 은 다시 걸지 않는다 (다시 걸어도 같다)', async () => {
  // 프롬프트가 잘못된 경우다. 되풀이해 봐야 시간만 쓴다.
  const n = 가짜fetch([{ status: 400, body: { error: { message: '나쁜 요청' } } }]);
  assert.equal(await geminiText(env, '무엇'), '');
  assert.equal(n.length, 1, '고쳐지지 않을 오류에 다시 걸었다');
  globalThis.fetch = 원래fetch;
});

test('403 도 다시 걸지 않는다 (열쇠 문제)', async () => {
  const n = 가짜fetch([{ status: 403, body: {} }]);
  assert.equal(await geminiText(env, '무엇'), '');
  assert.equal(n.length, 1);
  globalThis.fetch = 원래fetch;
});

test('시간 초과에는 다시 걸지 않는다', async () => {
  // ⚠️ 45초를 이미 기다린 사람에게 또 45초를 물릴 수 없다.
  const e = new Error('The operation was aborted due to timeout');
  e.name = 'TimeoutError';
  const n = 가짜fetch([e]);
  assert.equal(await geminiText(env, '무엇'), '');
  assert.equal(n.length, 1, '시간 초과에 다시 걸었다 — 사람이 두 배로 기다린다');
  globalThis.fetch = 원래fetch;
});

test('200 인데 본문이 비면 다시 걸지 않는다', async () => {
  // 안전 필터나 길이 제한이라 다시 걸어도 같은 답이 온다.
  const n = 가짜fetch([{ status: 200, body: { candidates: [{ finishReason: 'SAFETY' }] } }]);
  assert.equal(await geminiText(env, '무엇'), '');
  assert.equal(n.length, 1);
  globalThis.fetch = 원래fetch;
});
