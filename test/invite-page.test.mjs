// 초대 페이지는 미니앱 밖에서 도는 유일한 화면이다. 빌드도 번들도 거치지 않으므로
// 문법이 틀려도 아무도 알려주지 않는다 — 열어 본 사람만 빈 화면을 본다.
// 여기서 안의 스크립트를 떼어 실제로 파싱해 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const H = await loadWorker(['handleInvitePage', 'handleInviteCreate', 'createSessionToken']);

async function pageHtml() {
  const { db, DB } = createD1();
  const env = { SESSION_SECRET: 's', DB };
  db.prepare(
    `INSERT INTO mini_users (user_key,name,birth_year,birth_month,birth_day,birth_hour)
     VALUES ('K','안태현',1988,3,9,'인시')`
  ).run();
  const made = JSON.parse(await (await H.handleInviteCreate(
    new Request('https://x/mini/api/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await H.createSessionToken('mini:K', env)}` },
    }), env)).text());
  const html = await (await H.handleInvitePage(
    new Request('https://x/i/' + made.id), env, made.id)).text();
  return { html, id: made.id };
}

test('페이지 안의 스크립트가 실제로 파싱된다', async () => {
  const { html } = await pageHtml();
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, '스크립트가 없다');
  // 문법이 틀리면 여기서 던진다.
  new vm.Script(m[1], { filename: 'invite-page-inline.js' });
});

test('스크립트가 자기 초대 번호로 보낸다', async () => {
  const { html, id } = await pageHtml();
  assert.match(html, new RegExp(`fetch\\('/api/invite/${id}'`), '보낼 주소가 틀렸다');
});

test('스크립트 안의 따옴표가 HTML 을 깨지 않는다', async () => {
  // </script> 나 홑따옴표가 섞이면 페이지가 통째로 무너진다.
  const { html } = await pageHtml();
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
});

test('이름에 든 꺾쇠가 태그로 새지 않는다', async () => {
  const { db, DB } = createD1();
  const env = { SESSION_SECRET: 's', DB };
  db.prepare(
    `INSERT INTO mini_users (user_key,name,birth_year,birth_month,birth_day)
     VALUES ('K',?,1988,3,9)`
  ).run('<img src=x onerror=alert(1)>');
  const made = JSON.parse(await (await H.handleInviteCreate(
    new Request('https://x/mini/api/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await H.createSessionToken('mini:K', env)}` },
    }), env)).text());
  const html = await (await H.handleInvitePage(
    new Request('https://x/i/' + made.id), env, made.id)).text();
  assert.doesNotMatch(html, /<img src=x/, '이름이 태그로 들어갔다');
  assert.match(html, /&lt;img/, '이름을 넣긴 넣었는지 확인');
});
