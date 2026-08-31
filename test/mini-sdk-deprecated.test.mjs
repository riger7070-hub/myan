// 앱인토스 SDK 의 **낡은 이름**을 쓰고 있지 않은지 본다.
//
// ⚠️ 왜 필요한가: SDK 는 낡은 함수를 지우지 않고 @deprecated 만 붙여 둔다. 그래서
//    부르면 그냥 돌아가는 것처럼 보인다. 그러다 어느 날 조용히 멈춘다.
//
//    실제로 그렇게 당했다. `getTossShareLink(path)` 는 위치 인자를 받았는데 새
//    `Share.createLink({ path })` 는 객체를 받는다. 옛 이름으로 부르니 링크가 안
//    만들어졌고, 우리 코드는 catch 로 삼키고 웹 주소로 물러났다 — **공유는 되는데
//    토스 앱으로 가는 링크가 아니었다.** 화면에는 아무 오류도 안 떴다.
//
//    이름 하나 바뀌는 것을 사람이 매번 알아채기는 어렵다. SDK 가 제 타입 파일에
//    적어 둔 @deprecated 를 그대로 읽어서 견준다 — 목록을 손으로 관리하지 않는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DTS = join(ROOT, 'mini', 'node_modules', '@apps-in-toss',
  'web-framework', 'dist', 'index.d.ts');
const APP = join(ROOT, 'mini', 'src', 'main.js');

/**
 * 타입 파일에서 "@deprecated 가 붙은 최상위 이름" 을 뽑는다.
 *
 * 생김새는 이렇다.
 *
 *     /**
 *      * @deprecated 이 함수는 더 이상 ... `Share.createLink`를 사용해주세요.
 *      *\/
 *     declare function getTossShareLink(path: string, ...
 *
 * ⚠️ 주석과 declare 사이에 다른 것이 끼지 않는 경우만 잡는다. 넓게 잡으면 앞
 *    블록의 @deprecated 를 뒤 이름에 붙여 읽는다 — 처음에 그래서 Storage 가
 *    낡은 것으로 잘못 걸렸다.
 */
function 낡은이름들(dts) {
  const out = new Map();
  const re = /@deprecated([^\n]*)\n\s*\*\/\s*\ndeclare (?:const|function) (\w+)/g;
  for (const m of dts.matchAll(re)) out.set(m[2], m[1].trim());
  return out;
}

test('앱이 SDK 의 낡은 이름을 쓰지 않는다', () => {
  if (!existsSync(DTS)) return;            // mini 의존성을 안 깐 곳에서는 건너뛴다
  const 낡은것 = 낡은이름들(readFileSync(DTS, 'utf8'));
  assert.ok(낡은것.size >= 3,
    `@deprecated 를 ${낡은것.size}개밖에 못 읽었다 — 뽑는 규칙을 확인할 것`);

  const src = readFileSync(APP, 'utf8');
  const imp = /import \{([\s\S]*?)\} from '@apps-in-toss\/web-framework';/.exec(src);
  assert.ok(imp, 'SDK 를 가져오는 줄을 못 찾았다');
  const 가져온것 = imp[1].split(',').map((s) => s.trim()).filter(Boolean);

  const 걸린것 = 가져온것.filter((n) => 낡은것.has(n));
  assert.deepEqual(걸린것, [],
    '낡은 이름을 가져오고 있다:\n'
    + 걸린것.map((n) => `  ${n} — ${낡은것.get(n)}`).join('\n'));
});

test('공유 링크를 새 방식(객체 인자)으로 만든다', () => {
  const src = readFileSync(APP, 'utf8');
  // ⚠️ 여기가 실제로 탈이 났던 자리다. 인자를 객체로 넘기지 않으면 링크가 안 나온다.
  assert.match(src, /Share\.createLink\(\{\s*path:/,
    'Share.createLink 에 객체를 안 넘긴다 — 링크가 안 만들어진다');
  assert.doesNotMatch(src, /getTossShareLink\s*\(/, '아직 옛 함수를 부른다');
  // 딥링크가 아니면 토스가 링크를 만들어 주지 않는다.
  assert.match(src, /const APP_DEEPLINK = 'intoss:\/\//,
    '공유 경로가 intoss:// 딥링크가 아니다');
});

test('링크를 못 만들면 그 사실을 남긴다', () => {
  const src = readFileSync(APP, 'utf8');
  const f = src.slice(src.indexOf('async function appLink()'), src.indexOf('async function shareApp()'));
  assert.ok(f, 'appLink 를 못 찾았다');
  // ⚠️ 조용히 웹 주소로 물러나면 아무도 모른다. 그래서 이 버그가 오래 살아 있었다.
  assert.match(f, /console\.warn/, '실패를 삼키기만 하고 남기지 않는다');
  assert.match(f, /return WEB_URL/, '못 만들었을 때 돌아갈 자리가 없다');
});
