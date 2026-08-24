// 링크 미리보기 카드.
//
// 카톡·디스콰이엇·트위터에 링크를 붙였을 때 뜨는 그림이다. 없거나 이름이 어긋나면
// 회색 빈 칸이 뜨는데, 그게 홍보 글에서 제일 먼저 눈에 들어오는 자리다.
// 그런데 우리 화면에서는 아무 티도 안 난다 — 남이 링크를 붙여 봐야 안다.
//
// 카드는 미리 그려 둔다(tools/build-og-cards.mjs). 카톡·트위터가 래스터 그림만
// 받는데, Workers 에서 PNG 를 즉석에 그리려면 폰트 렌더러를 얹어야 해서
// 미리보기 하나 때문에 워커를 무겁게 만들 이유가 없다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OG = join(ROOT, 'og');
const SRC = readFileSync(join(ROOT, 'worker.js'), 'utf8');

const H = await loadWorker(['handleTtiPage', 'handleCalcHub', 'handleCalcPage', 'computeTtiRanking']);

/** 페이지가 실제로 내보낸 og:image 주소에서 파일 이름만 뽑는다. */
function ogNameOf(html) {
  const url = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  assert.ok(url, 'og:image 가 없다');
  const m = url.match(/\/og\/([^"]+)\.png$/);
  return m ? decodeURIComponent(m[1]) : null;   // null = 기본 앱 아이콘
}

test('띠 순위는 오늘 1위에 맞는 카드를 쓴다', async () => {
  const html = await H.handleTtiPage().text();
  const top = html.match(/1위는 ([^띠]+)띠/)?.[1];
  assert.ok(top, '제목에서 1위 띠를 못 읽었다');
  assert.equal(ogNameOf(html), `tti-${top}`, '그림이 오늘 1위와 다르다');
});

test('⚠️ 열두 띠 카드가 다 있다', () => {
  // 하루라도 빠지면 그날만 조용히 빈 칸이 뜬다. 그날이 오기 전에는 아무도 모른다.
  const TTI = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];
  const missing = TTI.filter(t => !existsSync(join(OG, `tti-${t}.png`)));
  assert.deepEqual(missing, [], `없는 카드: ${missing.map(t => 'tti-' + t).join(', ')}`);
});

test('⚠️ 페이지가 가리키는 카드가 실제로 있다', async () => {
  const pages = [
    ['/tti', H.handleTtiPage()],
    ['/calc', H.handleCalcHub()],
    ...['samjae', 'sinsal', 'bonmyeong'].map(k => ['/calc/' + k, H.handleCalcPage(k)]),
  ];
  for (const [path, res] of pages) {
    const name = ogNameOf(await res.text());
    assert.ok(name, `${path}: 전용 카드가 아니라 기본 아이콘을 쓴다`);
    assert.ok(existsSync(join(OG, `${name}.png`)),
      `${path}: og/${name}.png 가 없다 — 링크에 빈 칸이 뜬다`);
  }
});

test('홈도 전용 카드를 쓴다', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const url = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  assert.ok(url, '홈에 og:image 가 없다');
  assert.match(url, /\/og\/home\.png$/, `홈이 ${url} 를 쓴다`);
  assert.ok(existsSync(join(OG, 'home.png')), 'og/home.png 가 없다');
});

test('카드가 메신저가 받아 주는 모양이다', () => {
  // 1.91:1 (1200x630). 정사각이면 카톡·트위터 양쪽에서 잘린다.
  // 크기가 너무 크면 미리보기를 만드는 쪽이 받다가 포기한다(대개 5MB 언저리).
  const PNG = 0x89;
  for (const name of ['home', 'tti', 'tti-말', 'calc-samjae']) {
    const f = join(OG, `${name}.png`);
    const buf = readFileSync(f);
    assert.equal(buf[0], PNG, `${name}: PNG 가 아니다`);
    // PNG 머리에서 가로·세로를 읽는다(16~24 바이트).
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    assert.equal(w, 1200, `${name}: 가로가 ${w} 다`);
    assert.equal(h, 630, `${name}: 세로가 ${h} 다`);
    assert.ok(statSync(f).size < 3 * 1024 * 1024, `${name}: 3MB 를 넘는다`);
  }
});

test('없는 카드를 가리키면 앱 아이콘으로 돌아간다', () => {
  // 그림 하나 없다고 페이지까지 망가지면 안 된다.
  const fn = SRC.match(/function _ogImage\([\s\S]*?\n\}/)[0];
  assert.match(fn, /icon-og-512-512\.png/, '기댈 그림이 없다');
});

test('카드를 다시 그리는 방법이 적혀 있다', () => {
  // 여기 없으면 다음 사람이 PNG 를 손으로 고치려 든다.
  const tool = readFileSync(join(ROOT, 'tools', 'build-og-cards.mjs'), 'utf8');
  assert.match(tool, /node tools\/build-og-cards\.mjs/, '실행법이 안 적혀 있다');
  assert.match(SRC, /build-og-cards/, 'worker.js 에서 원본을 안 가리킨다');
});
