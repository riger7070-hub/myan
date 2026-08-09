// 홈 화면의 콘텐츠 타일이 실제로 눌리는지.
//
// _homeSections() 는 각 타일의 동작을 `fn:'openXxx()'` 라는 문자열로 들고 있다가
// onclick 에 그대로 박는다. 문자열이라 이름을 잘못 적어도 어디서도 터지지 않고,
// 배포된 뒤 사용자가 눌렀을 때 콘솔에서만 조용히 실패한다. 라벨도 마찬가지로
// `t.someKey` 를 참조하는데 그 키가 없으면 화면에 undefined 가 뜬다.
//
// 콘텐츠가 늘고 묶음을 다시 나눌 때 가장 깨지기 쉬운 자리라 여기서 붙잡는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSrc = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');

// _homeSections() 본문만 떼어낸다 — app.js 전체를 평가할 수는 없다(브라우저 전역 투성이).
const body = appSrc.match(/function _homeSections\(\) \{[\s\S]*?\n\}/);
assert.ok(body, '_homeSections 를 찾지 못했다 — 함수 이름이 바뀌었는지 확인할 것');

// t.someKey 를 그대로 돌려주는 스텁으로 평가하면 어떤 키를 참조하는지 그대로 드러난다.
const usedKeys = new Set();
const tStub = new Proxy({}, { get: (_o, p) => { usedKeys.add(String(p)); return undefined; } });
const sections = runInNewContext(
  `${body[0]}\n; __out = _homeSections();`,
  { getT: () => tStub, __out: null },
  { timeout: 2000 },
) ?? runInNewContext(`${body[0]}\n_homeSections()`, { getT: () => tStub });

// locales.js 의 ko 블록 (번역 4개국어 대조는 locales-parity 가 따로 본다)
const localesSrc = ['constants.js', 'locales.js']
  .map(f => readFileSync(join(ROOT, 'js', f), 'utf8')).join('\n');
const anyStub = new Proxy(function () {}, {
  get: (_t, p) => (p === Symbol.toPrimitive || p === 'toString' ? () => '' : anyStub),
  apply: () => anyStub, set: () => true,
});
const sandbox = {
  localStorage: anyStub, document: anyStub, window: anyStub, navigator: anyStub,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  fetch: () => Promise.resolve(anyStub), console, __TX: null,
};
runInNewContext(`${localesSrc}\n; __TX = TX;`, sandbox);
const ko = sandbox.__TX.ko;

test('모든 타일이 실제로 존재하는 함수를 부른다', () => {
  const calls = sections.flatMap(s => s.items.map(i => i.fn));
  assert.ok(calls.length >= 15, `타일이 너무 적다(${calls.length})`);

  for (const call of calls) {
    const m = call.match(/^(\w+)\(\)$/);
    assert.ok(m, `호출 형태가 아니다: ${call}`);
    assert.match(appSrc, new RegExp(`function ${m[1]}\\s*\\(`),
      `${call} 에 해당하는 함수가 app.js 에 없다 — 누르면 아무 일도 안 일어난다`);
  }
});

test('타일이 참조하는 번역 키가 모두 있다', () => {
  assert.ok(usedKeys.size > 0, '번역 키를 하나도 참조하지 않는다 — 스텁이 동작하지 않았다');
  for (const key of usedKeys) {
    assert.ok(key in ko, `번역 키가 없다: ${key} (화면에 undefined 가 뜬다)`);
  }
});

test('같은 콘텐츠가 두 칸에 중복해서 놓이지 않는다', () => {
  const calls = sections.flatMap(s => s.items.map(i => i.fn));
  assert.equal(new Set(calls).size, calls.length,
    `중복된 타일이 있다: ${calls.filter((c, i) => calls.indexOf(c) !== i).join(', ')}`);
});

test('묶음이 한쪽으로 몰리지 않는다', () => {
  // 계열이 아니라 목적으로 나눈 이유가 이것이다 — 한 칸이 비대해지면 다시 나눌 때가 된 것.
  assert.ok(sections.length >= 3, '묶음이 너무 적다');
  for (const s of sections) {
    assert.ok(s.items.length >= 2, `${s.title}: 타일이 2개 미만이면 묶음이 될 이유가 없다`);
    assert.ok(s.items.length <= 7, `${s.title}: ${s.items.length}개는 한 칸에 너무 많다 — 다시 나눌 것`);
  }
});

test('타일에 적힌 값이 서버가 실제로 빼는 값과 같다', () => {
  // 홈에는 ✦2 라고 써 놓고 서버가 3을 빼면 그건 값을 잘못 받은 것이다. 두 숫자가
  // 다른 파일에 따로 적혀 있어 한쪽만 고치기 쉬우므로 여기서 맞물려 둔다.
  // 이 표가 홈 타일과 결제 핸들러를 잇는 유일한 연결이다 — 새 유료 기능은 여기에도 적을 것.
  const HANDLER_OF = {
    'openDaeun()':          'handleDaeun',
    'openNameReading()':    'handleNameReading',
    'openPhotoReading()':   'handlePhotoReading',
    'openTypeTest()':       'handleTypeCompat',
    'openNumerology()':     'handleNumerology',
    'openAuspiciousDays()': 'handleAuspiciousDays',
    'openCompatTiming()':   'handleCompatTiming',
    'openTojeong()':        'handleTojeong',
    'openTarotDraw()':      'handleTarotDraw',
    'openIching()':         'handleIching',
    'openRuneReading()':    'handleRuneReading',
    'openDreamInterpretation()': 'handleDreamInterpretation',
    'openAstroTransit()':   'handleAstroTransit',
    'openZodiacFortune()':  'handleZodiacFortune',
    'openFortuneTopics()':  'handleFortuneTopic',
    'openLuckyPicks()':     'handleLuckyPicks',
    'openLottoNumbers()':   'handleLottoNumbers',
    'openFortuneModal()':   null,   // 무료 — 차감 핸들러가 없다
  };

  const workerSrc = readFileSync(join(ROOT, 'worker.js'), 'utf8');
  // 핸들러 하나의 본문에서 차감액을 읽는다. -1 처럼 그 자리에 박아 둔 것과
  // COST 변수를 바인딩으로 넘기는 것 두 가지 모양이 다 쓰인다.
  const costOf = (handler) => {
    const at = workerSrc.indexOf(`async function ${handler}(`);
    assert.ok(at >= 0, `worker.js 에 ${handler} 가 없다`);
    const span = workerSrc.slice(at, at + 6000);
    const m = span.match(/'[a-z_]+_use', 0, (-?\w+|\?)/);
    assert.ok(m, `${handler}: 차감 구문을 찾지 못했다`);
    if (m[1] === '?' || m[1].endsWith('COST')) {
      const c = span.match(/const COST = (\d+)/);
      assert.ok(c, `${handler}: COST 를 바인딩하는데 선언을 찾지 못했다`);
      return Number(c[1]);
    }
    return Math.abs(Number(m[1]));
  };

  for (const sec of sections) {
    for (const item of sec.items) {
      assert.ok(item.fn in HANDLER_OF,
        `${item.fn} 가 위 표에 없다 — 새 유료 기능이면 핸들러 이름을 적을 것`);
      const handler = HANDLER_OF[item.fn];
      if (!handler) { assert.equal(item.cost, 0, `${item.fn}: 무료로 적혀 있는데 비용이 ${item.cost} 다`); continue; }
      assert.equal(item.cost, costOf(handler),
        `${item.fn}: 홈에는 ${item.cost}, ${handler} 는 ${costOf(handler)} 를 뺀다`);
    }
  }
});

test('토큰 비용이 타일마다 붙어 있다', () => {
  // 누르기 전에 값을 알 수 있어야 한다. 무료(0)는 있어도 되지만 undefined 는 안 된다.
  for (const s of sections) {
    for (const i of s.items) {
      assert.equal(typeof i.cost, 'number', `${i.fn}: 비용이 숫자가 아니다`);
      assert.ok(i.cost >= 0 && i.cost <= 5, `${i.fn}: 비용이 ${i.cost} 다`);
    }
  }
});
