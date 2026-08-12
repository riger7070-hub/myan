// 미니앱이 콘텐츠마다 **실제로 보내는 요청**을 그대로 받아 적는다.
//
//   node tools/capture-mini-requests.mjs
//
// 결과는 test/fixtures/mini-requests.json 으로 떨어지고,
// test/app-server-contract.test.mjs 가 그 값을 서버 핸들러에 그대로 먹여 본다.
// 앱과 서버가 주고받는 모양이 어긋나면 거기서 잡힌다 — 지금까지 이 경계에서 세 번 깨졌다.
//
// ⚠️ 콘텐츠를 새로 넣거나 입력 폼을 고쳤으면 이걸 다시 돌려 fixtures 를 갱신할 것.
// 미니앱을 먼저 빌드해 두어야 한다(mini 에서 npm run build).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const require = createRequire('C:/Users/ARA/Desktop/myan_clone/package.json');
const { chromium } = require('playwright');
const SRC = 'C:/Users/ARA/Desktop/myan_clone/mini/dist';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = createServer(async (rq, rs) => {
  const p = rq.url.split('?')[0], f = join(SRC, p === '/' ? 'index.html' : p);
  try { const b = await readFile(f); rs.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); rs.end(b); }
  catch { rs.writeHead(404).end(); }
});
await new Promise(r => srv.listen(0, r));
const port = srv.address().port;
let br; for (const ch of ['msedge', 'chrome', undefined]) { try { br = await chromium.launch(ch ? { channel: ch } : {}); break; } catch (e) { if (!ch) throw e; } }

const pg = await br.newPage({ viewport: { width: 390, height: 900 } });
pg.setDefaultTimeout(3000);
await pg.addInitScript(() => {
  sessionStorage.setItem('myan_mini_seen', '1'); localStorage.setItem('myan_mini_session', 'fake');
  const J = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const real = window.fetch;
  window.__log = [];
  window.fetch = async (u, i) => {
    const s = String(u).replace(/^https?:\/\/[^/]+/, '');
    if (i?.method === 'POST' && !s.startsWith('/mini/api/auth')) {
      try { window.__log.push({ path: s, body: JSON.parse(i.body || '{}') }); } catch { /* 본문 없음 */ }
    }
    if (s.includes('/mini/api/me')) return J({ ok: true, tokens: 99, profile: { name: '안태현', birthYear: 1999, birthMonth: 7, birthDay: 18, birthHour: '사시', gender: 'M' } });
    if (s.includes('/mini/api/')) return J({ ok: true, tokens: 99 });
    return J({ success: true, reading: '풀이', remaining: 98 });
  };
});
await pg.goto(`http://localhost:${port}/`); await pg.waitForTimeout(1800);

const items = await pg.evaluate(() => [...document.querySelectorAll('[data-item]')].map(b => b.dataset.item));
const home = async () => { await pg.evaluate(() => { const b = document.querySelector('#btn-home2, #btn-home'); b && b.click(); }); await pg.waitForTimeout(450); };

for (const id of items) {
  await home();
  const ok = await pg.evaluate((i) => { const b = document.querySelector(`[data-item="${i}"]`); if (!b) return false; b.click(); return true; }, id);
  if (!ok) continue;
  await pg.waitForTimeout(700);
  // 입력이 있으면 사람이 넣을 법한 값으로 채운다.
  await pg.evaluate(() => {
    const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    for (const el of document.querySelectorAll('#app input, #app select, #app textarea')) {
      if (el.type === 'file') continue;
      if (el.tagName === 'SELECT') { const o = [...el.options].map(x => x.value).filter(Boolean)[0]; if (o) set(el, o); }
      else if (el.id === 'f-sn') set(el, '김');
      else if (el.id === 'f-nm') set(el, '안태현');
      else if (el.id === 'p-y') set(el, '1997');
      else if (el.id === 'p-m') set(el, '4');
      else if (el.id === 'p-d') set(el, '9');
      else if (el.id === 'p-h') set(el, '오전 9시');
      else if (el.type === 'date') set(el, '2026-09-15');
      else if (el.type === 'number') set(el, '30');
      else set(el, '맑은 물에서 잉어를 봤어요');
    }
    document.querySelector('#btn-run')?.click();
  });
  await pg.waitForTimeout(1200);
}

const log = await pg.evaluate(() => window.__log);
// 콘텐츠 id 를 붙여 준다: 누른 순서대로 요청이 한 번씩 나간다.
await writeFile('C:/Users/ARA/Desktop/myan_clone/test/fixtures/mini-requests.json',
  JSON.stringify(log, null, 2) + '\n');
console.log('받아 적은 요청:', log.length, '건 /', items.length, '콘텐츠');
for (const r of log) console.log('  ' + r.path);
await br.close(); srv.close();
