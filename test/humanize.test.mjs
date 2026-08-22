// AI 가 쓴 티가 나는 기호를 걸러 내는지.
//
// 줄표(—)와 가운뎃점(·)은 사람이 손으로 쓴 글에는 잘 안 나온다. 그 둘만 있어도
// "기계가 썼구나" 로 읽힌다. 페르소나에 쓰지 말라고 일러 두었지만 모델은 종종 잊으므로,
// 나가는 자리에서 한 번 더 거른다. 그 거름망이 제대로 도는지 여기서 지킨다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const { _humanize } = await loadWorker(['_humanize']);

test('문장 가운데 줄표를 쉼표로 바꾼다', () => {
  const got = _humanize('토끼띠에게 — 오늘 일진과 삼합을 이룹니다.');
  assert.doesNotMatch(got, /[—–]/, '줄표가 남았다');
  assert.equal(got, '토끼띠에게, 오늘 일진과 삼합을 이룹니다.');
});

test('가운뎃점을 쉼표로 바꾼다', () => {
  const got = _humanize('도화살 · 역마살 · 천을귀인이 함께 섰습니다.');
  assert.doesNotMatch(got, /·/, '가운뎃점이 남았다');
  assert.equal(got, '도화살, 역마살, 천을귀인이 함께 섰습니다.');
});

test('줄머리의 목록 기호는 지운다', () => {
  // 쉼표로 바꾸면 ", 도화살 …" 처럼 문장이 쉼표로 시작한다.
  const got = _humanize(['풀이입니다.', '— 도화살 사람을 끌어당깁니다', '· 역마살 자주 움직입니다'].join('\n'));
  assert.doesNotMatch(got, /^[,\s]*[,—·]/m, '줄머리에 기호나 쉼표가 남았다');
  assert.match(got, /^도화살 사람을 끌어당깁니다$/m);
  assert.match(got, /^역마살 자주 움직입니다$/m);
});

test('쉼표가 겹치거나 마침표 앞에 붙지 않는다', () => {
  assert.equal(_humanize('가, — 나'), '가, 나');
  assert.equal(_humanize('끝났습니다 — .'), '끝났습니다.');
});

test('문단 사이 빈 줄은 살린다', () => {
  const got = _humanize('첫 문단입니다.\n\n둘째 문단입니다.');
  assert.equal(got, '첫 문단입니다.\n\n둘째 문단입니다.', '문단이 붙거나 벌어졌다');
});

test('빈 값이 와도 터지지 않는다', () => {
  assert.equal(_humanize(null), '');
  assert.equal(_humanize(undefined), '');
  assert.equal(_humanize(''), '');
});

test('AI 가 쓴 글은 모두 이 거름망을 지난다', () => {
  // geminiText 를 안 거치고 직접 뽑는 자리가 여덟 곳 있었다 — 하나라도 새면
  // 그 콘텐츠에서만 줄표가 튀어나온다. 지금은 그 여덟을 geminiText 로 모아서
  // 남은 추출 자리가 둘뿐이다(거름망 본체와, JSON 을 받아 파싱하는 자리).
  // 그래서 개수 하한이 아니라 **새는 곳이 없는지**만 본다.
  const raw = [...SRC.matchAll(/candidates\?\.\[0\]\?\.content\?\.parts\?\.\[0\]\?\.text/g)];
  assert.ok(raw.length >= 1, `추출 자리를 하나도 못 찾았다 — 확인할 것`);
  for (const m of raw) {
    const line = SRC.slice(SRC.lastIndexOf('\n', m.index) + 1, SRC.indexOf('\n', m.index));
    // JSON 을 받아 파싱하는 자리(raw)는 본문이 아니므로 뺀다.
    if (/const raw =/.test(line)) continue;
    assert.match(line, /_humanize\(/, `거름망을 안 거친다: ${line.trim().slice(0, 80)}`);
  }
});

test('페르소나가 그 기호를 쓰지 말라고 이른다', () => {
  // 거름망은 뒷수습이다. 애초에 안 쓰게 하는 편이 글이 매끄럽다.
  assert.match(SRC, /줄표\(— –\)와 가운뎃점\(·\)을 절대 쓰지 않는다/,
    '페르소나에 지시가 없다');
});
