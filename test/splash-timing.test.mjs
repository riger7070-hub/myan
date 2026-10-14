// 여는 연출이 **끝까지 보이고, 그러면서 짧은지.**
//
// ⚠️ 연출 시간이 세 군데에 나뉘어 있다. 한쪽만 고치면 장면이 중간에 끊기거나,
//    다 끝났는데도 빈 화면을 더 보고 있게 된다.
//
//      style.css   달·문·빛·안도령의 지연과 길이 (언제 무엇이 움직이나)
//      SPLASH_MS   그걸 다 보여 주려고 기다리는 시간
//      setTimeout  사라지는 동안 기다리는 시간 (splashOut 과 같아야 한다)
//
// ⚠️ 2026-10-14 에 2.6초 → 1.4초로 줄였다. 사장님이 두 번 「로딩이 너무 느리다」
//    하셔서다. 서버는 따뜻할 때 0.77초라 연출 뒤에 숨는데, **연출 자체가
//    2.6 + 0.45 = 3.05초**였고 그동안 화면에 아무 내용도 없었다. 토스 프로모션은
//    10초짜리라 그 3초가 30%다.
//
//    장면을 자른 것이 아니라 **박자를 0.55배로 당겼다.** 달이 뜨고 문이 열리고
//    안도령이 나오는 차례는 그대로다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../mini/src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../mini/src/style.css', import.meta.url), 'utf8');

const 초 = (s) => parseFloat(s);

/** `animation: 이름 길이 ... 지연 forwards` 에서 끝나는 때를 읽는다. */
function 끝나는때(이름) {
  const re = new RegExp(`animation:\\s*${이름}\\s+([\\d.]+)s[^;]*?\\s([\\d.]+)s\\s+forwards`);
  const m = re.exec(css);
  assert.ok(m, `${이름} 의 animation 을 못 읽었다`);
  return 초(m[1]) + 초(m[2]);
}

const SPLASH_MS = parseInt(/const SPLASH_MS = (\d+)/.exec(main)?.[1], 10);
const 사라짐JS = parseInt(/setTimeout\(r, (\d+)\)\);\s*$/m.exec(
  main.slice(main.indexOf("classList.add('done')")),
)?.[1] ?? /await new Promise\(r => setTimeout\(r, (\d+)\)\);/.exec(
  main.slice(main.indexOf("classList.add('done')")),
)?.[1], 10);
const 사라짐CSS = 초(/splashOut ([\d.]+)s/.exec(css)[1]) * 1000;

test('연출이 다 끝난 뒤에 문을 닫는다', () => {
  // ⚠️ 가장 늦게 끝나는 것(안도령)보다 SPLASH_MS 가 짧으면 **장면이 중간에
  //    끊긴다.** 박자만 당기려다 여기를 빠뜨리기 쉽다.
  const 마지막 = Math.max(끝나는때('moonRise'), 끝나는때('doorL'),
    끝나는때('glowIn'), 끝나는때('oracleIn')) * 1000;
  assert.ok(SPLASH_MS >= 마지막,
    `연출은 ${마지막}ms 에 끝나는데 ${SPLASH_MS}ms 만 기다린다 — 안도령이 나오다 만다`);
});

test('다 끝났는데 괜히 더 기다리지 않는다', () => {
  const 마지막 = Math.max(끝나는때('moonRise'), 끝나는때('doorL'),
    끝나는때('glowIn'), 끝나는때('oracleIn')) * 1000;
  assert.ok(SPLASH_MS - 마지막 <= 400,
    `연출이 ${마지막}ms 에 끝나는데 ${SPLASH_MS}ms 를 기다린다 — 빈 화면을 더 본다`);
});

test('사라지는 시간이 CSS 와 JS 에서 같다', () => {
  // 짧으면 아직 덮여 있는 채로 다음 화면을 그리고, 길면 그만큼 더 빈다.
  assert.equal(사라짐JS, 사라짐CSS,
    `JS 는 ${사라짐JS}ms 기다리는데 CSS 는 ${사라짐CSS}ms 동안 사라진다`);
});

test('처음 오는 사람이 보는 빈 화면이 2초를 넘지 않는다', () => {
  // ⚠️ 토스 프로모션은 10초짜리다. 여기서 먹는 만큼 내용을 볼 시간이 줄어든다.
  const 합 = SPLASH_MS + 사라짐JS;
  assert.ok(합 <= 2000, `여는 연출에 ${합}ms 가 든다 — 10초 중 ${Math.round(합 / 100)}%다`);
});

test('두 번째부터는 더 짧다', () => {
  // 매번 같은 문을 보고 있으면 그때부터는 장벽이다.
  const m = /sessionStorage\.getItem\(SPLASH_SEEN\) \? (\d+) : SPLASH_MS/.exec(main);
  assert.ok(m, '두 번째 방문을 가르는 자리가 없다');
  assert.ok(parseInt(m[1], 10) < SPLASH_MS, '두 번째가 더 길거나 같다');
});

test('움직임을 싫어하는 분께는 연출을 안 보인다', () => {
  // 접근성. 이게 없으면 멀미를 하는 분이 앱을 못 쓴다.
  assert.match(css, /prefers-reduced-motion[\s\S]{0,160}animation: none/,
    '움직임 줄이기 설정을 따르지 않는다');
});
