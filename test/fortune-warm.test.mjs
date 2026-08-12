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
  permanentFortuneSpecs, selectWarmTargets, purgeStaleFortunes, _warmLangRank,
  storeFortune, tarotSpec, runeSpec, typeCompatSpec,
  TAROT_CARDS, RUNE_NAMES, TYPE_ELEMENTS, WARM_CRON, WARM_BUDGET, WARM_GAP_MS,
} = await loadWorker([
  'permanentFortuneSpecs', 'selectWarmTargets', 'purgeStaleFortunes', '_warmLangRank',
  'storeFortune', 'tarotSpec', 'runeSpec', 'typeCompatSpec',
  'TAROT_CARDS', 'RUNE_NAMES', 'TYPE_ELEMENTS', 'WARM_CRON', 'WARM_BUDGET', 'WARM_GAP_MS',
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

test('예열 크론이 wrangler.toml 에 실제로 등록돼 있다', () => {
  // WARM_CRON 은 worker.js, 등록은 wrangler.toml — 두 파일에 나뉘어 있어 조용히 어긋난다.
  // 어긋나면 예열이 아무 크론에도 안 걸려 한 달이 지나도 캐시가 안 차거나,
  // 반대로 아침 푸시 시각에 같이 돌아 사용자를 한도에서 밀어낸다. 둘 다 화면엔 안 보인다.
  const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
  const line = toml.match(/^crons\s*=\s*\[(.+)\]/m);
  assert.ok(line, 'wrangler.toml 에서 crons 를 찾지 못했다');
  const registered = [...line[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  assert.ok(registered.includes(WARM_CRON),
    `WARM_CRON(${WARM_CRON}) 이 등록된 크론 ${JSON.stringify(registered)} 에 없다`);
});

test('예열 크론은 아침 푸시와 다른 시각이다', () => {
  const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');
  const registered = [...toml.match(/^crons\s*=\s*\[(.+)\]/m)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const others = registered.filter(c => c !== WARM_CRON);
  assert.ok(others.length >= 1, '푸시·재결제용 크론이 사라졌다');
  assert.ok(!others.includes(WARM_CRON), '예열이 다른 작업과 같은 시각에 돈다');
});

test('예열 한 번이 워커 서브리퀘스트 상한에 못 미친다', () => {
  // 유료 키로 바꾸면서 분당 한도는 사라졌고, 이제 속도를 막는 것은 워커 한 번 실행의
  // 서브리퀘스트 상한이다. 한 자리에 Gemini 1 + D1 2(개수 조회, INSERT) = 3건,
  // 거기에 예열 시작의 정리·조회 2건이 붙는다. 넘기면 크론이 중간에 통째로 끊긴다.
  const perEntry = 3;
  const subrequests = WARM_BUDGET * perEntry + 2;
  assert.ok(subrequests <= 700,
    `예열 한 번에 서브리퀘스트 ${subrequests}건 — 상한(유료 1000)에 여유가 없다`);
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

test('언어 우선순위가 한국어를 앞에 둔다', () => {
  // 468자리 중 351개가 en/zh/ja 다. 무료 등급일 땐 남는 한도를 쓰는 것이라 상관없었지만,
  // 유료로 바뀐 뒤에는 아무도 안 열 자리를 미리 사 두는 것이 그대로 비용이다.
  //
  // 순서를 selectWarmTargets 의 결과로만 확인하면 안 된다 — permanentFortuneSpecs 가
  // 마침 ko 부터 만들고 Array.sort 가 안정 정렬이라, 언어 비교를 통째로 빼도 통과한다.
  // (실제로 빼 보고 확인했다.) 그러니 비교 함수 자체를 본다.
  assert.ok(_warmLangRank('tarot|ko|0|u') < _warmLangRank('tarot|en|0|u'), 'ko 가 en 보다 뒤다');
  assert.ok(_warmLangRank('tarot|en|0|u') < _warmLangRank('tarot|zh|0|u'), 'en 이 zh 보다 뒤다');
  assert.equal(_warmLangRank('tarot|ko|0|u'), 0, 'ko 가 1순위가 아니다');
  // 모르는 언어가 한국어를 제치면 안 된다.
  assert.ok(_warmLangRank('tarot|ko|0|u') < _warmLangRank('tarot|xx|0|u'));
  assert.ok(_warmLangRank('망가진bucket') >= _warmLangRank('tarot|zh|0|u'), '깨진 bucket 이 앞선다');
});

test('선택 순서가 언어를 실제로 참고한다', async () => {
  // 위 테스트는 비교 함수만 본다. 그 함수를 정렬에서 빼먹으면 여전히 통과하므로,
  // selectWarmTargets 가 그것을 쓰고 있는지는 소스로 못 박는다.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'worker.js'), 'utf8');
  const from = src.indexOf('async function selectWarmTargets');
  assert.ok(from >= 0, 'selectWarmTargets 를 찾지 못했다');
  // 함수 끝은 줄 맨 앞의 '}' 다 — 안쪽 화살표 함수의 '}' 에 걸리지 않게.
  const body = src.slice(from, from + src.slice(from).indexOf('\n}'));
  const sortLine = body.split('\n').find(l => l.includes('.sort(')) || '';
  assert.match(sortLine, /_warmLangRank/,
    'selectWarmTargets 의 정렬이 언어를 안 본다 — 안 열릴 자리를 먼저 사게 된다');
  assert.match(sortLine, /a\.n - b\.n \|\|/,
    '채워진 개수가 1순위가 아니다 — 한국어가 변형을 쌓는 동안 다른 언어가 굶는다');
});

test('한국어를 먼저 채우되 다른 언어를 굶기지는 않는다', async () => {
  // 언어를 1순위로 두면 한국어가 변형을 쌓는 동안 영어는 첫 자리도 못 채운다.
  // 채워진 개수가 먼저이고 언어는 그 안에서의 순서일 뿐이어야 한다.
  const { db, DB } = createD1();
  const env = { DB };

  // 한국어 자리를 전부 한 번씩 채운다.
  const koSpecs = permanentFortuneSpecs().filter(s => s.bucket.split('|')[1] === 'ko');
  for (const s of koSpecs) {
    db.prepare(`INSERT INTO fortune_cache (id, bucket, reading) VALUES (?, ?, 'x')`)
      .run(`${s.bucket}#0`, s.bucket);
  }

  const targets = await selectWarmTargets(env, 20);
  for (const t of targets) {
    assert.notEqual(t.bucket.split('|')[1], 'ko',
      '한국어가 이미 한 바퀴 찼는데 또 한국어만 고른다 — 다른 언어가 영영 안 찬다');
    assert.equal(t.n, 0, '아직 빈 자리가 남았는데 이미 찬 자리를 고른다');
  }
});
