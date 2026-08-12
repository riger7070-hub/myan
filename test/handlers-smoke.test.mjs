// 유료 콘텐츠 핸들러를 하나씩 실제로 불러 본다.
//
// 실제로 당했다. 핸들러를 스크립트로 찍어 내면서 생성기 쪽 변수(NL)가 코드에 그대로
// 박혔고, 신살·전생·천직·띠순위 넷이 전부 "풀이 중 오류가 발생했습니다" 만 내놓았다.
// 구문 검사도 통과하고(이름은 문법상 멀쩡하다) 다른 테스트도 다 통과했다 —
// 핸들러를 **부르지 않았기 때문**이다.
//
// 그래서 여기서는 계산이나 문구를 보지 않는다. 그냥 부른다. 200 이 나오면 된다.
// 새 콘텐츠를 넣을 때 이 목록에 한 줄 더하는 것을 잊지 않도록, 개수도 함께 센다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'worker.js'), 'utf8');

const BIRTH = { year: 1999, month: 7, day: 18, hour: '사시' };
const PARTNER = { year: 1997, month: 4, day: 9, hour: '오시' };

// [핸들러 이름, 보낼 값]
const CASES = [
  ['handleSinsal',      { birth: BIRTH, gender: 'M' }],
  ['handlePastLife',    { birth: BIRTH, gender: 'M' }],
  ['handleVocation',    { birth: BIRTH, gender: 'M' }],
  ['handleTtiRanking',  { birth: BIRTH }],
  ['handleWealth',      { birth: BIRTH, gender: 'M' }],
  ['handleDirection',   { birth: BIRTH, gender: 'M', purpose: 'move' }],
  ['handleNaming',      { birth: BIRTH, gender: 'M', surname: '김' }],
  ['handleIntimacy',    { birth: BIRTH, partner: PARTNER, gender: 'M' }],
  ['handleYearLuck',    { birth: BIRTH, gender: 'M' }],
  ['handleSpousePalace', { birth: BIRTH, gender: 'M' }],
  ['handleDaeun',       { birth: BIRTH, gender: 'M' }],
  ['handleNumerology',  { birth: BIRTH }],
  ['handleTojeong',     { birth: BIRTH }],
  ['handleTarotDraw',   {}],
  ['handleIching',      { question: '이직해도 될까요' }],
  ['handleRuneReading', {}],
  // 입력을 받는 것들도 그 입력을 채워 불러 본다. 안 불러 보면 여기서만 터진다.
  ['handleNameReading',   { name: '안태현', birth: BIRTH }],
  ['handleDreamInterpretation', { dream: '맑은 물에서 잉어를 봤어요' }],
  ['handleAuspiciousDays', { purpose: 'wedding', birth: BIRTH, days: 30 }],
  ['handleCompatTiming',  { p1: { ...BIRTH, name: '나' }, p2: PARTNER }],
  ['handleTypeCompat',    { myType: '木', partnerType: '火' }],
  ['handleFortuneTopic',  { topic: 'crush', birth: BIRTH }],
  ['handleAstroTransit',  { birth: BIRTH }],
  ['handleZodiacFortune', { birth: BIRTH }],
  ['handleLuckyPicks',    { birth: BIRTH }],
  ['handleLottoNumbers',  { birth: BIRTH }],
];

const NAMES = CASES.map(c => c[0]);
const H = await loadWorker([...NAMES, 'createSessionToken']);

const SECRET = 'smoke-secret';
const EMAIL = 'smoke@example.com';

function setup() {
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO payment_requests (id,user_email,pkg,amount,tokens,status,approved_at)
     VALUES ('seed',?,'t',0,500,'approved',unixepoch())`
  ).run(EMAIL);
  return { db, env: { SESSION_SECRET: SECRET, GEMINI_API_KEY: 'k', DB } };
}

const realFetch = globalThis.fetch;

// 대부분은 산문을 받지만, 럭키 아이템처럼 JSON 을 받아 파싱하는 핸들러도 있다.
// 프롬프트가 JSON 을 요구하면 JSON 으로 답해 준다 — 아니면 그 핸들러만 422 가 된다.
const JSON_REPLY = JSON.stringify({
  color: { name: '쪽빛', why: '물의 기운을 돕습니다' },
  food: { name: '들깨국수', why: '속을 데워 줍니다' },
  song: { title: '아침 이슬', artist: '양희은', why: '마음을 가라앉힙니다' },
  item: { name: '나무 팔찌', why: '기운을 붙듭니다' },
});

function stubGemini() {
  globalThis.fetch = async (url, opts, ...rest) => {
    if (String(url).includes('generativelanguage')) {
      let wantsJson = false;
      try { wantsJson = /JSON|json/.test(String(opts?.body || '')); } catch { /* 본문이 없으면 산문 */ }
      const text = wantsJson
        ? JSON_REPLY
        : '안도령이 이르되, 이러합니다.\n\n두 번째 문단입니다.';
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }],
      }), { status: 200 });
    }
    return realFetch(url, opts, ...rest);
  };
}

for (const [name, body] of CASES) {
  test(`${name} 이 실제로 200 을 돌려준다`, async () => {
    const { env } = setup();
    stubGemini();
    const errs = [];
    const realErr = console.error;
    console.error = (...a) => errs.push(a.map(String).join(' '));
    try {
      const token = await H.createSessionToken(EMAIL, env);
      const req = new Request('https://x/api/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lang: 'ko', ...body }),
      });
      const res = await H[name](req, env);
      const text = await res.text();
      assert.equal(res.status, 200,
        `${res.status} 이 나왔다: ${text.slice(0, 140)}${errs.length ? ' / 콘솔: ' + errs.join(' | ') : ''}`);
      const data = JSON.parse(text);
      // 돌려주는 모양은 콘텐츠마다 다르다(글, 뽑은 항목, 목록…).
      // 껍데기(success·remaining)만 오고 알맹이가 없는 것만 잡는다.
      const meat = Object.keys(data).filter(k => !['success', 'ok', 'remaining'].includes(k));
      assert.ok(meat.length > 0, `알맹이 없이 껍데기만 왔다: ${text.slice(0, 120)}`);
      if (typeof data.reading === 'string') {
        assert.ok(data.reading.length > 5, '풀이가 비었다');
      }
      assert.equal(typeof data.remaining, 'number', '잔액을 안 돌려준다');
    } finally {
      console.error = realErr;
      globalThis.fetch = realFetch;
    }
  });
}

test('새 콘텐츠를 넣고 이 목록에 더하는 것을 잊지 않았는지', () => {
  // 엽전을 빼는 핸들러는 전부 여기서 한 번은 불려야 한다.
  const paid = [...SRC.matchAll(/^async function (\w+)\(request, env\)/gm)]
    .map((m, i, all) => {
      const end = all[i + 1] ? all[i + 1].index : SRC.length;
      return { name: m[1], span: SRC.slice(m.index, end) };
    })
    .filter(x => /await accountSpend\(env, acct, /.test(x.span))
    .map(x => x.name);

  // 여기서 부를 수 없는 것만 뺀다.
  //   photo   사진 파일이 있어야 한다
  //   detail  웹 전용 대화 흐름이라 앞선 상태가 필요하다
  //   today   미니앱 전용이고 mini_users 에 프로필이 저장돼 있어야 한다
  const 예외 = new Set(['handlePhotoReading', 'handleDetailReading', 'handleMiniDailyFortune']);
  const missing = paid.filter(n => !NAMES.includes(n) && !예외.has(n));
  assert.deepEqual(missing, [],
    `이 파일에서 한 번도 안 불러 본 유료 핸들러: ${missing.join(', ')} — CASES 에 더할 것`);
});
