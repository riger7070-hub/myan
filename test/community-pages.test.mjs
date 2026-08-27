// 커뮤니티에 내놓을 무료 도구 셋.
//
// 만세력 · 띠 궁합표 · 손 없는 날.
//
// 왜 이 셋인가: 커뮤니티에서 쓰이려면 (1) 가입 없이 바로 되고 (2) 사람들이 서로
// 물어보던 것이며 (3) 한 장으로 퍼질 수 있어야 한다. 사주 이야기를 하려면 제 사주
// 네 글자를 알아야 하고(만세력), 궁합 이야기에는 다 같이 보고 가리킬 표가 필요하며
// (띠 궁합표), 이사 날짜는 실제로 찾아보는 말이다(손 없는 날).
//
// ⚠️ 셋 다 AI 를 부르지 않는다. 명리 표 계산이라 사람이 몰려도 요금이 들지 않는다.
//    커뮤니티에서 갑자기 트래픽이 몰릴 수 있는 자리라 이게 중요하다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = readFileSync(join(ROOT, 'worker.js'), 'utf8');

const H = await loadWorker([
  '_sonNalsOf', 'handleGunghapPage', 'handleCalcPage', 'handleCalcApi', 'handleSitemap', 'handleCalcHub',
]);

const post = (kind, body) => H.handleCalcApi(
  new Request('https://x/api/calc/' + kind, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), kind);

// ── 손 없는 날 ──

test('⚠️ 손 없는 날은 음력으로 센다', async () => {
  // 양력 9일·10일을 세면 통째로 틀린다. 손이 비우는 것은 음력 끝자리 9와 0인 날이다.
  for (const [y, m] of [[2026, 3], [2026, 9], [2027, 2], [2025, 12]]) {
    for (const d of H._sonNalsOf(y, m)) {
      assert.ok(d.lunarDay % 10 === 9 || d.lunarDay % 10 === 0,
        `${y}-${m}-${d.day} 은 음력 ${d.lunarDay}일이라 손 없는 날이 아니다`);
    }
  }
});

test('⚠️ 음력 작은달이 있어 개수가 달마다 다르다', async () => {
  // 여섯 개로 못박아 두면 30일이 없는 달에서 틀린다. 실제로 2027-02 는 다섯 개다.
  const 개수 = [[2026, 3], [2026, 9], [2027, 2]].map(([y, m]) => H._sonNalsOf(y, m).length);
  assert.ok(개수.every((n) => n >= 4 && n <= 7), `개수가 이상하다: ${개수.join(', ')}`);
  assert.ok(new Set(개수).size > 1, '달마다 개수가 같게 나온다 — 음력을 안 보고 있다');
});

test('⚠️ 앞으로 이사할 달도 물어볼 수 있다', async () => {
  // 나머지 계산기는 "태어난 해" 라 올해까지만 받지만 이쪽은 앞날을 묻는다.
  // 공통 검사에 걸려 내년을 못 물어보면 도구로 쓸 수가 없다.
  const 내년 = new Date(Date.now() + 9 * 3600000).getUTCFullYear() + 1;
  const r = await post('sonnal', { year: 내년, month: 5 });
  assert.equal(r.status, 200, `내년 ${내년}년을 물었더니 막혔다`);
  assert.ok((await r.json()).cards.length > 1, '날짜를 하나도 안 준다');
});

test('없는 달을 물으면 이유를 말한다', async () => {
  const r = await post('sonnal', { year: 2026, month: 13 });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /달/);
});

// ── 만세력 ──

test('⚠️ 만세력은 네 기둥을 그대로 준다', async () => {
  const cards = (await (await post('manseryeok', { year: 1990, month: 5, day: 15, hour: '사시' })).json()).cards;
  const 글 = cards.map((c) => c.label).join(' ');
  for (const 기둥 of ['년주', '월주', '일주', '시주']) {
    assert.match(글, new RegExp(기둥 + ' [\\u4e00-\\u9fff]{2}'), `${기둥} 가 두 글자로 안 나온다`);
  }
  assert.match(글, /오행/, '오행 분포가 없다');
});

test('시를 모르면 그렇다고 말한다', async () => {
  const cards = (await (await post('manseryeok', { year: 1990, month: 5, day: 15, hour: '' })).json()).cards;
  const 글 = cards.map((c) => c.label + c.text).join(' ');
  assert.doesNotMatch(cards.map((c) => c.label).join(' '), /시주 [一-鿿]{2}/,
    '시를 안 알려줬는데 시주를 지어내고 있다');
  assert.match(글, /시주는 비어 있습니다/, '시주가 왜 없는지 말해 주지 않는다');
});

test('⚠️ 만세력이 풀이까지 하지는 않는다', async () => {
  // 읽어 주는 것이 파는 것이다. 여기서 다 해 주면 앱에 갈 이유가 없어진다.
  // 반대로 뽑아 주지도 않으면 커뮤니티에서 쓸 도구가 못 된다. 그 사이를 지킨다.
  const body = await (await H.handleCalcPage('manseryeok')).text();
  assert.doesNotMatch(body, /geminiText|\/api\/saju-reading/, '만세력이 AI 를 부른다');
  const cards = (await (await post('manseryeok', { year: 1990, month: 5, day: 15, hour: '사시' })).json()).cards;
  for (const c of cards) {
    assert.ok(c.text.length < 120, `풀이를 하고 있다(${c.text.length}자): ${c.text.slice(0, 40)}`);
  }
});

// ── 띠 궁합표 ──

test('⚠️ 띠 궁합표에 열두 띠가 다 있다', async () => {
  const html = await H.handleGunghapPage().text();
  for (const 띠 of ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지']) {
    assert.ok(html.includes(`>${띠}<`), `${띠}띠가 표에 없다`);
  }
  // 12x12 = 144칸.
  assert.equal((html.match(/<td class="/g) || []).length, 144,
    '칸이 144개가 아니다 — 표가 어긋났다');
});

test('⚠️ 표를 옆으로 밀어도 어느 띠인지 보인다', async () => {
  // 열두 칸짜리 표는 화면 밖으로 나간다. 첫 칸이 안 붙어 있으면 오른쪽을 볼 때
  // 지금 보는 줄이 누구 줄인지 알 수 없어 표를 못 읽는다.
  const html = await H.handleGunghapPage().text();
  assert.match(html, /overflow-x:auto/, '표가 화면 밖으로 잘린다');
  assert.match(html, /th\[scope=row\]\{position:sticky/, '첫 칸이 안 붙어 있다');
});

test('⚠️ 띠만 보고 사람을 가르지 말라고 적어 둔다', () => {
  // 이 표는 지지 하나만 본 것이다. 그 한계를 안 적으면 띠로 사람을 재게 된다.
  const html = WORKER.slice(WORKER.indexOf('function handleGunghapPage'));
  assert.match(html.slice(0, 6000), /띠만 보고 사람을 가르지 마세요/, '한계를 안 적어 뒀다');
});

// ── 셋 모두 ──

test('⚠️ 셋 다 검색에 걸리도록 사이트맵에 있다', async () => {
  const sm = await H.handleSitemap().text();
  for (const p of ['/gunghap', '/calc/manseryeok', '/calc/sonnal']) {
    assert.ok(sm.includes(`<loc>https://myan.riger7070.workers.dev${p}</loc>`), `${p} 가 사이트맵에 없다`);
  }
});

test('⚠️ 셋 다 앱으로 가는 길과 베타 안내를 갖췄다', async () => {
  for (const [이름, res] of [
    ['띠 궁합표', H.handleGunghapPage()],
    ['만세력', H.handleCalcPage('manseryeok')],
    ['손 없는 날', H.handleCalcPage('sonnal')],
  ]) {
    const html = await res.text();
    assert.match(html, /\/app\?ref=/, `${이름}: 앱으로 가는 길이 없다`);
    assert.match(html, /토스 앱에서/, `${이름}: 웹이 베타라는 안내가 없다`);
  }
});

test('⚠️ 계산기 목록이 실제로 눌린다', async () => {
  // 예전에는 설명만 적고 링크를 안 걸어 뒀다. 읽고는 갈 곳이 없어 그냥 나갔다.
  const html = await H.handleCalcHub().text();
  for (const p of ['/calc/manseryeok', '/gunghap', '/calc/sonnal', '/calc/samjae', '/tti']) {
    assert.ok(html.includes(`href="${p}"`), `허브에서 ${p} 로 갈 수 없다`);
  }
});
