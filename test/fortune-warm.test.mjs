// 크론이 미리 채우는 자리와, 사용자 요청이 만드는 자리가 같은 자리인지.
//
// 예열의 값어치는 전부 "핸들러가 쓸 bucket 을 정확히 맞히는가"에 달려 있다. 한 글자라도
// 어긋나면 크론은 아무도 안 읽는 행을 매일 밤 만들고, 사용자는 여전히 매번 Gemini 를
// 부른다 — 그리고 그 상태는 화면만 봐선 전혀 티가 안 난다(느릴 뿐 잘 동작한다).
// 그래서 bucket 과 프롬프트를 한 자리(tarotSpec/runeSpec/typeCompatSpec)에서만 만들고,
// 여기서 그 자리가 실제로 공유되는지 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const {
  permanentFortuneSpecs, selectWarmTargets, purgeStaleFortunes,
  storeFortune, tarotSpec, runeSpec, typeCompatSpec,
  TAROT_CARDS, RUNE_NAMES, TYPE_ELEMENTS,
} = await loadWorker([
  'permanentFortuneSpecs', 'selectWarmTargets', 'purgeStaleFortunes',
  'storeFortune', 'tarotSpec', 'runeSpec', 'typeCompatSpec',
  'TAROT_CARDS', 'RUNE_NAMES', 'TYPE_ELEMENTS',
]);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerSrc = readFileSync(join(ROOT, 'worker.js'), 'utf8');

test('예열 목록이 날짜 없는 자리를 빠짐없이 덮는다', () => {
  const specs = permanentFortuneSpecs();
  const expected = 4 * (TAROT_CARDS.length * 2 + RUNE_NAMES.length * 2 + TYPE_ELEMENTS.length ** 2);
  assert.equal(specs.length, expected, `예열 자리가 ${specs.length}개 — 기대 ${expected}개`);

  const buckets = new Set(specs.map(s => s.bucket));
  assert.equal(buckets.size, specs.length, '중복된 bucket 이 있다');
  for (const s of specs) assert.ok(s.prompt?.length > 50, `${s.bucket}: 프롬프트가 비었다`);
});

test('예열 목록에 날짜가 섞여 들어가지 않는다', () => {
  // 날짜가 들어간 자리를 여기에 넣으면 하루 지나 아무도 안 읽는 행이 된다.
  for (const s of permanentFortuneSpecs()) {
    assert.doesNotMatch(s.bucket, /\d{4}-\d{2}-\d{2}/, `${s.bucket} 에 날짜가 들어 있다`);
  }
});

test('핸들러가 부르는 spec 함수와 예열이 부르는 것이 같다', () => {
  // 핸들러 쪽에 bucket 문자열을 직접 적어 두면(예: `tarot|${lang}|...`) 예열과 갈라진다.
  // 세 핸들러가 spec 함수를 통해서만 bucket 을 얻는지 소스에서 확인한다.
  for (const [fn, handler] of [
    ['tarotSpec', 'handleTarotDraw'],
    ['runeSpec', 'handleRuneReading'],
    ['typeCompatSpec', 'handleTypeCompat'],
  ]) {
    const at = workerSrc.indexOf(`async function ${handler}(`);
    assert.ok(at >= 0, `${handler} 를 찾지 못했다`);
    const body = workerSrc.slice(at, at + 5000);
    assert.match(body, new RegExp(`${fn}\\(`), `${handler} 가 ${fn} 을 쓰지 않는다`);
    assert.doesNotMatch(body, /cachedFortune\(\s*env,\s*`/,
      `${handler} 가 bucket 문자열을 직접 적고 있다 — 예열과 갈라진다`);
  }
});

test('같은 인자로 부르면 언제나 같은 bucket 과 프롬프트가 나온다', () => {
  for (const [a, b] of [
    [tarotSpec('ko', 7, true), tarotSpec('ko', 7, true)],
    [runeSpec('ja', 3, false), runeSpec('ja', 3, false)],
    [typeCompatSpec('en', '木', '水'), typeCompatSpec('en', '木', '水')],
  ]) {
    assert.deepEqual(a, b);
  }
});

test('이미 채워진 자리는 다시 만들지 않는다', async () => {
  const { DB } = createD1();
  const env = { DB };
  const first = permanentFortuneSpecs().slice(0, 5);
  for (const s of first) await storeFortune(env, s.bucket, '이미 있음');

  const targets = await selectWarmTargets(env, 5);
  const filled = new Set(first.map(s => s.bucket));
  for (const t of targets) {
    assert.ok(!filled.has(t.bucket), `${t.bucket} 은 이미 채워졌는데 또 고른다`);
  }
});

test('변형이 적은 자리를 먼저 고른다', async () => {
  const { DB } = createD1();
  const env = { DB };
  const specs = permanentFortuneSpecs();
  // 앞 3개만 빼고 전부 1개씩 채운다 — 빈 3개가 먼저 나와야 한다.
  for (const s of specs.slice(3, 60)) await storeFortune(env, s.bucket, 'x');

  const targets = await selectWarmTargets(env, 3);
  assert.deepEqual(targets.map(t => t.bucket).sort(), specs.slice(0, 3).map(s => s.bucket).sort());
});

test('오래된 날짜 자리만 지우고 영구 자리는 남긴다', async () => {
  const { db, DB } = createD1();
  const env = { DB };
  const now = Math.floor(Date.now() / 1000);
  const old = now - 10 * 86400;

  // 직접 넣어야 created_at 을 과거로 둘 수 있다.
  const ins = db.prepare('INSERT INTO fortune_cache (id,bucket,reading,created_at) VALUES (?,?,?,?)');
  ins.run('a', 'zodiac|ko|0|0|2026-07-01', '오래된 띠운세', old);
  ins.run('b', 'lucky|ko|2026-07-01', '오래된 럭키', old);
  ins.run('c', 'numerology|ko|7|2026-07-01', '오래된 수비학', old);
  ins.run('d', 'tarot|ko|0|u', '영구 타로', old);          // 오래됐지만 날짜를 안 탄다
  ins.run('e', 'rune|ko|0|u', '영구 룬', old);
  ins.run('f', 'typecompat|ko|木|火', '영구 궁합', old);
  ins.run('g', 'zodiac|ko|1|1|2026-08-09', '오늘 띠운세', now);

  await purgeStaleFortunes(env, now);

  const left = db.prepare('SELECT id FROM fortune_cache ORDER BY id').all().map(r => r.id);
  assert.deepEqual(left, ['d', 'e', 'f', 'g'],
    '영구 자리를 지웠거나 오래된 날짜 자리를 남겼다');
});
