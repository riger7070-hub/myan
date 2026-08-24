// 미니앱으로 보내는 한 자리(/app)와, 어디서 왔는지 세는 것(/api/hit).
//
// 홍보 글에 붙일 주소가 필요했다. 딥링크(intoss://myan)를 그대로 붙이면 토스가
// 깔린 기기에서만 열리고, 안 깔린 사람이 누르면 아무 일도 안 일어난다.
//
// 세는 쪽은 선을 넘지 않는 것이 핵심이다. 채널을 견주려고 두는 것이지
// 사람을 따라다니려는 것이 아니다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const H = await loadWorker(['handleAppLanding', 'handleHit', 'handleHitsReport']);

const page = (url = 'https://myan.example/app') => H.handleAppLanding(new Request(url));

// ── /app ──

test('토스가 없는 사람도 갈 곳이 있다', async () => {
  const html = await page().text();
  assert.match(html, /토스에서 열기/, '앱으로 가는 버튼이 없다');
  assert.match(html, /href="\/"/, '웹으로 가는 길이 없다');
  assert.match(html, /토스가 없으셔도/, '없는 사람에게 아무 말도 안 한다');
});

test('⚠️ 서버가 딥링크로 던지지 않는다', async () => {
  // intoss:// 로 302 를 쏘면 토스가 없는 기기의 브라우저는 "알 수 없는 주소"만
  // 띄우고 끝이다. 페이지를 먼저 보여준 뒤 스크립트가 열어 봐야 안내가 남는다.
  const res = page();
  assert.equal(res.status, 200, `${res.status} 로 답한다 — 리다이렉트를 쓰고 있다`);
  assert.equal(res.headers.get('Location'), null, 'Location 헤더로 던지고 있다');
});

test('⚠️ 딥링크가 아니라 토스가 준 공유 주소를 쓴다', async () => {
  // intoss:// 는 토스가 깔린 폰에서만 열린다 — PC 에서는 그냥 죽는다.
  // toss 가 만들어 준 공유 주소는 onelink 를 거쳐서, 앱이 있으면 앱으로
  // 없으면 설치 안내로, PC 에서도 웹 페이지로 열린다. 커뮤니티 글은 대개 PC 로 읽는다.
  const html = await page().text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(script, { filename: 'app-landing.js' });   // 문법부터 확인
  assert.match(SRC, /const MINI_SHARE_LINK = 'https:\/\//, '공유 주소가 없다');
  const link = SRC.match(/const MINI_SHARE_LINK = '([^']+)'/)[1];
  assert.ok(html.includes(link), '페이지가 공유 주소를 안 쓴다');
  assert.doesNotMatch(script, /location\.href = ['"]intoss:/,
    '아직 딥링크로 던진다 — PC 에서 죽는다');
});

test('스크립트가 죽어도 링크는 눌린다', async () => {
  // 홍보 글에서 온 사람을 스크립트 하나에 걸지 않는다.
  const html = await page().text();
  const link = SRC.match(/const MINI_SHARE_LINK = '([^']+)'/)[1];
  assert.match(html, new RegExp(`<a id="open"[^>]*href="${link.replace(/[/.]/g, '\\$&')}"`),
    '여는 자리가 <a href> 가 아니다 — 스크립트가 죽으면 아무 데도 못 간다');
});

test('PC 로 보면 폰으로 옮겨 갈 길을 준다', async () => {
  const html = await page().text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.match(script, /mobile/, '기기를 가리지 않는다');
  assert.match(html, /id="desk"/, 'PC 용 안내 자리가 없다');
  assert.match(html, /qr-app\.png/, 'QR 이 없다');
  assert.match(html, /id="copy"/, '주소를 복사할 길이 없다');
  // QR 은 미리 그려 둔 것을 쓴다. 사용자 브라우저에서 남의 스크립트를 받지 않는다.
  assert.doesNotMatch(html, /qrcode(js)?\.min\.js|chart\.googleapis/,
    'QR 라이브러리를 바깥에서 받아 온다');
});

test('QR 그림이 실제로 있다', () => {
  const p = join(ROOT, 'og', 'qr-app.png');
  const buf = readFileSync(p);
  assert.equal(buf[0], 0x89, 'PNG 가 아니다');
  assert.ok(buf.length > 500, `${buf.length}바이트뿐이다 — 제대로 안 그려졌다`);
});

test('딥링크가 미니앱 이름과 같다', () => {
  // 여기가 어긋나면 눌러도 아무 일이 없다. 미니앱 쪽에서 이미 한 번 겪었다.
  const cfg = readFileSync(join(ROOT, 'mini', 'apps-in-toss.config.ts'), 'utf8');
  const appName = cfg.match(/appName:\s*'([^']+)'/)[1];
  const deep = SRC.match(/const MINI_DEEPLINK = 'intoss:\/\/([^']+)'/)[1];
  assert.equal(deep, appName, `딥링크(${deep})와 앱 이름(${appName})이 다르다`);
});

test('토스 안에서 열면 한 번 더 누르게 하지 않는다', async () => {
  const script = (await page().text()).match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.match(script, /toss/i, '토스 웹뷰인지 보지 않는다');
});

test('링크 미리보기가 붙는다', async () => {
  const html = await page().text();
  assert.match(html, /property="og:image" content="[^"]+\/og\/home\.png"/, '미리보기 그림이 없다');
  assert.match(html, /property="og:title"/);
});

// ── 어디서 왔는지 ──

const hit = async (env, q) => H.handleHit(new Request('https://x/api/hit' + q, { method: 'POST' }), env);

test('출처를 세어 쌓는다', async () => {
  const { db, DB } = createD1();
  const env = { DB };
  await hit(env, '?ref=disquiet&p=/tti');
  await hit(env, '?ref=disquiet&p=/tti');
  await hit(env, '?ref=geeknews&p=/tti');
  const rows = db.prepare('SELECT ref, page, n FROM hits ORDER BY n DESC').all();
  assert.equal(rows.length, 2, '한 줄로 합치지 않고 방문마다 쌓았다');
  assert.equal(rows[0].ref, 'disquiet');
  assert.equal(rows[0].n, 2, '같은 출처를 합치지 않았다');
});

test('⚠️ 사람을 알아보려 들지 않는다', () => {
  // 채널을 견주려고 두는 것이지 사람을 따라다니려는 것이 아니다.
  const f = SRC.match(/async function handleHit\([\s\S]*?\n\}/)[0];
  for (const 금지 of ['CF-Connecting-IP', 'User-Agent', 'cookie', 'Cookie', 'userKey', 'user_email']) {
    assert.ok(!f.includes(금지), `${금지} 를 들여다본다 — 개인정보가 된다`);
  }
  // 테이블에도 사람을 가리키는 칸이 없어야 한다
  const ddl = SRC.slice(SRC.indexOf('CREATE TABLE IF NOT EXISTS hits'));
  const cols = ddl.slice(0, ddl.indexOf(');'));
  for (const 금지 of ['ip', 'user', 'agent', 'session']) {
    assert.ok(!cols.toLowerCase().includes(금지), `hits 에 ${금지} 칸이 있다`);
  }
});

test('아무 글자나 출처로 받지 않는다', async () => {
  const { db, DB } = createD1();
  const env = { DB };
  await hit(env, '?ref=' + encodeURIComponent('<script>x</script>') + '&p=/tti');
  await hit(env, '?ref=' + encodeURIComponent('a'.repeat(200)) + '&p=/tti');
  const rows = db.prepare('SELECT ref FROM hits').all();
  for (const r of rows) {
    assert.ok(!/[<>'"]/.test(r.ref), `이상한 글자가 들어갔다: ${r.ref}`);
    assert.ok(r.ref.length <= 40, `출처가 ${r.ref.length}자다 — 너무 길다`);
  }
});

test('출처가 없으면 아무것도 안 쌓는다', async () => {
  const { db, DB } = createD1();
  await hit({ DB }, '?p=/tti');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM hits').get().c, 0,
    '출처도 없는데 줄이 생겼다');
});

test('세다가 실패해도 사용자 화면은 멀쩡하다', async () => {
  // 집계는 곁다리다. 이것 때문에 페이지가 깨지면 본말이 뒤집힌다.
  const res = await hit({ DB: { prepare() { throw new Error('DB 없음'); } } }, '?ref=x&p=/tti');
  assert.equal(res.status, 204, `${res.status} 로 답한다 — 조용히 넘어가야 한다`);
});

test('집계는 관리자만 본다', async () => {
  const { DB } = createD1();
  const env = { DB, ADMIN_SECRET: 'secret' };
  const bare = await H.handleHitsReport(new Request('https://x/admin/hits'), env);
  assert.equal(bare.status, 401, '아무나 볼 수 있다');

  // 브라우저로 열어 볼 때는 헤더를 못 붙이므로 ?key= 도 받는다.
  const byKey = await H.handleHitsReport(
    new Request('https://x/admin/hits?key=secret'), env);
  assert.equal(byKey.status, 200, '열쇠를 주소로 줘도 안 열린다');

  const ok = await H.handleHitsReport(new Request('https://x/admin/hits', {
    headers: { Authorization: 'Bearer secret' },
  }), env);
  assert.equal(ok.status, 200);
  const html = await ok.text();
  assert.match(html, /어디서 왔나/, '사람이 읽을 화면이 아니다');

  // 값이 필요하면 json 으로도 준다.
  const j = await H.handleHitsReport(
    new Request('https://x/admin/hits?key=secret&format=json'), env);
  const parsed = JSON.parse(await j.text());
  assert.ok(parsed.byRef && parsed.detail, '집계 모양이 아니다');
});

test('⚠️ 관리자 화면이 검색에 걸리지 않는다', async () => {
  const { DB } = createD1();
  const res = await H.handleHitsReport(new Request('https://x/admin/hits?key=s'),
    { DB, ADMIN_SECRET: 's' });
  assert.match(res.headers.get('X-Robots-Tag') || '', /noindex/,
    '검색 로봇에게 열려 있다');
  assert.match(res.headers.get('Cache-Control') || '', /no-store/,
    '집계가 캐시에 남는다');
});

test('관리자 열쇠가 없으면 아예 안 열린다', async () => {
  const { DB } = createD1();
  const res = await H.handleHitsReport(new Request('https://x/admin/hits', {
    headers: { Authorization: 'Bearer ' },
  }), { DB });
  assert.equal(res.status, 401, '열쇠를 안 정해 뒀는데 열린다');
});
