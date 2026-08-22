// 웹이 서버 응답에서 "값"을 제대로 꺼내는지.
//
// 미니앱에만 있던 콘텐츠 11종을 웹으로 옮기면서, 웹에도 미니앱의 extractResult 와
// 같은 일을 하는 _readingFacts 가 생겼다. 이 함수는 서버가 주는 필드 이름을 손으로
// 적어 둔 것이라(d.mine.rank, d.wealthYears[].feeds …) **한 글자만 틀려도** 조용히
// 아무것도 안 그린다. 산문은 멀쩡히 나오므로 화면은 정상으로 보이고, 없어진 것은
// "당신의 귀인은 소띠와 양띠입니다" 같은 그 화면의 알맹이뿐이다.
//
// 그래서 구조 검사가 아니라 **실제 핸들러를 불러 그 JSON 을 먹인다**. 서버가 필드
// 이름을 바꾸면 여기서 걸린다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');

// app.js 전체는 평가할 수 없다(브라우저 전역 투성이). 필요한 두 함수만 떼어 온다.
function grab(name) {
  const m = appSrc.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`));
  assert.ok(m, `${name} 을 app.js 에서 찾지 못했다 — 이름이 바뀌었는지 확인할 것`);
  return m[0];
}
const sandbox = { __out: null };
runInNewContext(`${grab('_escHtml')}\n${grab('_readingFacts')}\n; __out = _readingFacts;`, sandbox);
const readingFacts = sandbox.__out;

// 라벨은 화면 문구라 여기서는 알아보기 쉬운 표식으로 대신한다.
// (실제 4개국어 문구가 다 있는지는 locales-parity 가 따로 본다.)
// 표식에 <> 를 쓰면 _escHtml 이 이스케이프해서 찾을 수 없다(실제로 한 번 걸렸다).
const T = new Proxy({}, { get: (_o, p) => `L·${String(p)}` });

const HANDLERS = [
  ['handleWealth',       { birth: BIRTH(), gender: 'M' }, ['factWealthShape']],
  ['handleSinsal',       { birth: BIRTH(), gender: 'M' }, ['factSinsal']],
  ['handleGwiin',        { birth: BIRTH(), gender: 'M' }, ['factGwiinPeople', 'factGwiinYears']],
  ['handleVocation',     { birth: BIRTH(), gender: 'M' }, ['factSipsinTop']],
  ['handleDirection',    { birth: BIRTH(), gender: 'M', purpose: 'move' }, ['factGoodDir']],
  ['handleSpousePalace', { birth: BIRTH(), gender: 'M' }, ['factSpouseGung']],
  ['handleTtiRanking',   { birth: BIRTH() },              ['factMyTti']],
];

function BIRTH() { return { year: 1999, month: 7, day: 18, hour: '사시' }; }

const NAMES = HANDLERS.map(h => h[0]);
const H = await loadWorker([...NAMES, 'createSessionToken']);

const SECRET = 'facts-secret';
const EMAIL = 'facts@example.com';
const realFetch = globalThis.fetch;

function setup() {
  const { DB } = createD1();
  return { SESSION_SECRET: SECRET, GEMINI_API_KEY: 'k', DB };
}

function seed(env) {
  // 잔액이 없으면 402 가 나와 응답에 값이 실리지 않는다.
  return env.DB.prepare(
    `INSERT INTO payment_requests (id,user_email,pkg,amount,tokens,status,approved_at)
     VALUES ('seed',?,'t',0,500,'approved',unixepoch())`
  ).bind(EMAIL).run();
}

function stubGemini() {
  globalThis.fetch = async (url, opts, ...rest) => {
    if (String(url).includes('generativelanguage')) {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '안도령이 이르되, 이러합니다.\n\n두 번째 문단입니다.' }] } }],
      }), { status: 200 });
    }
    return realFetch(url, opts, ...rest);
  };
}

for (const [name, body, expectLabels] of HANDLERS) {
  test(`${name} 의 응답에서 웹이 값을 꺼낸다`, async () => {
    const env = setup();
    await seed(env);
    stubGemini();
    try {
      const token = await H.createSessionToken(EMAIL, env);
      const req = new Request('https://x/api/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lang: 'ko', ...body }),
      });
      const res = await H[name](req, env);
      const data = JSON.parse(await res.text());
      assert.equal(res.status, 200, `${name} 이 200 을 안 준다`);

      const html = readingFacts(data, T);
      assert.ok(html, `${name}: 응답에 값이 실려 있는데 웹이 한 줄도 못 꺼냈다 — 필드 이름을 확인할 것`);
      for (const label of expectLabels) {
        assert.ok(html.includes(`L·${label}`),
          `${name}: '${label}' 줄이 빠졌다 — 서버가 주는 필드와 _readingFacts 가 어긋난다`);
      }
      // 라벨만 있고 값이 비면 화면에 이름표만 남는다.
      assert.doesNotMatch(html, />\s*<\/span><span><\/span>/, `${name}: 값이 빈 줄이 있다`);
      // 필드 이름이 어긋나면 map 이 undefined 를 뱉는데, 그대로 이으면
      // "undefined, undefined" 라는 멀쩡해 보이는 문자열이 화면에 뜬다.
      // 실제로 이 검사가 없어서 방위 필드를 틀린 변형이 통과했다.
      assert.doesNotMatch(html, /undefined/, `${name}: 값 자리에 undefined 가 들어갔다`);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
}

test('모르는 필드만 있으면 아무것도 그리지 않는다', () => {
  // 값이 없을 때 빈 카드를 남기면 화면에 이유 없는 칸이 생긴다.
  assert.equal(readingFacts({ reading: '글만 왔다' }, T), '');
  assert.equal(readingFacts({ 알수없음: [1, 2, 3] }, T), '');
});

test('신살이 하나도 없으면 "없다"고 적는다', () => {
  // 빈 화면보다 낫다 — 계산이 안 된 것과 없는 것은 다르다.
  const html = readingFacts({ hits: [] }, T);
  assert.ok(html.includes('L·factSinsal'), '신살 줄 자체가 없다');
  assert.ok(html.includes('L·factNoSinsal'), '없다는 말을 안 적는다');
});

test('값은 이스케이프해서 넣는다', () => {
  const html = readingFacts({ shape: '<script>x</script>' }, T);
  assert.doesNotMatch(html, /<script>/, '값이 HTML 로 들어간다');
  assert.match(html, /&lt;script&gt;/);
});
