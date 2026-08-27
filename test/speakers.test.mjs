// 누가 풀어 주는가 — 화자가 세 곳에 적혀 있고, 어긋나면 사용자가 바로 알아챈다.
//
// 화면에는 안낭자가 서 있는데 글은 안할매가 쓴 것이 되는 상황을 막는 것이 이 파일의 일이다.
// 표가 사는 곳은 셋이다.
//   worker.js            — 실제로 글을 쓰는 인격(SPEAKERS.self)과 콘텐츠→화자 표
//   mini/src/contents.js — 미니앱 화면에 세울 얼굴과 이름
//   js/app.js            — 웹 화면에 세울 얼굴과 이름
//
// ⚠️ 표가 같은 것만으로는 부족하다. 표에 '안할매'라고 적어 놓고 핸들러가 화자를
//    안 넘기면 글은 안도령이 쓴다 — 아래 마지막 검사가 그것을 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const WORKER   = read('worker.js');
const CONTENTS = read('mini/src/contents.js');
const APP      = read('js/app.js');

/** `const 이름 = { ... };` 한 덩이를 통째로 떼어 온다(중괄호 깊이를 센다). */
function block(src, decl) {
  const at = src.indexOf(decl);
  assert.notEqual(at, -1, `${decl} 이 없다`);
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
  }
  throw new Error(`${decl} 의 끝을 못 찾았다`);
}

/** 표에서 '경로': '화자' 쌍만 뽑는다. 주석과 줄바꿈은 무시한다. */
const pairs = (b) =>
  Object.fromEntries([...b.matchAll(/'([^']+)':\s*'([a-z]+)'/g)].map((m) => [m[1], m[2]]));

/** 화자 정의에서 이름·파일·소개를 뽑는다. */
function speakers(b) {
  const out = {};
  for (const m of b.matchAll(/(\w+):\s*\{\s*name:\s*'([^']*)',\s*file:\s*'([^']*)',\s*intro:\s*'([^']*)'/g)) {
    out[m[1]] = { name: m[2], file: m[3], intro: m[4] };
  }
  return out;
}

const W_SPK = speakers(block(WORKER,   'const SPEAKERS = {'));
const C_SPK = speakers(block(CONTENTS, 'export const SPEAKERS = {'));
const A_SPK = speakers(block(APP,      'const _SPEAKERS = {'));

const W_MAP = pairs(block(WORKER,   'const FEATURE_SPEAKER = {'));
const C_MAP = pairs(block(CONTENTS, 'export const FEATURE_SPEAKER = {'));
const A_MAP = pairs(block(APP,      'const _FEATURE_SPEAKER = {'));

// ── 넷이 넷인가 ──

test('화자는 넷이고 세 곳이 같은 넷을 안다', () => {
  assert.equal(Object.keys(W_SPK).length, 4, `서버가 아는 화자가 ${Object.keys(W_SPK).length}명이다`);
  assert.deepEqual(Object.keys(C_SPK).sort(), Object.keys(W_SPK).sort(), '미니앱이 아는 화자가 다르다');
  assert.deepEqual(Object.keys(A_SPK).sort(), Object.keys(W_SPK).sort(), '웹이 아는 화자가 다르다');
});

test('⚠️ 이름·그림·소개가 세 곳에서 같다', () => {
  // 여기가 어긋나면 웹과 미니앱에서 같은 콘텐츠인데 다른 사람이 답한 것처럼 보인다.
  for (const id of Object.keys(W_SPK)) {
    assert.deepEqual(C_SPK[id], W_SPK[id], `${id}: 미니앱과 서버가 다르다`);
    assert.deepEqual(A_SPK[id], W_SPK[id], `${id}: 웹과 서버가 다르다`);
  }
});

test('그림 파일이 실제로 있고 온전하다', () => {
  for (const [id, sp] of Object.entries(W_SPK)) {
    const p = join(ROOT, sp.file.replace(/^\//, ''));
    assert.ok(existsSync(p), `${id}: ${sp.file} 이 없다`);
    const svg = readFileSync(p, 'utf8');
    // BOM 이 붙으면 브라우저가 그림을 통째로 거른다(assetlinks.json 에서 한 번 겪었다).
    assert.notEqual(svg.charCodeAt(0), 0xfeff, `${id}: ${sp.file} 에 BOM 이 붙었다`);
    assert.match(svg, /<title>([^<]+)<\/title>/, `${id}: <title> 이 없다 — 읽어 주는 기기에서 이름이 안 나온다`);
    assert.equal(svg.match(/<title>([^<]+)<\/title>/)[1], sp.name,
      `${id}: 그림 속 이름과 표의 이름이 다르다`);
  }
});

// ── 콘텐츠 → 화자 ──

test('⚠️ 콘텐츠→화자 표가 세 곳에서 같다', () => {
  assert.ok(Object.keys(W_MAP).length >= 10, `표가 ${Object.keys(W_MAP).length}줄뿐이다 — 덜 옮겼다`);
  assert.deepEqual(C_MAP, W_MAP, '미니앱 표가 서버와 다르다');
  assert.deepEqual(A_MAP, W_MAP, '웹 표가 서버와 다르다');
});

test('표에 적힌 화자가 실제로 있는 사람이다', () => {
  for (const [path, id] of Object.entries(W_MAP)) {
    assert.ok(W_SPK[id], `${path} 가 없는 화자 '${id}' 를 가리킨다`);
  }
});

test('표에 적힌 경로가 실제로 있는 경로다', () => {
  for (const path of Object.keys(W_MAP)) {
    assert.ok(WORKER.includes(`'${path}'`), `${path} 로 가는 길이 서버에 없다`);
  }
});

test('미니앱 콘텐츠 목록과 표의 경로가 맞물린다', async () => {
  // 표에 적어 둔 경로가 정작 미니앱에 없는 콘텐츠면, 그 줄은 아무 일도 하지 않는다.
  const { ALL_ITEMS, speakerOf } = await import('../mini/src/contents.js');
  const paths = new Set(ALL_ITEMS.map((i) => i.path).filter(Boolean));
  for (const path of Object.keys(W_MAP)) {
    assert.ok(paths.has(path), `${path} 는 미니앱 콘텐츠에 없다 — 표의 죽은 줄이다`);
  }
  // 표에 없는 것은 모두 안도령이어야 한다(기본값이 살아 있는지).
  const saju = ALL_ITEMS.find((i) => i.id === 'saju');
  assert.equal(speakerOf(saju).name, '안도령');
  assert.equal(speakerOf(null).name, '안도령', '콘텐츠가 없을 때 화자가 비면 화면이 깨진다');
});

// ── 표와 실제 호출이 맞는가 (여기가 핵심) ──

test('⚠️ 핸들러가 표에 적힌 화자로 글을 부른다', () => {
  // 표만 맞고 핸들러가 화자를 안 넘기면 글은 전부 안도령이 쓴다.
  // 경로 → 핸들러 이름은 라우터에서 읽고, 그 핸들러 본문에서 speaker 를 확인한다.
  for (const [path, want] of Object.entries(W_MAP)) {
    // ⚠️ 라우터는 return 바로 뒤에 핸들러를 두지 않는다 —
    //    `return withMiniOrigin(request, await handleGwiin(request, env))` 처럼 감싼다.
    //    그래서 return 을 요구하지 말고 handle 로 시작하는 첫 이름을 잡는다.
    const route = new RegExp(`path === '${path.replace(/\//g, '\\/')}'[\\s\\S]{0,400}?(handle\\w+)\\(`);
    const m = WORKER.match(route);
    assert.ok(m, `${path} 를 어느 핸들러가 맡는지 라우터에서 못 찾았다`);
    const fn = m[1];

    const at = WORKER.search(new RegExp(`(?:async )?function ${fn}\\(`));
    assert.notEqual(at, -1, `${fn} 이 없다`);
    const after = WORKER.slice(at + 20);
    const nxt = after.search(/\r?\n(?:async )?function /);
    const body = after.slice(0, nxt === -1 ? undefined : nxt);

    assert.ok(/geminiText\(/.test(body), `${fn} 이 글을 부르지 않는다 — 표에 있을 이유가 없다`);
    assert.match(body, new RegExp(`speaker:\\s*'${want}'`),
      `${fn}(${path}) 는 표에 '${want}' 로 적혀 있는데 그 화자로 부르지 않는다`);
  }
});

test('⚠️ 표에 없는 핸들러는 화자를 넘기지 않는다', () => {
  // 표에 없는데 speaker 를 넘기는 곳이 있으면, 그 콘텐츠의 화자는 아무도 모르게 바뀐 것이다.
  // ⚠️ geminiText 로 넘기는 것만 센다. 무료 페이지도 speaker 를 받지만 그건 화면에
  //    얼굴을 세우는 값이지 글을 쓰는 인격이 아니다(아래에서 따로 본다).
  const used = [...WORKER.matchAll(/geminiText\([\s\S]{0,200}?\{ speaker: '([a-z]+)' \}\)/g)]
    .map((m) => m[1]);
  assert.equal(used.length, Object.keys(W_MAP).length,
    `표는 ${Object.keys(W_MAP).length}줄인데 화자를 넘기는 자리는 ${used.length}곳이다`);
  for (const id of used) assert.ok(W_SPK[id], `없는 화자 '${id}' 를 넘기는 자리가 있다`);
});

test('무료 페이지도 있는 사람을 세운다', () => {
  // 검색으로 처음 들어오는 자리다. 여기서 얼굴이 빠지거나 없는 이름을 부르면
  // 화면에 빈 칸만 남는다.
  const at = WORKER.indexOf('function handleCalcPage(');
  assert.notEqual(at, -1, 'handleCalcPage 가 없다');
  const body = WORKER.slice(at, at + 9000);
  const used = [...body.matchAll(/^\s+speaker: '([a-z]+)',$/gm)].map((m) => m[1]);
  assert.ok(used.length >= 5, `계산기 ${used.length}개에만 화자가 있다`);
  for (const id of used) assert.ok(W_SPK[id], `무료 페이지가 없는 화자 '${id}' 를 세운다`);

  // ⚠️ 계산기마다 맡은 사람이 다르다. 예전에는 셋뿐이라 "전부 안할매" 로 못박아
  //    뒀는데, 만세력이 생기면서 그 규칙이 깨졌다 — 만세력은 액막이가 아니라 사주
  //    그 자체라 안도령 몫이다. 이제 페이지별로 본다.
  const 배정 = { samjae: 'halmae', sinsal: 'halmae', bonmyeong: 'halmae',
                 sonnal: 'halmae', manseryeok: 'doryeong' };
  for (const [kind, 누구] of Object.entries(배정)) {
    const i = body.indexOf(`\n    ${kind}: {`);
    assert.notEqual(i, -1, `${kind} 계산기가 없다`);
    const spk = /speaker: '([a-z]+)'/.exec(body.slice(i, i + 2500))?.[1];
    assert.equal(spk, 누구, `${kind} 를 ${spk} 가 맡고 있다 — ${누구} 여야 한다`);
  }

  // 그리고 화면에 실제로 그려지는지. 스펙에만 적고 템플릿에서 안 쓰면 조용히 사라진다.
  assert.match(WORKER, /\$\{speaker && SPEAKERS\[speaker\]/,
    '_freePage 가 speaker 를 받아 놓고 화면에 세우지 않는다');
});

test('⚠️ 삼재는 폼과 결과에 같은 사람이 선다', async () => {
  // 폼(/calc/samjae)에만 세우고 결과(/calc/samjae/1990)에 빠뜨리면, 계산 한 번에
  // 사람이 바뀐 것처럼 보인다. 실제로 한 번 빠져 있었다 — 결과 페이지가 나중에
  // 따로 생겼기 때문이다. 무료 페이지가 늘어날 때마다 여기 한 줄을 더한다.
  const { loadWorker } = await import('./load-worker.mjs');
  const H = await loadWorker(['handleCalcPage', 'handleSamjaeYearPage']);
  const halmae = W_SPK.halmae;

  for (const [label, res] of [
    ['폼', H.handleCalcPage('samjae')],
    ['결과', H.handleSamjaeYearPage(1990)],
  ]) {
    assert.ok(res, `삼재 ${label} 페이지가 안 나온다`);
    const html = await res.text();
    assert.ok(html.includes(halmae.file), `삼재 ${label}: ${halmae.name} 그림이 없다`);
    assert.ok(html.includes(halmae.name), `삼재 ${label}: ${halmae.name} 이름이 없다`);
  }
});

// ── 인격 ──

test('넷 다 자기 이름으로 말하고, 같은 규칙을 함께 쓴다', () => {
  const b = block(WORKER, 'const SPEAKERS = {');
  for (const [id, sp] of Object.entries(W_SPK)) {
    assert.ok(b.includes(sp.name), `${id}: self 에 자기 이름이 없다`);
  }
  // 말투는 달라도 풀이하는 법과 금칙은 하나여야 한다.
  assert.match(WORKER, /const _VOICE_COMMON = `/, '공통 규칙이 없다');
  const common = WORKER.slice(WORKER.indexOf('const _VOICE_COMMON = `'));
  assert.ok(common.includes('JSON 만 출력한다'),
    'JSON 예외가 빠졌다 — 럭키 아이템처럼 JSON 을 받는 콘텐츠의 파싱이 깨진다');
  assert.ok(common.includes('AI 나 모델이라 부르지 않는다'), 'AI 라 부르지 말라는 금칙이 빠졌다');
});

test('화자를 못 찾아도 풀이가 멈추지 않는다', () => {
  assert.match(WORKER, /function speakerSI\(id\)\s*\{\s*return _SI\[id\] \|\| _SI\[DEFAULT_SPEAKER\]/,
    '모르는 화자가 오면 기본값으로 떨어지지 않는다');
});

// ── 정말로 그 사람이 말하는가 ──
//
// 여기까지는 전부 소스를 읽어 대조한 것이다. "그렇게 적혀 있다"와 "그렇게 나간다"는
// 다르다 — 표도 맞고 speaker 도 넘기는데 geminiText 가 그 값을 버리면 아무도 모른다.
// 그래서 핸들러를 **실제로 불러**, Gemini 로 나가는 인격을 가로채 확인한다.
// (하네스는 handlers-smoke.test.mjs 와 같은 방식이다.)

import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const BIRTH = { year: 1999, month: 7, day: 18, hour: '사시' };
const PARTNER = { year: 1997, month: 4, day: 9, hour: '오시' };

// 표에 오른 열셋을 전부 부른다. 입력이 필요한 것은 채워 준다.
const CALLS = {
  handleCompatTiming:        { p1: { ...BIRTH, name: '나' }, p2: PARTNER },
  handleIntimacy:            { birth: BIRTH, partner: PARTNER, gender: 'M' },
  handleTypeCompat:          { myType: '木', partnerType: '火' },
  handleSpousePalace:        { birth: BIRTH, gender: 'M' },
  handleSinsal:              { birth: BIRTH, gender: 'M' },
  handleTojeong:             { birth: BIRTH },
  handleDreamInterpretation: { dream: '맑은 물에서 잉어를 봤어요' },
  handleIching:              { question: '이직해도 될까요' },
  handleAuspiciousDays:      { purpose: 'wedding', birth: BIRTH, days: 30 },
  handleDirection:           { birth: BIRTH, gender: 'M', purpose: 'move' },
  handlePastLife:            { birth: BIRTH, gender: 'M' },
  handleGwiin:               { birth: BIRTH, gender: 'M' },
  handleLuckyPicks:          { birth: BIRTH },
  // 표에 없는 것도 하나 넣는다 — 기본값(안도령)이 살아 있는지 함께 본다.
  handleWealth:              { birth: BIRTH, gender: 'M' },
};

const EXPECT = { handleWealth: '안도령' };   // 나머지는 표에서 끌어온다

const HH = await loadWorker([...Object.keys(CALLS), 'createSessionToken']);
const EMAIL = 'speaker@example.com';
const realFetch = globalThis.fetch;

const JSON_REPLY = JSON.stringify({
  color: { name: '쪽빛', why: '물의 기운을 돕습니다' },
  food:  { name: '들깨국수', why: '속을 데워 줍니다' },
  song:  { title: '아침 이슬', artist: '양희은', why: '마음을 가라앉힙니다' },
  item:  { name: '나무 팔찌', why: '기운을 붙듭니다' },
});

for (const [fn, body] of Object.entries(CALLS)) {
  test(`⚠️ ${fn} 을 부르면 정해진 사람이 말한다`, async () => {
    // 이 핸들러가 맡은 경로를 라우터에서 찾아, 표가 말하는 화자를 구한다.
    let want = EXPECT[fn];
    if (!want) {
      // ⚠️ 줄 단위로 찾는다. 앞뒤 400자를 훑었더니 라우터의 이웃 줄까지 창에 들어와
      //    엉뚱한 경로가 잡혔다(handleGwiin 이 /api/compat-timing 것으로 읽혔다).
      //    라우터는 경로 하나가 한 줄이므로 같은 줄에서만 찾으면 어긋날 일이 없다.
      const line = WORKER.split(/\r?\n/).find(
        (l) => l.includes("path === '") && new RegExp(`\\b${fn}\\(`).test(l));
      const path = line && (line.match(/path === '([^']+)'/) || [])[1];
      assert.ok(path, `${fn} 이 맡는 경로를 못 찾았다`);
      want = W_SPK[W_MAP[path]].name;
    }

    const { db, DB } = createD1();
    db.prepare(
      `INSERT INTO payment_requests (id,user_email,pkg,amount,tokens,status,approved_at)
       VALUES ('seed',?,'t',0,500,'approved',unixepoch())`
    ).run(EMAIL);
    const env = { SESSION_SECRET: 'spk', GEMINI_API_KEY: 'k', DB };

    let sentSI = null;
    globalThis.fetch = async (url, opts, ...rest) => {
      if (String(url).includes('generativelanguage')) {
        try { sentSI = JSON.parse(opts.body).systemInstruction?.parts?.[0]?.text || ''; } catch { sentSI = ''; }
        const wantsJson = /JSON|json/.test(String(opts?.body || ''));
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: wantsJson ? JSON_REPLY : '이르되, 이러합니다.\n\n둘째 문단입니다.' }] } }],
        }), { status: 200 });
      }
      return realFetch(url, opts, ...rest);
    };

    try {
      const token = await HH.createSessionToken(EMAIL, env);
      const res = await HH[fn](new Request('https://x/api/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lang: 'ko', ...body }),
      }), env);
      assert.equal(res.status, 200, `${res.status} 가 나왔다: ${(await res.text()).slice(0, 140)}`);

      assert.ok(sentSI, `${fn} 이 Gemini 를 부르지 않았다 — 화자를 확인할 수 없다`);
      const who = (sentSI.match(/너는 "?([가-힣]+)/) || [])[1];
      assert.equal(who, want, `${fn} 은 ${want} 몫인데 ${who} 가 말했다`);
      // 말투가 갈려도 풀이하는 법은 넷이 같아야 한다.
      assert.ok(sentSI.includes('쉬운 말'), `${fn}: 공통 규칙이 안 붙어 나갔다`);
      assert.ok(sentSI.includes('JSON 만 출력한다'), `${fn}: JSON 예외가 안 붙어 나갔다`);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
}
