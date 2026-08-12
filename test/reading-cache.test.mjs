// 같은 물음에 Gemini 를 두 번 부르지 않는지.
//
// 사주는 바뀌지 않는다. 같은 생년월일로 신살을 물으면 어제도 오늘도 같은 답이 나와야
// 맞고, 매번 새로 지어 내면 API 값만 나가고 신뢰도 떨어진다. 특히 띠 순위는 하루에
// 열두 가지뿐이라 캐시가 없으면 사용자 수만큼 부르게 된다.
//
// 캐시가 없거나 고장 나도 풀이는 나가야 한다 — 아끼자고 기능을 막으면 안 된다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';
import { createD1 } from './d1-sqlite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const { cachedReading, _sajuKey, computeSaju } =
  await loadWorker(['cachedReading', '_sajuKey', 'computeSaju']);

const setup = () => { const { db, DB } = createD1(); return { db, env: { DB } }; };

test('두 번째 부를 때는 짓지 않고 저장한 것을 준다', async () => {
  const { env } = setup();
  let made = 0;
  const produce = async () => { made++; return '안도령의 풀이입니다.'; };

  const a = await cachedReading(env, 'sinsal:己巳丁丑乙酉辛巳M', 999, produce);
  const b = await cachedReading(env, 'sinsal:己巳丁丑乙酉辛巳M', 999, produce);

  assert.equal(a, b, '같은 물음에 다른 답을 준다');
  assert.equal(made, 1, `Gemini 를 ${made}번 불렀다 — 한 번이어야 한다`);
});

test('물음이 다르면 따로 짓는다', async () => {
  const { env } = setup();
  let made = 0;
  const produce = async () => { made++; return '풀이 ' + made; };
  await cachedReading(env, 'sinsal:AAA', 999, produce);
  await cachedReading(env, 'sinsal:BBB', 999, produce);
  assert.equal(made, 2, '다른 사주인데 같은 답을 돌려줬다');
});

test('시간이 지나면 다시 짓는다', async () => {
  const { db, env } = setup();
  let made = 0;
  const produce = async () => { made++; return '풀이'; };
  await cachedReading(env, 'ttirank:2026-08-12:卯', 999, produce);
  // 저장 시각을 이틀 전으로 돌려 놓는다.
  db.prepare(`UPDATE fortune_cache SET created_at = unixepoch() - 172800`).run();
  await cachedReading(env, 'ttirank:2026-08-12:卯', 3600, produce);
  assert.equal(made, 2, '만료됐는데 옛 답을 그대로 줬다');
});

test('빈 답은 저장하지 않는다', async () => {
  // 실패한 응답을 캐시에 넣으면 그 사주는 계속 빈 답만 받는다.
  const { db, env } = setup();
  await cachedReading(env, 'sinsal:EMPTY', 999, async () => '');
  const n = db.prepare(`SELECT COUNT(*) c FROM fortune_cache`).get().c;
  assert.equal(n, 0, '빈 답이 저장됐다');
});

test('캐시가 고장 나도 풀이는 나간다', async () => {
  // DB 가 없거나 던져도 기능이 멈추면 안 된다.
  const broken = { DB: { prepare() { throw new Error('DB 없음'); } } };
  const got = await cachedReading(broken, 'sinsal:X', 999, async () => '풀이는 나온다');
  assert.equal(got, '풀이는 나온다');
  const noDb = await cachedReading({}, 'sinsal:X', 999, async () => '이것도 나온다');
  assert.equal(noDb, '이것도 나온다');
});

test('캐시 키에 프롬프트에 드는 값이 다 들어간다', () => {
  const a = computeSaju(1999, 7, 18, '사시');
  const b = computeSaju(1999, 7, 18, '자시');       // 생시만 다르다
  assert.notEqual(_sajuKey(a, 'M'), _sajuKey(b, 'M'), '생시가 달라도 같은 키가 된다');
  assert.notEqual(_sajuKey(a, 'M'), _sajuKey(a, 'F'), '성별이 달라도 같은 키가 된다');
});

test('사주로 정해지는 풀이는 오래, 날짜를 타는 것은 하루만 둔다', () => {
  assert.match(SRC, /'sinsal:' \+ _sajuKey\(saju, g\), CACHE_LONG/);
  assert.match(SRC, /'pastlife:' \+ _sajuKey\(saju, g\), CACHE_LONG/);
  assert.match(SRC, /'vocation:' \+ _sajuKey\(saju, g\), CACHE_LONG/);
  // 띠 순위는 날짜와 내 띠가 키에 들어가야 한다. 안 그러면 남의 띠 풀이를 보게 된다.
  assert.match(SRC, /'ttirank:' \+ today \+ ':' \+ \(mine\?\.branch \|\| '-'\), CACHE_DAY/);
});

test('뽑기가 들어가는 콘텐츠는 캐시하지 않는다', () => {
  // 타로·룬·주역은 뽑는 재미가 절반이다. 같은 답이 나오면 그 재미가 사라진다.
  for (const fn of ['handleTarotDraw', 'handleRuneReading', 'handleIching']) {
    const i = SRC.indexOf('async function ' + fn + '(');
    assert.ok(i > 0, fn + ' 을 못 찾았다');
    const span = SRC.slice(i, SRC.indexOf('\nasync function ', i + 10));
    assert.doesNotMatch(span, /cachedReading\(/, fn + ' 이 캐시를 쓴다 — 매번 같은 카드가 나온다');
  }
});
