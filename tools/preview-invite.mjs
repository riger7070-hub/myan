// 초대 페이지를 눈으로 보려고 띄운다. 실제 핸들러가 만든 HTML 그대로다.
//   node tools/preview-invite.mjs   →  http://localhost:8799
//
// /        물어보는 화면
// /done    답을 받은 뒤 화면 (스크립트가 그리는 결과를 미리 채워 둔 것)
// /gone    지난 초대

import http from 'node:http';
import { loadWorker } from '../test/load-worker.mjs';
import { createD1 } from '../test/d1-sqlite.mjs';

const H = await loadWorker([
  'handleInvitePage', 'handleInviteCreate', 'handleInviteAnswer', 'createSessionToken',
]);

const { db, DB } = createD1();
const env = { SESSION_SECRET: 'preview', DB };
db.prepare(
  `INSERT INTO mini_users (user_key,name,birth_year,birth_month,birth_day,birth_hour)
   VALUES ('K','안태현',1988,3,9,'인시')`
).run();

const mk = async () => JSON.parse(await (await H.handleInviteCreate(
  new Request('https://x/mini/api/invite', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await H.createSessionToken('mini:K', env)}` },
  }), env)).text());

const page = async (id) =>
  (await H.handleInvitePage(new Request('https://x/i/' + id), env, id)).text();

const 물어보는화면 = await page((await mk()).id);
const 지난것 = await page('없는번호');

// 답을 받은 뒤 화면. 스크립트가 하는 일을 서버에서 그대로 흉내 낸다.
const 답할것 = await mk();
const 결과 = JSON.parse(await (await H.handleInviteAnswer(
  new Request('https://x/api/invite/' + 답할것.id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ birth: { year: 1992, month: 11, day: 4, hour: '오시' } }),
  }), env, 답할것.id)).text());

const cards = 결과.cards
  .map(k => `<div class="kind"><b>${k.label}</b><p>${k.text}</p></div>`).join('');
const 답한화면 = (await page((await mk()).id))
  .replace(/<form id="f">[\s\S]*?<\/form>/, '')
  .replace(/<p class="sub">[\s\S]*?<\/p>/, '')
  .replace(/<p class="note">[\s\S]*?<\/p>/, '')
  .replace('안태현님이 궁합을 물어왔습니다</h1>', '두 분의 결입니다</h1>')
  .replace('<div id="out" class="hide">',
    `<div id="out">${cards}<a class="cta" href="/">내 사주도 보러 가기</a>`);

const ROUTES = { '/': 물어보는화면, '/done': 답한화면, '/gone': 지난것 };

http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];

  // 페이지 안의 스크립트가 실제로 부르는 자리. 진짜 핸들러에 그대로 넘긴다.
  if (req.method === 'POST' && path.startsWith('/api/invite/')) {
    const body = await new Promise((ok) => {
      let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => ok(s));
    });
    const id = decodeURIComponent(path.slice('/api/invite/'.length));
    const r = await H.handleInviteAnswer(
      new Request('https://x' + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      }), env, id);
    res.writeHead(r.status, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(await r.text());
    return;
  }

  // /i/<id> 로 들어오면 그때그때 만든다. 눌러 보려면 살아 있는 초대가 필요하다.
  if (path.startsWith('/i/')) {
    const html = await page(decodeURIComponent(path.slice(3)));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  // '/' 로 들어오면 늘 새 초대를 하나 만들어 준다(한 번 답하면 못 쓰니까).
  if (path === '/') {
    const html = await page((await mk()).id);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  const html = ROUTES[path];
  res.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html; charset=UTF-8' });
  res.end(html || '없다. / /done /gone 중에 골라라.');
}).listen(8799, () => console.log('http://localhost:8799  (/ , /done , /gone)'));
