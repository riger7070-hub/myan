// 삼재 결과 페이지 (/calc/samjae/1990).
//
// 왜 결과에 제 주소를 줬는지는 handleSamjaeYearPage 의 주석에 있다. 여기서 지키는 것은
// 그 결정이 조용히 깨지는 두 가지다.
//
//   하나, 미리보기 그림. 나올 수 있는 답이 열두 가지라 PNG 를 미리 그려 뒀는데,
//   한 장이라도 없으면 **그 해에 태어난 사람에게만** 회색 빈 칸이 뜬다. 내 화면에는
//   아무 티도 안 나고, 남이 링크를 붙여 봐야 안다. 그래서 열리는 해를 전부 돌려 본다.
//
//   둘, 페이지로 나가는 스크립트. 공유 버튼 문구를 워커의 템플릿 문자열 안에서 만드는데,
//   여기서 역슬래시를 한 번 덜 쓰면(`'\n'` vs `'\\n'`) 워커는 멀쩡히 배포되고
//   브라우저에서만 SyntaxError 가 난다 — 공유 버튼이 통째로 죽는다. 실제로 그렇게 썼다가
//   잡았다. 문법 검사를 여기서 한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OG = join(ROOT, 'og');

const H = await loadWorker([
  'handleSamjaeYearPage', 'handleCalcPage', 'handleSitemap', 'computeSamjae', 'computeSaju',
]);

const THIS_YEAR = Number(new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 4));
const YEARS = [];
for (let y = 1900; y <= THIS_YEAR; y++) YEARS.push(y);

const htmlOf = (y) => H.handleSamjaeYearPage(y).text();
const ogNameOf = (html) => {
  const url = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  assert.ok(url, 'og:image 가 없다');
  const m = url.match(/\/og\/([^"]+)\.png$/);
  return m ? decodeURIComponent(m[1]) : null;
};

test('열리는 해가 모두 페이지를 낸다', () => {
  const dead = YEARS.filter(y => !H.handleSamjaeYearPage(y));
  assert.deepEqual(dead, [], `계산이 안 되는 해: ${dead.join(', ')}`);
});

test('⚠️ 어느 해로 들어와도 가리키는 카드가 실제로 있다', async () => {
  // 한 해라도 빠지면 그 해에 태어난 사람에게만 빈 칸이 뜬다.
  const missing = new Set();
  for (const y of YEARS) {
    const name = ogNameOf(await htmlOf(y));
    assert.ok(name, `${y}: 전용 카드가 아니라 기본 아이콘을 쓴다`);
    if (!existsSync(join(OG, `${name}.png`))) missing.add(name);
  }
  assert.deepEqual([...missing], [], `없는 카드: ${[...missing].join(', ')}`);
});

test('나올 수 있는 답은 열두 가지뿐이다', async () => {
  // 이 수가 늘면 미리 그려 둔 카드로는 못 덮는다 — 카드도 같이 늘려야 한다.
  const names = new Set();
  for (const y of YEARS) names.add(ogNameOf(await htmlOf(y)));
  const want = new Set([
    'samjae-들삼재', 'samjae-눌삼재', 'samjae-날삼재',
    ...Array.from({ length: 9 }, (_, i) => `samjae-${i + 1}`),
  ]);
  for (const n of names) assert.ok(want.has(n), `모르는 카드 이름: ${n}`);
  assert.equal(want.size, 12);
});

test('삼재는 이어진 세 해이고, 밖에 있으면 남은 해가 1~9 다', () => {
  for (const y of YEARS) {
    const saju = H.computeSaju(y, 6, 1, '');
    const s = H.computeSamjae(saju.yp[1]);
    const [a, b, c] = s.years.map(x => x.year);
    assert.equal(b, a + 1, `${y}: 삼재가 이어지지 않는다 (${a}, ${b}, ${c})`);
    assert.equal(c, a + 2, `${y}: 삼재가 이어지지 않는다 (${a}, ${b}, ${c})`);
    if (s.inSamjae) {
      assert.ok(s.now >= a && s.now <= c, `${y}: 삼재라면서 올해가 밖에 있다`);
    } else {
      const left = a - s.now;
      assert.ok(left >= 1 && left <= 9, `${y}: 남은 해가 ${left} 다 — 카드가 없는 값이다`);
    }
  }
});

test('⚠️ 페이지로 나가는 스크립트가 문법에 맞는다', async () => {
  // 워커의 템플릿 문자열을 거쳐 나가므로 여기서만 깨질 수 있다.
  // 삼재 안일 때와 밖일 때 문구가 다르니 둘 다 본다.
  const seen = { in: false, out: false };
  for (const y of YEARS) {
    const html = await htmlOf(y);
    const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(js, `${y}: 스크립트가 없다`);
    assert.doesNotThrow(() => new vm.Script(js), `${y}: 브라우저에서 SyntaxError 가 난다`);
    if (ogNameOf(html).match(/삼재$/)) seen.in = true; else seen.out = true;
  }
  assert.ok(seen.in && seen.out, '삼재 안·밖 두 경우를 다 못 봤다');
});

test('범위 밖 해는 페이지를 내지 않는다', () => {
  // null 이어야 라우터가 폼 페이지 쪽으로 떨어진다.
  for (const y of [1899, 0, THIS_YEAR + 1, 9999]) {
    assert.equal(H.handleSamjaeYearPage(y), null, `${y}: 페이지가 나왔다`);
  }
});

test('검색에 걸리게 돼 있다', async () => {
  const html = await htmlOf(1990);
  assert.doesNotMatch(html, /noindex/, '검색에서 빠지게 해 놨다');
  assert.match(html, /rel="canonical" href="[^"]+\/calc\/samjae\/1990"/, '정규주소가 자기 자신이 아니다');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.match(title, /1990년생 삼재/, `제목에 검색하는 말이 없다 (${title})`);
  const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  assert.ok(desc && desc.length >= 40, '설명이 부실하다');
});

test('사이트맵이 해마다 한 줄씩 싣는다', async () => {
  const sm = await H.handleSitemap().text();
  const years = [...sm.matchAll(/\/calc\/samjae\/(\d{4})</g)].map(m => Number(m[1]));
  assert.ok(years.length > 50, `연도 페이지가 ${years.length} 개뿐이다`);
  assert.equal(years.at(-1), THIS_YEAR, '올해가 빠졌다');
  // 검색해서 들어올 만한 세대는 다 있어야 한다.
  for (const y of [1960, 1975, 1990, 2005]) {
    assert.ok(years.includes(y), `${y}년이 사이트맵에 없다`);
  }
});

test('폼은 결과 주소로 보낸다', async () => {
  // 폼 안에서 답을 그려 버리면 링크를 보내도 상대는 빈 폼을 본다 — 만든 이유가 사라진다.
  const html = await H.handleCalcPage('samjae').text();
  assert.match(html, /location\.href = '\/calc\/samjae\/'/, '결과 주소로 안 보낸다');
  assert.doesNotMatch(html, /\/api\/calc\/samjae/, '아직 폼 안에서 답을 그린다');
});
