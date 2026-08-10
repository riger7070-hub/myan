// 미니앱 콘텐츠 목록이 서버와 어긋나지 않는지 본다.
//
// 웹에서 같은 종류의 버그를 이미 겪었다: 화면에 적힌 가격과 서버가 실제로 빼는 값이
// 달라서, 사용자는 표시된 것보다 더 내거나 덜 냈다. 미니앱도 같은 구조라 같이 막는다.
//
// 여기서 지키는 것:
//   1) 타일에 적힌 토큰 수 = 서버 accountSpend 가 빼는 값
//   2) 타일이 부르는 경로가 실제 라우터에 있다
//   3) 그 경로가 withMiniOrigin 으로 감싸져 있다 (안 그러면 미니앱에서만 조용히 죽는다)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const contentsSrc = readFileSync(join(ROOT, 'mini', 'src', 'contents.js'), 'utf8');

// contents.js 는 미니앱 번들용이라 여기서 import 하면 SDK 까지 딸려 온다.
// 목록만 필요하므로 소스에서 읽는다.
const items = [...contentsSrc.matchAll(
  /\{\s*id:\s*'([\w]+)',[^}]*?cost:\s*(\d+),\s*path:\s*'([^']+)'/g
)].map(m => ({ id: m[1], cost: Number(m[2]), path: m[3] }));

test('콘텐츠 목록을 읽었다', () => {
  assert.ok(items.length >= 15, `${items.length}개만 찾았다 — 추출 정규식을 확인할 것`);
});

/**
 * 라우터에서 그 경로를 처리하는 블록을 찾는다.
 * 한 줄짜리도 있고 여러 줄에 걸친 것도 있어서, 경로가 나온 지점부터 일정 폭을 본다.
 */
function routeBlock(path) {
  const at = worker.indexOf(`path === '${path}'`);
  if (at < 0) return null;
  // 무료 사주는 속도 제한 검사가 끼어 있어 블록이 길다. 넉넉히 잡는다.
  return worker.slice(at, at + 800);
}

function handlerFor(path) {
  const block = routeBlock(path);
  const m = block && block.match(/(handle\w+)\(request, env\)/);
  return m ? m[1] : null;
}

/** 핸들러가 실제로 빼는 토큰 수. */
function costOf(handler) {
  const at = worker.indexOf(`async function ${handler}(`);
  if (at < 0) return null;
  const span = worker.slice(at, at + 8000);
  const m = span.match(/accountSpend\(env, acct, '[a-z_]+', (\w+)\)/)
    || span.match(/_miniSpend\(env, userKey, '[a-z_]+', (\w+)\)/);
  if (!m) return null;
  if (/^\d+$/.test(m[1])) return Number(m[1]);
  // 비용 상수는 함수 안(const COST = 2)에도, 파일 위쪽(MINI_TODAY_COST)에도 선언된다.
  // 함수 범위에서 먼저 찾고 없으면 파일 전체를 본다.
  const c = span.match(new RegExp(`const ${m[1]} = (\\d+)`))
    || worker.match(new RegExp(`const ${m[1]} = (\\d+)`));
  return c ? Number(c[1]) : null;
}

test('타일에 적힌 토큰 수가 서버가 빼는 값과 같다', () => {
  for (const it of items) {
    if (it.cost === 0) continue;                    // 무료 콘텐츠는 차감이 없다
    const handler = handlerFor(it.path);
    assert.ok(handler, `${it.id}: 라우터에 ${it.path} 가 없다`);
    const actual = costOf(handler);
    assert.ok(actual != null, `${it.id}: ${handler} 에서 차감 구문을 못 찾았다`);
    assert.equal(it.cost, actual,
      `${it.id}: 화면엔 ${it.cost} 토큰, ${handler} 는 ${actual} 을 뺀다`);
  }
});

test('무료로 적힌 콘텐츠는 서버에서도 차감하지 않는다', () => {
  for (const it of items.filter(i => i.cost === 0)) {
    const handler = handlerFor(it.path);
    assert.ok(handler, `${it.id}: 라우터에 ${it.path} 가 없다`);
    assert.equal(costOf(handler), null,
      `${it.id}: 무료로 적혀 있는데 ${handler} 가 토큰을 뺀다`);
  }
});

test('유료 콘텐츠 경로는 미니앱 오리진이 허용된다', () => {
  // 빠지면 그 콘텐츠만 미니앱에서 "Failed to fetch" 로 죽는다. 브라우저가 막는 거라
  // 서버 로그에 아무것도 안 남아 원인을 찾기 어렵다.
  for (const it of items) {
    const block = routeBlock(it.path);
    assert.ok(block, `${it.id}: 라우트를 못 찾았다`);
    assert.match(block, /withMiniOrigin\(request,|handleMini/,
      `${it.id}: ${it.path} 가 withMiniOrigin 으로 감싸지지 않았다`);
  }
});

test('로또번호는 미니앱에 넣지 않는다', () => {
  // 사행성 요소로 심사에서 지적될 수 있어 첫 버전에서 뺐다. 무심코 되돌아오는 걸 막는다.
  // 넣기로 결정하면 이 테스트를 지우면서 의식적으로 판단하게 된다.
  assert.ok(!contentsSrc.includes('lotto'),
    '로또 콘텐츠가 미니앱 목록에 들어왔다 — 심사 사행성 기준을 확인할 것');
});
