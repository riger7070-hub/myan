// 오늘의 일진(日辰)이 어디서 계산되든 같은 날을 가리키는지.
//
// ilchin() 은 예전에 new Date().setHours(0,0,0,0) 으로 **런타임의 로컬 자정**을 썼다.
// 그러면 같은 순간에 코드가 도는 곳마다 "오늘"이 달라진다:
//   · 워커(로컬=UTC)      → 09:00 KST 에 날이 넘어간다
//   · 한국 사용자 브라우저 → 00:00 KST 에 넘어간다
//   · 뉴욕 사용자 브라우저 → 00:00 EST(= 14:00 KST)에 넘어간다
// 그래서 한국 사용자는 00:00~09:00 KST 사이에 화면의 오행 게이지와 유료로 받은 AI 본문이
// 서로 다른 기운을 말했고, 해외 사용자는 그 둘과 또 달랐다. 이제 양쪽이 KST 한 축을 쓴다.
//
// 여기서 지키는 것 셋:
//   1. 날짜별 간지가 예전 한국 브라우저가 보여 준 값 그대로다 (기준점 2023-01-01 = 44).
//   2. 로컬 존이 무엇이든 결과가 같다.
//   3. worker.js·js/constants.js 의 두 사본과 sw.js 의 셋째 사본이 같은 날을 가리킨다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const { ilchin } = await loadWorker(['ilchin']);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CG = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const JJ = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

/** 시계를 t 에 고정하고 f() 를 부른다. localAsUtc 면 로컬 존이 UTC 인 런타임(=워커)을 흉내 낸다. */
function at(t, f, { localAsUtc = false } = {}) {
  const RealDate = Date;
  class Fake extends RealDate {
    constructor(...a) { super(...(a.length ? a : [t])); }
    static now() { return t; }
  }
  class FakeUtc extends Fake {
    getFullYear() { return this.getUTCFullYear(); }
    getMonth()    { return this.getUTCMonth(); }
    getDate()     { return this.getUTCDate(); }
    getHours()    { return this.getUTCHours(); }
    getDay()      { return this.getUTCDay(); }
    getTimezoneOffset() { return 0; }
    setHours(...a) { return this.setUTCHours(...a); }
  }
  globalThis.Date = localAsUtc ? FakeUtc : Fake;
  try { return f(); } finally { globalThis.Date = RealDate; }
}

/** 주어진 KST 날짜의 hh 시(KST)에 해당하는 epoch ms. */
const kstAt = (y, m, d, hh) => Date.UTC(y, m - 1, d, hh - 9, 0, 0);
const gz = il => `${CG[il.ci]}${JJ[il.ji]}`;

// 변경 전에 TZ=Asia/Seoul 로 실제로 떠 둔 값이다(한국 사용자가 화면에서 보던 값).
// 이 표가 흔들리면 사용자가 보는 일진이 통째로 밀린 것이므로 절대 그냥 고치지 말 것.
const GOLDEN = [
  ['2023-01-01', '戊申', '土', '金'],
  ['2023-06-15', '癸巳', '水', '火'],
  ['2024-02-29', '壬子', '水', '水'],   // 윤일
  ['2024-12-31', '戊午', '土', '火'],
  ['2025-01-01', '己未', '土', '土'],   // 해 넘김
  ['2026-08-12', '丁未', '火', '土'],
  ['2026-08-13', '戊申', '土', '金'],
  ['2026-12-31', '戊辰', '土', '土'],
  ['2027-01-01', '己巳', '土', '火'],
  ['2030-03-03', '丙戌', '火', '土'],
];

test('날짜별 간지가 기존 한국 브라우저 값과 같다', () => {
  for (const [ymd, want, wo, wjo] of GOLDEN) {
    const [y, m, d] = ymd.split('-').map(Number);
    const il = at(kstAt(y, m, d, 12), ilchin);
    assert.equal(gz(il), want, `${ymd}: ${gz(il)} — 기준값 ${want}`);
    assert.equal(il.o, wo, `${ymd}: 천간 오행이 다르다`);
    assert.equal(il.jo, wjo, `${ymd}: 지지 오행이 다르다`);
  }
});

test('KST 하루 안에서는 몇 시에 물어도 같은 간지다', () => {
  // 예전엔 09:00 KST 에 값이 바뀌어서, 새벽에 보던 사람과 낮에 보던 사람이 다른 일진을 봤다.
  for (const [ymd, want] of GOLDEN) {
    const [y, m, d] = ymd.split('-').map(Number);
    for (const hh of [0, 1, 8, 9, 10, 15, 23]) {
      const il = at(kstAt(y, m, d, hh), ilchin);
      assert.equal(gz(il), want, `${ymd} ${hh}시(KST)에 ${gz(il)} — 기준값 ${want}`);
    }
  }
});

test('KST 자정에 정확히 한 칸 넘어간다', () => {
  const day = kstAt(2026, 8, 12, 0);
  const justBefore = at(day - 1, ilchin);          // 2026-08-11 23:59:59.999 KST
  const justAfter  = at(day, ilchin);              // 2026-08-12 00:00:00.000 KST
  assert.equal(gz(justBefore), '丙午', '자정 직전이 전날이 아니다');
  assert.equal(gz(justAfter), '丁未', '자정 직후가 그날이 아니다');
});

test('로컬 존이 UTC 인 런타임(워커)에서도 같은 값이다', () => {
  // 이 셤은 로컬 시간 접근자를 UTC 로 바꾼다. ilchin() 이 로컬 시간을 조금이라도 보고 있으면
  // KST 개발 기계에서 값이 달라진다 — 예전 구현은 정확히 여기서 걸렸다.
  for (const [ymd, want] of GOLDEN) {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = kstAt(y, m, d, 2);                   // 새벽 2시 KST — 옛 구현이 어긋나던 시각
    assert.equal(gz(at(t, ilchin, { localAsUtc: true })), want,
      `${ymd} 02:00 KST: 워커에서 본 값이 한국 브라우저와 다르다`);
    assert.equal(gz(at(t, ilchin)), want,
      `${ymd} 02:00 KST: 개발 기계 로컬 존에서 값이 흔들린다`);
  }
});

test('아침 푸시 시각(08:00 KST)에 그날의 간지가 나온다', () => {
  // 일일 푸시 크론은 '0 23 * * *' UTC = 08:00 KST 다. 옛 구현은 로컬(UTC) 날짜를 봤으므로
  // 이 순간의 UTC 날짜는 아직 전날이었다 — 아침 푸시가 매일 *어제* 기운을 알려 주고 있었다.
  // (측정: 2026-08-12 08:00 KST 발송이 丁未 대신 丙午 를 보냈다.)
  for (const [ymd, want] of GOLDEN) {
    const [y, m, d] = ymd.split('-').map(Number);
    const fire = kstAt(y, m, d, 8);                // = 그 전날 23:00 UTC
    assert.equal(gz(at(fire, ilchin, { localAsUtc: true })), want,
      `${ymd} 08:00 KST 발송이 ${gz(at(fire, ilchin, { localAsUtc: true }))} — 그날은 ${want}`);
  }
});

test('ilchin 이 로컬 시간을 읽지 않는다', () => {
  // 구현으로도 못을 박는다. Date.now()/Date.UTC 만 쓰면 존에 좌우될 길이 없다.
  for (const rel of ['worker.js', 'js/constants.js']) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const body = (src.match(/function ilchin\(\) \{([\s\S]*?)\n\}/) || [])[1];
    assert.ok(body, `${rel}: ilchin() 을 찾지 못했다`);
    assert.doesNotMatch(body, /setHours|getFullYear|getMonth|getDate|getHours|getTimezoneOffset/,
      `${rel}: ilchin() 이 로컬 시간 접근자를 쓴다 — 워커에서는 UTC 가 되어 09:00 KST 까지 어제가 된다`);
  }
});

test('worker.js 와 js/constants.js 의 ilchin 이 같은 계산을 한다', () => {
  // CLAUDE.md 가 "한쪽을 고치면 다른 쪽도 고쳐라"라고 적어 두었지만, 적어 둔 것만으로는
  // 지켜지지 않는다. 한쪽만 손대면 화면의 오행 게이지와 AI 본문이 다시 어긋난다.
  const bodies = ['worker.js', 'js/constants.js'].map(rel => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const body = (src.match(/function ilchin\(\) \{([\s\S]*?)\n\}/) || [])[1];
    assert.ok(body, `${rel}: ilchin() 을 찾지 못했다`);
    // 주석과 공백은 달라도 된다 — 계산만 같으면 된다.
    return body
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  });
  assert.equal(bodies[0], bodies[1],
    'ilchin() 두 사본의 계산이 다르다 — 한쪽만 고쳤다');
});

// ── 셋째 사본: 서비스워커 ──
//
// sw.js 는 페이지와 따로 도는 코드라 ilchin() 을 가져다 쓸 수 없어 제 것을 갖고 있다.
// 그 사본만 런타임 로컬 시각(new Date().setHours(0,0,0,0))을 그대로 쓰고 있었다.
// 여기는 **사용자 기기**라 로컬이 곧 그 사람의 시간대다 — 해외 사용자는 아침 푸시에
// 적힌 오행이 앱 화면·유료 풀이와 다른 날을 가리켰다(한국은 로컬=KST 라 티가 안 났다).
function swIlchin() {
  const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const cgo = (src.match(/const _CGO = \[[^\]]*\];/) || [])[0];
  const fn = (src.match(/function _swIlchin\(\) \{[\s\S]*?\n\}/) || [])[0];
  assert.ok(cgo && fn, 'sw.js 에서 _swIlchin 을 찾지 못했다');
  return { fn: new Function(cgo + '\n' + fn + '\nreturn _swIlchin;')(), src: fn };
}

test('sw.js 의 일진이 나머지 둘과 같은 날을 가리킨다', () => {
  const { fn } = swIlchin();
  for (const [date, gzExpected, oExpected] of GOLDEN) {
    const [y, m, d] = date.split('-').map(Number);
    for (const localAsUtc of [false, true]) {   // 사용자 기기는 어느 시간대든 될 수 있다
      const il = at(kstAt(y, m, d, 10), fn, { localAsUtc });
      assert.equal(gz(il), gzExpected, date + ': 간지가 다르다');
      assert.equal(il.o, oExpected, date + ': 오행이 다르다');
    }
  }
});

test('sw.js 의 일진도 KST 자정에 넘어간다', () => {
  const { fn } = swIlchin();
  // 로컬 자정을 쓰면 여기가 어긋난다 — 로컬=UTC 로 흉내 내면 09:00 KST 에 넘어갔었다.
  assert.equal(gz(at(kstAt(2026, 8, 12, 23), fn, { localAsUtc: true })), '丁未');
  assert.equal(gz(at(kstAt(2026, 8, 13, 0), fn, { localAsUtc: true })), '戊申');
});

test('sw.js 의 일진이 로컬 시간을 읽지 않는다', () => {
  const { src } = swIlchin();
  assert.doesNotMatch(src, /setHours/, 'setHours 로 로컬 자정을 만든다 — Date.now() 를 KST 축에서 셀 것');
  assert.doesNotMatch(src, /new Date\(\s*\d{4}/, '로컬 시간대로 해석되는 날짜를 만든다 — Date.UTC 를 쓸 것');
});
