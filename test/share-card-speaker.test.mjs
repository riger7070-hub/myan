// 공유 카드에 사람이 실린다.
//
// 결과 그림은 카톡이나 인스타로 퍼져 나가고, 받은 사람은 그 그림 한 장으로 이 서비스를
// 처음 만난다. 글자만 있으면 어느 앱이 만든 것인지 알 수 없다. 맡은 사람이 서 있으면
// 앱을 열었을 때 같은 얼굴이 답하므로 그림과 앱이 이어진다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');

const fnOf = (name) => {
  const i = APP.indexOf(`function ${name}(`);
  assert.ok(i > 0, `${name} 을 못 찾았다`);
  return APP.slice(i, APP.indexOf('\n}', i) + 2);
};

test('⚠️ 공유 카드가 맡은 사람을 그린다', () => {
  const f = fnOf('shareResultCard');
  assert.match(f, /_speakerOf\(path\)/, '누가 맡았는지 보지 않는다');
  assert.match(f, /_speakerImage\(sp\.file\)/, '사람을 그림으로 읽지 않는다');
  assert.match(f, /ctx\.drawImage\(who/, '읽어 놓고 그리지 않는다');
  assert.match(f, /ctx\.fillText\(sp\.name/, '누구인지 이름을 안 적는다');
});

test('⚠️ 사람은 글자를 다 그린 뒤에 그린다', () => {
  // 먼저 그리면 가운데 정렬된 제목이 사람 위를 지나가며 겹친다.
  const f = fnOf('shareResultCard');
  assert.ok(f.indexOf('drawImage(who') > f.lastIndexOf("fillText((title"),
    '제목보다 사람을 먼저 그린다 — 글자가 사람 위에 겹친다');
});

test('⚠️ 사람을 못 읽어도 공유는 된다', () => {
  // 사람 하나 때문에 공유가 통째로 실패하면 안 된다. 그림이 본체다.
  const f = fnOf('_speakerImage');
  assert.match(f, /catch/, '실패를 잡지 않는다');
  assert.match(f, /return null/, '실패했을 때 null 을 주지 않는다');
  assert.match(fnOf('shareResultCard'), /if \(who\)/, '못 읽었을 때를 안 가린다');
});

test('⚠️ SVG 에 크기를 박아 data: 로 넘긴다', () => {
  // viewBox 만 있고 width/height 가 없는 SVG 는 drawImage 에서 브라우저마다 다르게
  // 나온다(0으로 그리거나 아예 실패). 그리고 data: 여야 캔버스가 오염되지 않는다 —
  // 오염되면 toBlob 이 던져서 공유가 통째로 막힌다.
  const f = fnOf('_speakerImage');
  assert.match(f, /width="680" height="800"/, 'SVG 에 크기를 안 박는다');
  assert.match(f, /data:image\/svg\+xml/, 'data: 주소로 안 만든다 — 캔버스가 오염된다');
});

test('⚠️ 콘텐츠마다 맡은 사람이 다르게 선다', () => {
  // 안할매가 계산해 준 자리에 안도령이 서 있으면 넷으로 나눈 뜻이 없어진다.
  for (const [path, 누구] of [
    ['/api/iching', '안할매'], ['/api/tojeong', '안할매'],
    ['/api/dream-interpretation', '안할매'], ['/api/auspicious-days', '안할매'],
    ['/api/lucky-picks', '안동자'],
    ['/api/type-compat', '안낭자'], ['/api/compat-timing', '안낭자'],
  ]) {
    assert.ok(APP.includes(`path: '${path}'`) || APP.includes(`path:'${path}'`),
      `${누구} 가 맡은 ${path} 를 공유 카드에 안 넘긴다`);
  }
});

test('공유 카드가 쓰는 사람 그림이 실제로 있다', () => {
  const files = [...APP.matchAll(/file:'(\/an\w+\.svg)'/g)].map((m) => m[1]);
  assert.equal(files.length, 4, `사람이 ${files.length}명이다 — 넷이어야 한다`);
  for (const f of files) {
    assert.ok(readFileSync(join(ROOT, f.slice(1)), 'utf8').includes('<svg'),
      `${f} 가 없거나 SVG 가 아니다`);
  }
});
