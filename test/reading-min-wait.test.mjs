// 풀이를 즉시 돌려주지 않고 최소 시간을 두는지 본다.
//
// 왜 있나: 캐시된 콘텐츠(타로·룬·띠운세)는 서버가 곧장 답한다. 그대로 내보내면 누른
// 순간 결과가 튀어나와, 안도령이 헤아린 게 아니라 미리 적어 둔 걸 꺼낸 것처럼 읽힌다.
// 그리고 6엽전짜리가 1엽전짜리와 같은 속도로 나오면 비싼 쪽이 그만큼 가벼워 보인다.
//
// 여기서 지키는 것:
//   1) 두 클라이언트 모두 최소 대기가 **비용에 따라 늘어난다** (상수가 아니다)
//   2) 어떤 경우에도 5초 아래로 내려가지 않는다 (요구사항)
//   3) 대기는 **최소**다 — 성공 경로에서만, 남은 만큼만 기다린다
//   4) 실패는 기다리지 않는다 (오류를 늦게 알리면 연출이 아니라 그냥 답답함이다)
//   5) 웹 호출부는 전부 cost 를 넘긴다 (안 넘기면 조용히 가장 짧은 값이 된다)
//
// 두 클라이언트의 상수는 **일부러 다르다**(웹은 연출이 7.2초라 바닥이 높다).
// 그러니 값이 서로 같은지는 보지 않고, 각자 규칙을 지키는지만 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 주석은 빼고 본다. 설명문에 적힌 숫자가 코드로 오인되지 않게 한다.
//
// ⚠️ /* 를 무조건 주석 시작으로 보면 안 된다. app.js 에는 accept="image/*" 가 있는데,
//    거기서부터 다음 */ 까지 5만 자가 넘게 통째로 지워졌다. 그 안에 있던
//    const MIN_MS 네 곳이 안 보여서, 멀쩡한 코드를 두고 검사만 틀렸다.
//    진짜 주석 앞은 비었거나 여는 괄호·구분자다. image/* 는 앞이 글자다.
const strip = (s) => s
  .replace(/(^|[\s{(,;=&|?:])\/\*[\s\S]*?\*\//g, '$1')
  .replace(/^\s*\/\/.*$/gm, '');
const web = strip(readFileSync(join(ROOT, 'js', 'app.js'), 'utf8'));
const mini = strip(readFileSync(join(ROOT, 'mini', 'src', 'main.js'), 'utf8'));

/** 소스에 박힌 `const 이름 = 숫자` 를 읽어 온다. */
function num(src, name) {
  const m = src.match(new RegExp(name + '\\s*=\\s*(\\d+)'));
  assert.ok(m, `${name} 을 찾지 못했다`);
  return Number(m[1]);
}

/** runItem 한 덩어리를 잘라 온다. */
function runItemBody() {
  const at = mini.indexOf('async function runItem');
  assert.ok(at >= 0, 'runItem 을 찾지 못했다');
  const rest = mini.slice(at);
  const end = rest.indexOf('function extractResult');
  return end < 0 ? rest : rest.slice(0, end);
}

test('웹: 최소 대기가 비용에 따라 늘어난다', () => {
  const base = num(web, 'READ_MIN_BASE_MS');
  const per = num(web, 'READ_MIN_PER_COST_MS');
  const cap = num(web, 'READ_MIN_CAP_MS');

  assert.ok(base >= 5000, `바닥이 ${base}ms 다 — 최소 5초를 지켜야 한다`);
  assert.ok(per > 0, '비용이 늘어도 대기가 안 늘어난다 (비용비례가 아니다)');
  assert.ok(cap > base, '상한이 바닥보다 크지 않다');
});

test('웹: 어떤 대기도 숫자를 그대로 박아 두지 않는다', () => {
  // 예전엔 17곳이 저마다 1500~2000ms 를 박아 두고 있었다. 그래서 6토큰짜리 대운이
  // 1토큰짜리 타로와 같은 1.5초에 나왔다. 한 곳이라도 되돌아가면 거기만 조용히 어긋난다.
  assert.doesNotMatch(web, /const MIN_MS = \d/,
    'MIN_MS 에 숫자가 그대로 박힌 곳이 있다 — readMinMs(비용) 으로 받아야 한다');

  const derived = (web.match(/const MIN_MS = (?:readMinMs|oracleMinMs)\(/g) || []).length;
  assert.ok(derived >= 17, `비용에서 끌어낸 곳이 ${derived}곳뿐이다 — 17곳 이상이어야 한다`);
});

test('웹: 연출용 바닥은 일반 바닥보다 높되 같은 기울기를 쓴다', () => {
  const oracleBase = num(web, 'ORACLE_MIN_BASE_MS');
  const readBase = num(web, 'READ_MIN_BASE_MS');
  assert.ok(oracleBase > readBase, '연출 바닥이 일반 바닥보다 높지 않다');
  // 기울기를 따로 두면 두 곡선이 엇갈린다. 한 상수를 같이 봐야 한다.
  const oracleFn = web.slice(web.indexOf('const oracleMinMs'), web.indexOf('const oracleMinMs') + 260);
  assert.match(oracleFn, /READ_MIN_PER_COST_MS/, '연출 쪽이 기울기를 따로 들고 있다');
  assert.match(oracleFn, /READ_MIN_CAP_MS/, '연출 쪽이 상한을 따로 들고 있다');

  assert.match(web, /const MIN_MS = oracleMinMs\(cost\)/,
    '오버레이가 비용을 안 본다');
});

test('웹: 연출이 끝나기 전에 창을 닫지 않는다', () => {
  const m = web.match(/const schedule = \[([\d,\s]+)\]/);
  assert.ok(m, 'oracle-beat 일정을 찾지 못했다');
  const last = Math.max(...m[1].split(',').map((x) => Number(x.trim())));
  const base = num(web, 'ORACLE_MIN_BASE_MS');
  assert.ok(base >= last,
    `바닥(${base}ms)이 마지막 연출 시작(${last}ms)보다 이르다 — 기둥을 세우다 만 채로 닫힌다`);
});

test('웹: 모든 호출부가 cost 를 넘긴다', () => {
  // 선언부(function openOracleOverlay({...}))는 뺀다 — 거기 cost 는 기본값이지 인자가 아니다.
  const calls = [...web.matchAll(/openOracleOverlay\(\{[^}]*\}/g)]
    .filter((m) => !/function\s+$/.test(web.slice(Math.max(0, m.index - 10), m.index)))
    .map((x) => x[0]);
  assert.ok(calls.length >= 4, `${calls.length}곳만 찾았다 — 추출을 확인할 것`);
  for (const c of calls) {
    assert.match(c, /cost:/, `cost 없이 부르는 곳이 있다: ${c.slice(0, 90)}`);
  }
});

test('미니: 최소 대기가 비용에 따라 늘어난다', () => {
  const base = num(mini, 'READ_MIN_BASE_MS');
  const per = num(mini, 'READ_MIN_PER_COST_MS');
  const cap = num(mini, 'READ_MIN_CAP_MS');

  assert.ok(base >= 5000, `바닥이 ${base}ms 다 — 최소 5초를 지켜야 한다`);
  assert.ok(per > 0, '비용이 늘어도 대기가 안 늘어난다 (비용비례가 아니다)');
  assert.ok(cap > base, '상한이 바닥보다 크지 않다');
  assert.match(mini, /item\?\.local \? 0/,
    '산가지(local)를 빼 두지 않았다 — 뽑는 맛이 전부인데 기다리게 하면 그 맛이 죽는다');
});

test('미니: 결과를 보이기 전에, 남은 만큼만 기다린다', () => {
  const fn = runItemBody();

  assert.match(fn, /const started = Date\.now\(\)/, '시작 시각을 안 잡는다');
  assert.match(fn, /readMinMs\(item\) - \(Date\.now\(\) - started\)/,
    '남은 시간을 계산하지 않는다 — 늘 최대로 기다리면 느린 응답 위에 대기가 얹힌다');
  assert.match(fn, /if \(remain > 0\)/, '남지 않았는데도 기다리려 한다');

  const waitAt = fn.indexOf('remain');
  const goAt = fn.indexOf("go('result')");
  assert.ok(goAt > waitAt && waitAt >= 0, '기다리기 전에 결과로 넘어간다');

  // 기다리는 동안 사용자가 나갈 수 있다. 대기 뒤에 세대 검사가 한 번 더 있어야 한다.
  const guards = (fn.slice(0, goAt).match(/seq !== _runSeq/g) || []).length;
  assert.ok(guards >= 2,
    '대기 뒤 세대 검사가 없다 — 기다리는 사이 나간 사용자를 결과 화면으로 끌고 간다');
});

test('미니: 실패는 기다리지 않는다', () => {
  const fn = runItemBody();
  const at = fn.indexOf('} catch (e) {');
  assert.ok(at >= 0, 'catch 를 찾지 못했다');
  assert.doesNotMatch(fn.slice(at), /readMinMs|remain/,
    '오류 경로에서 기다린다 — 엽전 부족 같은 건 즉시 알려야 한다');
});
