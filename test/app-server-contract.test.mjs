// 앱이 보내는 값을 서버가 그대로 받아 내는지.
//
// 지금까지 이 경계에서 세 번 깨졌다.
//   · 주제별 운세·택일: 앱은 love/이사 를 보내는데 서버는 crush/moving 을 기다렸다 (400)
//   · 신살·전생·천직·띠순위: 서버 코드에 생성기 변수가 박혀 있었다 (500)
//   · 라이프패스: 응답은 나오는데 화면이 못 그렸다
// 세 번 다 "앱 따로, 서버 따로" 테스트해서 놓쳤다. 사이를 이어 봐야 잡힌다.
//
// fixtures/mini-requests.json 은 실제 미니앱을 브라우저에서 눌러 받아 적은 요청이다.
// (tools/capture-mini-requests.mjs 로 다시 뜬다)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const REQUESTS = JSON.parse(readFileSync(join(HERE, 'fixtures', 'mini-requests.json'), 'utf8'));

// ⚠️ 녹화해 둔 요청 안의 **날짜는 썩는다.** fixture 는 앱이 실제로 보내는 모양을
//    붙잡아 둔 것이라 귀하지만, `from: '2026-09-15'` 같은 값은 달력이 넘어가는
//    순간 서버가 거절한다(택일은 「오늘부터 2년 안」만 받는다). 2026-10-13 에
//    실제로 그 일이 났다 — 코드는 멀쩡했고 날짜만 지났는데 시험이 빨개졌다.
//
//    모양은 그대로 두고 **지난 날짜만 오늘로 되살린다.** fixture 를 고치면
//    다음에 다시 녹화할 때 되돌아오므로, 읽는 자리에서 처리한다.
// ⚠️ **KST 로 센다.** 어제 이 자리를 `new Date().toISOString()` 으로 썼다가
//    오늘 아침 다시 빨개졌다 — 한국 아침이면 UTC 는 아직 어제라, 서버가
//    「오늘(KST)부터」로 재는 창보다 하루 뒤처진 날짜를 보냈다.
//    서버가 _kstToday() 로 재니 여기도 같은 자로 재야 한다.
const 오늘 = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
for (const r of REQUESTS) {
  for (const [k, v] of Object.entries(r.body || {})) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && v < 오늘) r.body[k] = 오늘;
  }
}

// 라우터에서 경로 → 핸들러 이름을 읽어 온다. 손으로 적으면 라우트가 바뀔 때 어긋난다.
//
// 라우트는 두 모양이다. 한 줄짜리와, 앞에 사전 검사(속도 제한 등)가 붙은 여러 줄짜리.
// 뒤엣것도 잡아야 /saju-reading 처럼 블록으로 쓴 것을 놓치지 않는다.
function handlerFor(path) {
  const esc = path.replace(/[/\-.]/g, m => '\\' + m);
  const at = SRC.search(new RegExp(`path === '${esc}'`));
  if (at < 0) return null;
  // 그 라우트가 끝나기 전까지(다음 if (path === … 전까지)에서 부르는 핸들러를 찾는다.
  const next = SRC.slice(at + 10).search(/\n\s*if \(path === /);
  const span = SRC.slice(at, next < 0 ? at + 600 : at + 10 + next);
  const m = span.match(/(?:await )?(handle\w+)\(request, env\)/);
  return m ? m[1] : null;
}

const paths = [...new Set(REQUESTS.map(r => r.path.split('?')[0]))];
const names = [...new Set(paths.map(handlerFor).filter(Boolean))];
const H = await loadWorker([...names, 'createSessionToken']);

const SECRET = 'contract-secret';
const EMAIL = 'contract@example.com';
const MINI_KEY = 'CI-CONTRACT';
const realFetch = globalThis.fetch;

// /mini/api/* 는 미니앱 세션(subject 가 'mini:<userKey>')으로만 열린다.
// 웹 토큰으로 부르면 401 이 나는데, 그건 계정 계층이 제대로 나뉘어 있다는 뜻이다.
const isMini = (path) => path.startsWith('/mini/');

// ⚠️ 날짜를 박아 두지 않는다. 택일은 서버가 「오늘부터 2년 안」만 받으므로,
//    박아 둔 날짜는 **시간이 지나면 저절로 썩는다.** 실제로 '2026-09-15' 를
//    적어 뒀다가 2026-10-13 에 400 이 나서 시험이 빨개졌다 — 코드는 멀쩡했고
//    달력만 넘어갔을 뿐이다. 오늘에서 세어 만든다.
const 서른날뒤 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

const JSON_REPLY = JSON.stringify({
  color: { name: '쪽빛', why: 'x' }, food: { name: '들깨국수', why: 'y' },
  song: { title: '아침 이슬', artist: '양희은', why: 'z' }, item: { name: '나무 팔찌', why: 'w' },
  picks: [서른날뒤],
});

function setup() {
  const { db, DB } = createD1();
  db.prepare(
    `INSERT INTO payment_requests (id,user_email,pkg,amount,tokens,status,approved_at)
     VALUES ('seed',?,'t',0,999,'approved',unixepoch())`
  ).run(EMAIL);
  // 미니앱 쪽 계정도 함께 만든다. 원장이 따로라 엽전도 따로 넣어야 한다.
  db.prepare(
    `INSERT INTO mini_payment_requests (id,user_key,pkg,amount,tokens,status,approved_at)
     VALUES ('seed',?,'t',0,999,'approved',unixepoch())`
  ).run(MINI_KEY);
  db.prepare(
    `INSERT INTO mini_users (user_key,name,birth_year,birth_month,birth_day,birth_hour,gender)
     VALUES (?,?,?,?,?,?,?)`
  ).run(MINI_KEY, '안태현', 1999, 7, 18, '사시', 'M');
  globalThis.fetch = async (url, opts, ...rest) => {
    if (String(url).includes('generativelanguage')) {
      const wantsJson = /JSON|json/.test(String(opts?.body || ''));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: wantsJson ? JSON_REPLY : '안도령이 이르되.\n\n둘째 문단.' }] } }],
      }), { status: 200 });
    }
    return realFetch(url, opts, ...rest);
  };
  return { db, env: { SESSION_SECRET: SECRET, GEMINI_API_KEY: 'k', DB } };
}

test('받아 적은 요청이 비어 있지 않다', () => {
  assert.ok(REQUESTS.length >= 20,
    `요청이 ${REQUESTS.length} 건뿐이다 — 받아 적기가 제대로 안 됐는지 확인할 것`);
});

for (const req of REQUESTS) {
  const path = req.path.split('?')[0];
  const name = handlerFor(path);

  test(`${path} — 앱이 보내는 값을 서버가 받는다`, async (t) => {
    if (!name) {
      // 라우터에 없으면 앱이 죽은 경로를 부르고 있다는 뜻이다.
      assert.fail(`${path} 를 다루는 핸들러가 라우터에 없다 — 앱이 없는 곳을 부른다`);
    }
    if (!H[name]) { t.skip(`${name} 을 꺼내지 못했다`); return; }

    const { env } = setup();
    const errs = [];
    const realErr = console.error;
    console.error = (...a) => errs.push(a.map(String).join(' '));
    try {
      const token = await H.createSessionToken(isMini(path) ? `mini:${MINI_KEY}` : EMAIL, env);
      const r = new Request('https://x' + req.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(req.body),
      });
      const res = await H[name](r, env);
      const text = await res.text();
      assert.equal(res.status, 200,
        `${res.status}: ${text.slice(0, 160)}${errs.length ? ' / 콘솔: ' + errs.join(' | ') : ''}`);
      const data = JSON.parse(text);
      const meat = Object.keys(data).filter(k => !['success', 'ok', 'remaining', 'tokens'].includes(k));
      assert.ok(meat.length > 0, `알맹이 없이 껍데기만 왔다: ${text.slice(0, 120)}`);
    } finally {
      console.error = realErr;
      globalThis.fetch = realFetch;
    }
  });
}

test('앱이 부르는 경로가 전부 라우터에 있다', () => {
  const missing = paths.filter(p => !handlerFor(p));
  assert.deepEqual(missing, [], `라우터에 없는 경로: ${missing.join(', ')}`);
});
