// 무료 계산기와 오늘의 띠 순위.
//
// 검색해서 들어오는 사람이 앉을 자리다. 초대 페이지와 반대로 여기는 **검색에 걸려야**
// 하고, 로그인도 AI 도 없어야 한다. 그 두 가지가 어긋나면 이 페이지를 둔 이유가 없다.
//
// 그리고 지난번에 핸들러를 만들어 놓고 한 번도 부르지 않아 500 을 프로덕션에서
// 만났다(NL is not defined). 여기서는 전부 실제로 불러 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadWorker } from './load-worker.mjs';

const H = await loadWorker([
  'handleCalcHub', 'handleCalcPage', 'handleCalcApi', 'handleTtiPage', 'handleRobots', 'handleSitemap', 'handleSearchVerify',
  'computeTtiRanking', 'computeSaju', 'computeSamjae',
]);

const KINDS = ['samjae', 'sinsal', 'bonmyeong'];
const post = (kind, body) => new Request('https://x/api/calc/' + kind, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const call = async (kind, body) => {
  const r = await H.handleCalcApi(post(kind, body), kind);
  return { status: r.status, json: JSON.parse(await r.text()) };
};

// ── 검색에 걸려야 한다 ──

test('공개 페이지에 noindex 가 붙지 않는다', async () => {
  // 초대 페이지에서 noindex 를 쓰다가 여기까지 옮겨 붙이면 둔 이유가 사라진다.
  const pages = [H.handleCalcHub(), H.handleTtiPage(), ...KINDS.map(k => H.handleCalcPage(k))];
  for (const res of pages) {
    const html = await res.text();
    assert.doesNotMatch(html, /noindex/, '검색에서 빠지게 해 놨다');
  }
});

test('제목·설명·정규주소가 다 있다', async () => {
  const pages = [
    ['/calc', H.handleCalcHub()], ['/tti', H.handleTtiPage()],
    ...KINDS.map(k => ['/calc/' + k, H.handleCalcPage(k)]),
  ];
  for (const [path, res] of pages) {
    const html = await res.text();
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title && title.length >= 10, `${path}: 제목이 부실하다 (${title})`);
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(desc && desc.length >= 40, `${path}: 설명이 부실하다`);
    assert.match(html, new RegExp(`rel="canonical" href="[^"]+${path.replace(/\//g, '\\/')}"`),
      `${path}: 정규주소가 자기 자신을 가리키지 않는다`);
    assert.match(html, /property="og:title"/, `${path}: 공유했을 때 미리보기가 안 붙는다`);
  }
});

test('사람들이 실제로 검색하는 말이 제목에 들어 있다', async () => {
  const want = {
    samjae: /삼재/, sinsal: /신살/, bonmyeong: /본명궁/,
  };
  for (const k of KINDS) {
    const html = await H.handleCalcPage(k).text();
    assert.match(html.match(/<title>([^<]+)</)[1], want[k], `${k}: 찾는 말이 제목에 없다`);
  }
});

const ALL = ['/tti', '/calc', '/calc/samjae', '/calc/sinsal', '/calc/bonmyeong'];

test('페이지끼리 서로 이어져 있다', async () => {
  // 하나만 걸려도 나머지로 넘어갈 수 있어야 한 번 온 사람이 더 본다.
  const pages = [['/calc', H.handleCalcHub()], ['/tti', H.handleTtiPage()],
    ...KINDS.map(k => ['/calc/' + k, H.handleCalcPage(k)])];
  for (const [self, res] of pages) {
    const html = await res.text();
    for (const p of ALL.filter(x => x !== self)) {
      assert.match(html, new RegExp(`href="${p}"`), `${self}: ${p} 로 가는 길이 없다`);
    }
    // 자기 자신으로 가는 링크는 자리만 먹는다.
    assert.doesNotMatch(html, new RegExp(`<a href="${self}"`), `${self}: 자기 자신을 가리킨다`);
  }
});

test('robots.txt 가 초대 자리를 막는다', async () => {
  const t = await H.handleRobots().text();
  assert.match(t, /Disallow: \/i\//, '남의 생년월일 받는 자리가 검색에 열려 있다');
  assert.match(t, /Disallow: \/api\//);
  assert.match(t, /Sitemap: https:\/\/[^\s]+\/sitemap\.xml/, '사이트맵을 안 알려 준다');
  assert.doesNotMatch(t, /^Disallow: \/$/m, '사이트 전체를 막아 놨다');
});

test('사이트맵에 공개 페이지가 다 들어 있다', async () => {
  const xml = await H.handleSitemap().text();
  for (const p of ALL) {
    assert.match(xml, new RegExp(`<loc>https://[^<]+${p.replace(/\//g, '\\/')}</loc>`),
      `${p} 가 사이트맵에 없다`);
  }
  // 초대 자리는 절대 실리면 안 된다.
  assert.doesNotMatch(xml, /\/i\//, '초대 주소가 사이트맵에 실렸다');
  assert.match(xml, /^<\?xml version="1\.0"/, 'XML 선언이 없다');
});

test('없는 계산기는 페이지를 만들지 않는다', () => {
  assert.equal(H.handleCalcPage('없는것'), null);
});

test('검색엔진 소유 확인은 넣어 둔 값에만 답한다', async () => {
  const env = { GOOGLE_VERIFY: 'google1a2b3c.html', NAVER_VERIFY: 'naverabc123.html' };
  const g = H.handleSearchVerify(env, '/google1a2b3c.html');
  assert.ok(g, '구글 확인 파일이 안 나온다');
  assert.match(await g.text(), /google-site-verification: google1a2b3c\.html/);

  const n = H.handleSearchVerify(env, '/naverabc123.html');
  assert.ok(n, '네이버 확인 파일이 안 나온다');

  // 아무 이름이나 답하면 남이 우리 사이트를 자기 것으로 등록할 수 있다.
  assert.equal(H.handleSearchVerify(env, '/google아무거나.html'), null, '아무 이름에나 답한다');
  assert.equal(H.handleSearchVerify({}, '/google1a2b3c.html'), null, '값을 안 넣었는데 답한다');
});

// ── 실제로 계산이 된다 ──

const 삼재해 = (json) =>
  json.cards.map(c => c.label.match(/^(\d{4})년$/)?.[1]).filter(Boolean).map(Number);

test('삼재는 연달아 세 해가 나온다', async () => {
  const { status, json } = await call('samjae', { year: 1990 });
  assert.equal(status, 200);
  const years = 삼재해(json);
  assert.equal(years.length, 3, `세 해가 아니다: ${JSON.stringify(json.cards)}`);
  assert.equal(years[1], years[0] + 1, '해가 이어지지 않는다');
  assert.equal(years[2], years[0] + 2, '해가 이어지지 않는다');
  assert.match(json.cards.map(c => c.text).join(' '), /들삼재/);
});

test('⚠️ 해만 받을 때 입춘을 넘겨 세운다', async () => {
  // computeSaju 에 1월 1일을 넣으면 입춘 전이라 모두 앞 해의 띠가 된다.
  // 실제로 그랬다 - 1990년생(말띠)이 뱀띠로 계산돼 삼재가 2028이 아닌 2031로 나왔다.
  // 띠가 맞는지를 봐야 잡힌다. 해가 이어지는지만 보면 틀린 채로도 통과한다.
  //
  // 1990 = 庚午(말띠) → 寅午戌 삼합국 → 삼재는 申酉戌 해 → 2028·2029·2030
  const 말띠 = 삼재해((await call('samjae', { year: 1990 })).json);
  assert.deepEqual(말띠, [2028, 2029, 2030], `말띠 삼재가 틀렸다`);

  // 1989 = 己巳(뱀띠) → 巳酉丑 삼합국 → 삼재는 亥子丑 해 → 2031·2032·2033
  const 뱀띠 = 삼재해((await call('samjae', { year: 1989 })).json);
  assert.deepEqual(뱀띠, [2031, 2032, 2033], `뱀띠 삼재가 틀렸다`);

  assert.notDeepEqual(말띠, 뱀띠, '해가 달라도 같은 답이 나온다 - 띠를 안 보고 있다');
});

test('입춘 전 출생은 안내해 둔다', async () => {
  // 해만 받는 이상 1·2월생은 우리가 구분할 수 없다. 말이라도 해 줘야 한다.
  for (const k of ['samjae', 'bonmyeong']) {
    const html = await H.handleCalcPage(k).text();
    assert.match(html, /입춘/, `${k}: 입춘 안내가 없다 - 1·2월생이 조용히 틀린 답을 받는다`);
  }
});

test('신살은 어느 기둥에 있는지까지 말해 준다', async () => {
  const { status, json } = await call('sinsal', { year: 1990, month: 5, day: 15, hour: '오시' });
  assert.equal(status, 200);
  assert.ok(json.cards.length > 0);
  const t = json.cards.map(c => c.text).join(' ');
  assert.match(t, /[년월일시]주에 있습니다|두드러진|삼재/, `자리를 안 짚어 준다: ${t.slice(0, 120)}`);
  // 뜻이 빠지면 이름만 나열하는 꼴이 된다.
  assert.ok(json.cards.some(c => c.text.length > 20), '뜻이 안 붙었다');
});

test('시를 몰라도 신살이 나온다', async () => {
  const { status, json } = await call('sinsal', { year: 1990, month: 5, day: 15, hour: '' });
  assert.equal(status, 200, JSON.stringify(json));
  assert.ok(json.cards.length > 0);
});

test('본명궁은 좋은 방위와 피할 방위를 함께 준다', async () => {
  const { status, json } = await call('bonmyeong', { year: 1990, gender: 'M' });
  assert.equal(status, 200);
  const labels = json.cards.map(c => c.label);
  assert.ok(labels.some(l => /본명궁/.test(l)), '본명궁이 없다');
  assert.ok(labels.includes('좋은 방위'), '좋은 방위가 없다');
  assert.ok(labels.includes('피하면 좋은 방위'), '피할 방위가 없다');
  for (const c of json.cards) assert.ok(c.text.trim(), `${c.label} 의 내용이 비었다`);
});

test('남녀의 본명궁이 다르다', async () => {
  const m = (await call('bonmyeong', { year: 1990, gender: 'M' })).json.cards[0].label;
  const f = (await call('bonmyeong', { year: 1990, gender: 'F' })).json.cards[0].label;
  assert.notEqual(m, f, '성별을 안 보고 있다');
});

test('말이 안 되는 해는 받지 않는다', async () => {
  for (const k of KINDS) {
    for (const year of [1899, 3000, 'abc', null, '']) {
      const { status } = await call(k, { year, month: 5, day: 15, gender: 'M' });
      assert.equal(status, 400, `${k}: ${year} 를 받아들였다`);
    }
  }
});

test('신살은 월·일도 검사한다', async () => {
  assert.equal((await call('sinsal', { year: 1990, month: 13, day: 1 })).status, 400);
  assert.equal((await call('sinsal', { year: 1990, month: 1, day: 32 })).status, 400);
});

test('없는 계산은 400 이다', async () => {
  assert.equal((await call('없는것', { year: 1990 })).status, 400);
});

// ── 오늘의 띠 순위 ──

test('띠 순위는 페이지에 미리 박혀 있다', async () => {
  // 열자마자 보여야 하고, 검색 엔진도 그대로 읽어 가야 한다.
  const html = await H.handleTtiPage().text();
  for (const n of ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지']) {
    assert.match(html, new RegExp(`>${n}띠<`), `${n}띠가 페이지에 없다`);
  }
  const ranks = [...html.matchAll(/<td class="r">(\d+)<\/td>/g)].map(m => +m[1]);
  assert.deepEqual(ranks, [1,2,3,4,5,6,7,8,9,10,11,12], '순위가 1~12 가 아니다');
});

test('1위 띠가 제목에 실린다', async () => {
  // 카톡에 뿌려질 때 제목만 보고도 누를 이유가 생겨야 한다.
  const html = await H.handleTtiPage().text();
  const top = html.match(/<tr data-b="[^"]+" class="top">\s*<td class="r">1<\/td><td>([^띠]+)띠/)[1];
  assert.match(html.match(/<title>([^<]+)</)[1], new RegExp(`1위는 ${top}띠`), '1위가 제목에 없다');
});

test('같은 날 다시 열어도 순위가 같다', async () => {
  // 뽑기면 아무도 안 믿는다. 날짜의 함수여야 한다.
  const a = await H.handleTtiPage().text();
  const b = await H.handleTtiPage().text();
  const rows = (h) => [...h.matchAll(/<td>(\S+?)띠<\/td>/g)].map(m => m[1]);
  assert.deepEqual(rows(a), rows(b));
});

test('띠 순위 페이지 스크립트가 실제로 파싱된다', async () => {
  const html = await H.handleTtiPage().text();
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, '스크립트가 없다');
  new vm.Script(m[1], { filename: 'tti-inline.js' });
});

test('계산기 페이지 스크립트도 파싱된다', async () => {
  for (const k of KINDS) {
    const html = await H.handleCalcPage(k).text();
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(m, `${k}: 스크립트가 없다`);
    new vm.Script(m[1], { filename: k + '-inline.js' });
    // 폼의 칸 이름과 스크립트가 읽는 이름이 어긋나면 값이 안 실려 간다.
    for (const id of [...html.matchAll(/id="(f-\w+)"/g)].map(x => x[1])) {
      assert.match(m[1], new RegExp(`'${id}'`), `${k}: ${id} 를 안 읽는다`);
    }
  }
});

test('내 띠 찾기는 서버를 부르지 않는다', async () => {
  // (해 - 4) % 12 면 되는 계산이다. 이걸로 서버를 부르면 호출만 는다.
  const html = await H.handleTtiPage().text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(script, /fetch\(/, '내 띠 찾자고 서버를 부른다');
  assert.match(script, /\(y - 4\) % 12/, '띠 계산이 안 들어 있다');
});

test('공개 페이지는 로그인을 요구하지 않는다', async () => {
  for (const res of [H.handleCalcHub(), H.handleTtiPage(), ...KINDS.map(k => H.handleCalcPage(k))]) {
    const html = await res.text();
    assert.doesNotMatch(html, /Authorization|Bearer|로그인이 필요/, '로그인을 끌어들인다');
  }
});

test('⚠️ 링크를 뿌렸을 때 미리보기 그림이 뜬다', async () => {
  // 홍보로 뿌릴 페이지들이다. og:image 가 없으면 카톡·디스콰이엇·트위터에
  // 회색 빈 칸이 뜬다 — 실제로 홈에만 있고 여기 넷은 다 빠져 있었다.
  const pages = [
    ['/calc', H.handleCalcHub()], ['/tti', H.handleTtiPage()],
    ...KINDS.map(k => ['/calc/' + k, H.handleCalcPage(k)]),
  ];
  for (const [path, res] of pages) {
    const html = await res.text();
    const img = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    assert.ok(img, `${path}: 미리보기 그림이 없다`);
    assert.match(img, /^https:\/\//, `${path}: 그림 주소가 절대 주소가 아니다 — 남의 화면에서 안 뜬다`);
    assert.doesNotMatch(img, /\.webp$/i,
      `${path}: webp 는 미리보기를 만드는 쪽이 못 읽는 데가 있다`);
    // 크기를 알려 주지 않으면 일부 메신저가 그림을 아예 안 받아 온다.
    assert.match(html, /property="og:image:width"/, `${path}: 그림 크기가 없다`);
    assert.match(html, /name="twitter:image"/, `${path}: 트위터용 그림이 없다`);
  }
});
