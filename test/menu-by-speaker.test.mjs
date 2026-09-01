// 미니앱 홈 묶음은 **누가 풀어 주는가**로 나눈다. 그 약속을 지키는 시험.
//
// ⚠️ 왜 필요한가: 묶음(SECTIONS)과 화자 표(FEATURE_SPEAKER)는 다른 자리에 적혀 있다.
//    한쪽만 고치면 **화면에는 안동자 묶음에 있는데 글은 안할매가 쓴 것**이 된다.
//    사용자는 그림과 말투가 어긋나는 것을 바로 알아챈다.
//
//    2026-08-31 에 좋은 날·좋은 방향을 안할매에서 안동자로 옮기면서 실제로 겪었다 —
//    contents.js 만 고쳤더니 worker.js 의 핸들러는 계속 안할매로 부르고 있었다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'mini', 'src', 'contents.js'), 'utf8');

/** 묶음 제목 → 그 안의 항목들. 항목은 { id, path, pick } 만 본다. */
function 묶음들() {
  const 시작 = src.indexOf('export const SECTIONS = [');
  const 끝 = src.indexOf('\n];', 시작);
  assert.ok(시작 >= 0 && 끝 > 시작, 'SECTIONS 를 못 찾았다');
  const out = [];
  for (const blk of src.slice(시작, 끝).split(/icon:\s*'sec/).slice(1)) {
    const title = (blk.match(/title:\s*'([^']+)'/) || [])[1];
    const items = [...blk.matchAll(/\{ id: '([\w-]+)'[^}]*?(?:path: '([^']*)'|pick: \[([^\]]*)\])/g)]
      .map((m) => ({ id: m[1], path: m[2] || null,
                     pick: m[3] ? [...m[3].matchAll(/'([\w-]+)'/g)].map((x) => x[1]) : null }));
    out.push({ title, items });
  }
  return out;
}

const 화자표 = (() => {
  const i = src.indexOf('export const FEATURE_SPEAKER');
  const blk = src.slice(i, src.indexOf('};', i));
  return Object.fromEntries([...blk.matchAll(/'([^']+)':\s*'(\w+)'/g)].map((m) => [m[1], m[2]]));
})();

const PICKED = (() => {
  const i = src.indexOf('export const PICKED = [');
  const blk = src.slice(i, src.indexOf('\n];', i));
  return Object.fromEntries(
    [...blk.matchAll(/\{ id: '([\w-]+)'[\s\S]*?path: '([^']*)'/g)].map((m) => [m[1], m[2]]));
})();

const 이름 = { doryeong: '안도령', nangja: '안낭자', halmae: '안할매', dongja: '안동자' };
const 화자 = (path) => 화자표[path] || 'doryeong';

test('묶음이 넷이고, 제목마다 그 사람 이름이 들어 있다', () => {
  const secs = 묶음들();
  assert.equal(secs.length, 4, `묶음이 ${secs.length}개다 — 사람은 넷이다`);
  const 나온이름 = secs.map((s) => s.title.split(' ')[0]);
  assert.deepEqual([...나온이름].sort(), ['안낭자', '안도령', '안동자', '안할매'],
    `제목에서 사람을 못 찾았다: ${secs.map((s) => s.title).join(' / ')}`);
});

test('⚠️ 한 묶음 안의 콘텐츠는 전부 그 사람이 맡는다', () => {
  for (const sec of 묶음들()) {
    const 그사람 = sec.title.split(' ')[0];
    for (const it of sec.items) {
      // 합친 칸은 품고 있는 것들을 하나씩 본다.
      const paths = it.pick ? it.pick.map((id) => PICKED[id]) : [it.path];
      for (const p of paths) {
        if (!p) continue;                       // 산가지처럼 서버를 안 부르는 것
        assert.equal(이름[화자(p)], 그사람,
          `${sec.title} 에 있는 ${it.id}(${p}) 는 ${이름[화자(p)]} 가 맡고 있다 — `
          + '묶음을 옮겼으면 FEATURE_SPEAKER 도 함께 고칠 것');
      }
    }
  }
});

test('합친 칸이 가리키는 것이 다 있다', () => {
  // ⚠️ 없는 id 를 가리키면 그 칸을 눌러 고를 수는 있는데 아무 일도 안 일어난다.
  for (const sec of 묶음들()) {
    for (const it of sec.items) {
      if (!it.pick) continue;
      assert.ok(it.pick.length >= 2, `${it.id}: 하나짜리는 합칠 이유가 없다`);
      for (const id of it.pick) {
        assert.ok(PICKED[id], `${it.id} 가 없는 것을 가리킨다: ${id}`);
      }
    }
  }
});

test('같은 콘텐츠가 두 군데 있지 않다', () => {
  const 본것 = [];
  for (const sec of 묶음들()) {
    for (const it of sec.items) 본것.push(...(it.pick || [it.id]));
  }
  const 겹침 = 본것.filter((v, i) => 본것.indexOf(v) !== i);
  assert.deepEqual(겹침, [], `두 번 놓인 것이 있다: ${겹침.join(', ')}`);
});

test('한 묶음에 2~7개까지만 담는다', () => {
  for (const sec of 묶음들()) {
    assert.ok(sec.items.length >= 2, `${sec.title}: ${sec.items.length}개면 묶음이 될 이유가 없다`);
    assert.ok(sec.items.length <= 7, `${sec.title}: ${sec.items.length}개는 너무 많다`);
  }
});

test('합쳐서 칸 수가 실제로 줄었다', () => {
  // 합치는 목적이 이것이다. 합친 칸이 늘기만 하고 타일이 안 줄면 헛일이다.
  const 타일 = 묶음들().reduce((n, s) => n + s.items.length, 0);
  const 실제콘텐츠 = 묶음들().reduce((n, s) =>
    n + s.items.reduce((m, it) => m + (it.pick ? it.pick.length : 1), 0), 0);
  assert.ok(타일 < 실제콘텐츠,
    `타일 ${타일}개, 콘텐츠 ${실제콘텐츠}개 — 합친 것이 없다`);
  assert.ok(타일 <= 22, `타일이 ${타일}개다 — 홈이 다시 길어졌다`);
});
