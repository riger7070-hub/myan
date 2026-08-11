// 날짜가 붙는 운세 캐시의 bucket 이 프롬프트 내용과 같은 날을 가리키는지.
//
// 띠·별자리 / 럭키 / 라이프패스는 프롬프트에 ilchin() 이 낸 "오늘의 오행"이 들어간다.
// 그러니 bucket 의 날짜와 ilchin() 은 반드시 같은 순간에 넘어가야 한다. 어긋나면 한 bucket
// 이 서로 다른 일간 두 개에 걸치고, 그 bucket 에 처음 들어온 요청이 만든 글이 — 다른 날
// 오행으로 쓰인 글이 — 그날 내내 재사용된다. 실제로 그랬다: ilchin() 이 런타임 로컬(UTC)
// 자정을 쓰는 동안 bucket 만 KST 자정으로 끊겨서, 00:00~09:00 KST 에 들어온 첫 요청이
// 어제 오행으로 글을 만들어 박고 남은 15시간을 그것으로 채웠다.
//
// 지금은 ilchin() 도 KST 자정을 쓰므로(test/ilchin-kst.test.mjs) 축이 하나이고, bucket 은
// _kstYmd() 를 그대로 쓴다. 여기서 지키는 계약은 그대로다:
// **한 bucket 안에서 ilchin() 은 변하지 않는다.**

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './load-worker.mjs';

const { ilchin, _kstYmd, _kstYear } =
  await loadWorker(['ilchin', '_kstYmd', '_kstYear']);

const HOUR = 3600 * 1000;

// 시계를 ms 에 고정하고, **로컬 존이 UTC 인 런타임**(= Cloudflare Workers)을 흉내 내서 f() 를 부른다.
//
// 두 함수 다 이제 Date.now()/Date.UTC 만 쓰므로 이 셤은 값을 바꾸지 못한다 — 그게 확인하려는
// 바다. 어느 한쪽이 다시 로컬 시간을 읽기 시작하면(옛 ilchin() 이 그랬다) KST 개발 기계에서는
// 그냥 돌려선 알 수 없고, 이 셤 아래에서만 어긋남이 드러난다.
function at(ms, f) {
  const RealDate = Date;
  class UtcDate extends RealDate {
    // Date.now() 와 new Date() 둘 다 — ilchin 은 new Date(), 헬퍼는 Date.now() 를 쓴다.
    constructor(...a) { super(...(a.length ? a : [ms])); }
    static now() { return ms; }
    getFullYear() { return this.getUTCFullYear(); }
    getMonth()    { return this.getUTCMonth(); }
    getDate()     { return this.getUTCDate(); }
    getHours()    { return this.getUTCHours(); }
    getDay()      { return this.getUTCDay(); }
    getTimezoneOffset() { return 0; }
    setHours(...a) { return this.setUTCHours(...a); }
  }
  globalThis.Date = UtcDate;
  try { return f(); } finally { globalThis.Date = RealDate; }
}

test('한 bucket 날짜 안에서 오늘의 오행이 바뀌지 않는다', () => {
  // 로컬 존이 무엇이든 성립해야 한다 — 배포는 UTC, 개발은 KST 로 돈다.
  const start = Date.UTC(2026, 7, 12, 0, 0, 0);
  const byBucket = new Map();

  // 5일치를 1시간 간격으로 훑는다 — 어떤 경계든 여러 번 넘어간다.
  for (let h = 0; h < 24 * 5; h++) {
    const ms = start + h * HOUR;
    const { ymd, ci } = at(ms, () => ({ ymd: _kstYmd(), ci: ilchin().ci }));
    if (!byBucket.has(ymd)) byBucket.set(ymd, new Set());
    byBucket.get(ymd).add(ci);
  }

  assert.ok(byBucket.size >= 5, `bucket 날짜가 ${byBucket.size}개 — 날이 넘어가지 않았다`);
  for (const [ymd, cis] of byBucket) {
    assert.equal(cis.size, 1,
      `bucket 날짜 ${ymd} 안에서 일간이 ${cis.size}개(${[...cis]}) 나왔다 — ` +
      `그날 처음 들어온 요청이 만든 글이 다른 날 오행으로 하루 종일 재사용된다`);
  }
});

test('bucket 날짜는 ilchin 이 넘어가는 순간에 같이 넘어간다', () => {
  // 위 테스트는 "한 bucket 에 두 오행"을 잡는다. 반대 방향 — ilchin 이 넘어갔는데
  // bucket 은 그대로인 경우 — 도 같은 버그의 다른 얼굴이므로 여기서 잡는다.
  const start = Date.UTC(2026, 7, 12, 0, 0, 0);
  let prev = at(start, () => ({ ymd: _kstYmd(), ci: ilchin().ci }));
  let flips = 0;

  for (let h = 1; h < 24 * 5; h++) {
    const cur = at(start + h * HOUR, () => ({ ymd: _kstYmd(), ci: ilchin().ci }));
    const ymdFlipped = cur.ymd !== prev.ymd;
    const ciFlipped  = cur.ci !== prev.ci;
    assert.equal(ymdFlipped, ciFlipped,
      `${prev.ymd}→${cur.ymd} 에서 bucket 날짜와 일간이 따로 넘어갔다`);
    if (ymdFlipped) flips++;
    prev = cur;
  }
  assert.ok(flips >= 4, `5일을 훑었는데 날짜가 ${flips}번만 넘어갔다`);
});

test('세 핸들러의 bucket 이 KST 날짜 헬퍼를 쓴다', async () => {
  // 위 두 테스트는 헬퍼끼리의 계약만 본다. 핸들러가 어느 헬퍼를 부르는지는 소스로 확인한다 —
  // 여기에 로컬 시간으로 만든 날짜를 끼워 넣으면 다시 축이 둘로 갈린다.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'worker.js'), 'utf8');

  const buckets = [...src.matchAll(/cachedFortune\(\s*\n?\s*env,\s*`([^`]+)`/g)].map(m => m[1]);
  const dated = buckets.filter(b => /Ymd\(\)/.test(b));
  assert.equal(dated.length, 3, `날짜가 붙은 캐시가 ${dated.length}개 — 기대 3개(띠·별자리/럭키/라이프패스)`);

  for (const b of dated) {
    assert.match(b, /\$\{_kstYmd\(\)\}/,
      `bucket "${b}" 가 _kstYmd() 를 쓰지 않는다 — ilchin() 과 같은 KST 축이어야 한다`);
  }
});

test('택일·대운의 기준일은 KST 다 (새벽에 어제·작년이 되지 않게)', () => {
  // 이쪽은 ilchin() 과 무관한 달력 날짜라 반대로 KST 가 맞다. 00:00~09:00 KST 에
  // UTC 로 재면 "오늘"이 한국의 어제가 되어 이미 지나간 날을 결혼 날짜로 추천했다.
  const earlyMorningKst = Date.UTC(2026, 7, 11, 16, 0, 0);   // 2026-08-12 01:00 KST
  assert.equal(at(earlyMorningKst, _kstYmd), '2026-08-12',
    '새벽 1시(KST)에 기준일이 한국의 어제로 잡힌다');

  const newYearEve = Date.UTC(2026, 11, 31, 16, 0, 0);       // 2027-01-01 01:00 KST
  assert.equal(at(newYearEve, _kstYmd), '2027-01-01');
  assert.equal(at(newYearEve, _kstYear), 2027,
    '1월 1일 새벽(KST)에 올해가 작년으로 잡힌다 — 대운의 "지금"이 한 칸 밀린다');
});

test('"오늘"을 UTC 날짜 조각으로 조립하는 자리가 남아 있지 않다', async () => {
  // 택일의 기준일과 대운·궁합 시기의 올해가 getUTCFullYear()/getUTCMonth()/getUTCDate() 로
  // 조립돼 있었다. 그 셋이 이 버그의 전부였고, 지금은 _kstYmd()/_kstYear() 를 지나간다.
  // 다시 들어오면 같은 새벽 버그가 조용히 돌아오므로 소스에서 막는다.
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'worker.js'), 'utf8');

  // UTC 접근자 자체는 죄가 없다. _kstWeek() 처럼 **먼저 KST 로 옮긴 뒤** UTC 접근자로 읽는
  // 것은 오히려 올바른 관용구다(로컬 존에 좌우되지 않는다). 문제는 옮기지 않은 '지금'에서
  // 곧바로 UTC 조각을 꺼내 날짜를 만드는 것뿐이라, 그 두 모양만 집어서 막는다.
  const lines = src.split('\n');
  const bad = [];
  lines.forEach((line, i) => {
    // (1) `new Date().getUTCFullYear()` — 대운·궁합 시기의 refYear/fromYear 가 이랬다.
    if (/new Date\(\)\s*\.\s*getUTC(?:FullYear|Month|Date)\(/.test(line)) {
      bad.push(`${i + 1}: ${line.trim()}`);
    }
    // (2) 한 줄에서 getUTCMonth 와 getUTCDate 를 함께 써 y-m-d 를 조립 — 택일의 기준일이 이랬다.
    //     _kstWeek 은 getUTCDate/getUTCDay 만 써서 여기 걸리지 않는다.
    if (/getUTCMonth\(/.test(line) && /getUTCDate\(/.test(line)) {
      bad.push(`${i + 1}: ${line.trim()}`);
    }
  });

  assert.deepEqual(bad, [],
    '옮기지 않은 "지금"에서 UTC 조각을 꺼내 기준일을 만들고 있다 — _kstYmd()/_kstYear() 를 쓸 것');
});
