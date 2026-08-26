// 웹 화면에 적힌 엽전 값 = 서버가 실제로 빼는 값.
//
// 미니앱은 mini-price-parity 가 이걸 지키고 있었는데 웹에는 같은 잣대가 없었다.
// 그래서 서랍 메뉴만 옛 가격에 머물러 있었다 — 관상 2/실제 4, 토정비결 2/4,
// 라이프패스 1/2, 유형 궁합 1/2. 화면에 적힌 것보다 **더** 빠져나가는 쪽이라
// 사용자가 손해를 보는 방향이고, 아무 데서도 티가 나지 않았다.
//
// 값이 세 곳에 흩어져 있던 것이 원인이라 먼저 한 곳(CONTENT_COST)으로 모으고,
// 여기서 그 한 곳을 서버와 대조한다. 지키는 것:
//   1) CONTENT_COST 의 값 = worker.js 핸들러의 COST
//   2) 홈 타일도 서랍도 그 표에서만 값을 읽는다(숫자를 직접 적지 않는다)
//   3) 번역 파일에 "(엽전 N)" 같은 값이 다시 들어오지 않는다 — 네 언어에
//      흩어지면 한 곳만 고치고 나머지가 남는다. 실제로 그렇게 남아 있었다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const appSrc = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');
const localesSrc = readFileSync(join(ROOT, 'js', 'locales.js'), 'utf8');

// 콘텐츠 id → 서버 경로. 여기 손으로 적는 이유는 openXxx() 가 대개 모달만 열고
// 실제 fetch 는 다른 함수에서 일어나 소스만 보고는 짝을 지을 수 없기 때문이다.
// 표에 없는 id 가 CONTENT_COST 에 생기면 아래 '빠짐없이' 검사가 잡는다.
const PATHS = {
  wealth: '/api/wealth', sinsal: '/api/sinsal', gwiin: '/api/gwiin', vocation: '/api/vocation',
  daeun: '/api/daeun', pastlife: '/api/past-life', compat: '/api/compat-timing', intimacy: '/api/intimacy',
  relation: '/api/relation', typecompat: '/api/type-compat', spouse: '/api/spouse-palace',
  name: '/api/name-reading', naming: '/api/naming', photo: '/api/photo-reading', numerology: '/api/numerology',
  takil: '/api/auspicious-days', direction: '/api/direction', yearluck: '/api/year-luck', tojeong: '/api/tojeong',
  ttirank: '/api/tti-ranking', zodiac: '/api/zodiac-fortune', topic: '/api/fortune-topic', lucky: '/api/lucky-picks',
  astro: '/api/astro-transit', lotto: '/api/lotto-numbers', tarot: '/api/tarot-draw', iching: '/api/iching',
  rune: '/api/rune-reading', dream: '/api/dream-interpretation',
};

/** app.js 에서 값표만 떼어 읽는다(파일 전체는 브라우저 전역을 요구해서 못 돌린다). */
function contentCost() {
  const at = appSrc.indexOf('const CONTENT_COST = {');
  assert.ok(at >= 0, 'js/app.js 에 CONTENT_COST 표가 없다 — 값을 다시 흩어 놓았는가?');
  const end = appSrc.indexOf('};', at);
  return runInNewContext(appSrc.slice(at, end + 2) + '\nCONTENT_COST');
}

function handlerFor(path) {
  const at = worker.indexOf(`path === '${path}'`);
  if (at < 0) return null;
  const m = worker.slice(at, at + 800).match(/(handle\w+)\(request, env\)/);
  return m ? m[1] : null;
}

/** 핸들러가 실제로 빼는 값. mini-contents.test.mjs 와 같은 방식으로 읽는다. */
function costOf(handler) {
  const at = worker.indexOf(`async function ${handler}(`);
  if (at < 0) return null;
  const span = worker.slice(at, at + 9000);
  const m = span.match(/accountSpend\(env, acct, '[a-z_]+', (\w+)\)/);
  if (!m) return null;
  if (/^\d+$/.test(m[1])) return Number(m[1]);
  // 템플릿 문자열 안에서는 \d 가 그냥 'd' 가 된다 — 정규식은 이어 붙여 만든다.
  const re = new RegExp('const ' + m[1] + ' = ([0-9]+)');
  const c = span.match(re) || worker.match(re);
  return c ? Number(c[1]) : null;
}

test('⚠️ 화면에 적힌 값이 서버가 빼는 값과 같다', () => {
  const COST = contentCost();
  for (const [id, cost] of Object.entries(COST)) {
    const path = PATHS[id];
    assert.ok(path, `CONTENT_COST 에 '${id}' 가 있는데 이 검사의 PATHS 에는 없다 — 경로를 적어 줄 것`);
    const handler = handlerFor(path);
    assert.ok(handler, `${id}: 라우터에 ${path} 가 없다`);
    const server = costOf(handler);
    assert.equal(cost, server,
      `${id}: 화면은 ${cost}, 서버(${handler})는 ${server} — 사용자가 적힌 것과 다르게 낸다`);
  }
});

test('값표가 콘텐츠를 빠짐없이 담고 있다', () => {
  const COST = contentCost();
  assert.ok(Object.keys(COST).length >= 25, `${Object.keys(COST).length}개뿐이다 — 표를 확인할 것`);
  for (const id of Object.keys(PATHS)) {
    assert.ok(id in COST, `${id} 가 값표에 없다 — 타일·서랍이 값 없이 그려진다`);
  }
});

test('⚠️ 홈 타일이 값을 직접 적지 않는다', () => {
  // 직접 적기 시작하면 서버 값을 바꿔도 여기가 안 따라온다 — 원래 그래서 어긋났다.
  const inline = [...appSrc.matchAll(/cost:\s*(\d+),\s*fn:'(\w+\(\))'/g)]
    .filter(m => m[1] !== '0');   // 무료 타일은 0 을 그대로 둔다
  assert.equal(inline.length, 0,
    `타일이 값을 직접 적고 있다: ${inline.map(m => `${m[2]}=${m[1]}`).join(', ')}`);
  const fromTable = [...appSrc.matchAll(/cost:CONTENT_COST\.(\w+),\s*fn:'\w+\(\)'/g)];
  assert.ok(fromTable.length >= 25, `표에서 값을 읽는 타일이 ${fromTable.length}개뿐이다`);
});

test('⚠️ 서랍도 같은 표에서 값을 읽는다', () => {
  const drawer = [...appSrc.matchAll(/_t\('drSub(\w+)', _withCost\(t\.dr\w+Sub, CONTENT_COST\.(\w+)\)\)/g)];
  assert.equal(drawer.length, 12, `서랍의 유료 항목 12개 중 ${drawer.length}개만 표를 읽는다`);
  const COST = contentCost();
  for (const [, id, key] of drawer) {
    assert.ok(key in COST, `서랍 ${id} 가 값표에 없는 '${key}' 를 읽는다`);
  }
});

test('⚠️ 서랍 이름표를 따로 두지 않는다', () => {
  // dr*Title 이 타일과 다른 이름을 들고 있어서, 이름을 바꿔도 홈에만 반영되고
  // 서랍은 옛 이름으로 남았다. 이름은 콘텐츠마다 하나여야 한다.
  // 서랍에는 콘텐츠가 아닌 항목(처음으로·마이페이지·테마…)도 있고 그것들은 자기
  // 이름표를 가져도 된다. 홈 타일과 겹치는 열두 콘텐츠만 본다.
  const CONTENTS = ['Tarot', 'Zodiac', 'Lucky', 'Type', 'Fortune', 'Iching',
    'Numerology', 'Tojeong', 'Photo', 'Dream', 'Lotto', 'Rune'];
  const revived = CONTENTS.filter(id => appSrc.includes(`t.dr${id}Title`));
  assert.deepEqual(revived, [],
    `서랍 전용 이름표가 되살아났다: ${revived.join(', ')} — 타일이 쓰는 이름 키를 함께 쓸 것`);
  const inLocales = CONTENTS.filter(id => new RegExp('\bdr' + id + 'Title:').test(localesSrc));
  assert.deepEqual(inLocales, [], `번역 파일에 서랍 전용 이름표가 남아 있다: ${inLocales.join(', ')}`);
});

test('⚠️ 번역 파일에 값을 다시 적지 않는다', () => {
  // 네 언어가 표기까지 달라(엽전 N / N tokens /（N代币）/（トークンN）) 여기 두면
  // 한 곳을 고쳐도 나머지 셋이 옛 값으로 남는다.
  // 서랍뿐 아니라 모든 설명줄(*Sub)을 본다 — 화면에 안 걸린 설명줄에도 옛 값이
  // 남아 있었다(대운 3/실제 6, 이름 2/4, 궁합 시기 3/6). 언젠가 그 줄을 화면에
  // 걸면 그때부터 틀린 가격이 뜬다.
  const offenders = [...localesSrc.matchAll(/(\w+Sub):\s*('[^']*'|"[^"]*")/g)]
    .filter(([, , v]) => /엽전\s*\d|\d\s*tokens?|\d\s*代币|トークン\s*\d/.test(v))
    .map(([, k, v]) => `${k}=${v}`);
  assert.deepEqual(offenders, [], `설명줄에 값이 박혀 있다: ${offenders.join(' · ')}`);
});
