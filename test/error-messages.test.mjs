// 서버가 터졌을 때 사용자에게 무엇을 보여 주는지.
//
// 서른네 곳이 `message: e.message` 로 예외 원문을 그대로 응답에 실어 보냈다.
// 한국어 화면에 영어 한 줄이 튀어나오는 것도 문제지만, D1 오류는 어느 테이블·
// 컬럼에서 터졌는지까지 말해 준다. 게다가 그 서른네 곳 중 로그를 남기는 곳이
// 하나도 없어서 **사용자 화면이 유일한 단서**였다 — 정확히 반대로 돼 있었다.
//
// 이제 serverError(tag, e, message) 한 곳을 거친다. 원문은 console.error 로만.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');
const { serverError } = await loadWorker(['serverError']);

test('⚠️ 예외 원문을 응답에 싣는 곳이 없다', () => {
  const NL = String.fromCharCode(10);
  const offenders = worker.split(NL)
    .map((line, i) => ({ line, no: i + 1 }))
    .filter(({ line }) => /message:\s*e\??\.message/.test(line))
    .map(({ line, no }) => `${no}: ${line.trim()}`);
  assert.deepEqual(offenders, [],
    `예외 원문이 사용자에게 나간다:${NL}  ${offenders.join(NL + '  ')}${NL}— serverError(tag, e, 문구) 를 쓸 것`);
});

test('serverError 는 원문 대신 정해진 문구를 돌려준다', async () => {
  const logs = [];
  const realError = console.error;
  console.error = (...a) => logs.push(a.join(' '));
  let res;
  try {
    res = serverError('TEST_TAG', new Error('D1_ERROR: no such column: user_emial'));
  } finally {
    console.error = realError;
  }
  assert.equal(res.status, 500);
  const body = await res.text();
  assert.doesNotMatch(body, /D1_ERROR|user_emial/, '예외 원문이 응답에 실렸다');
  assert.match(body, /요청을 처리하지 못했습니다/, '사용자가 읽을 문구가 없다');
  // 원문은 사라지지 않는다 — 로그에는 남아야 프로덕션에서 원인을 찾을 수 있다.
  assert.ok(logs.some((l) => l.includes('D1_ERROR') && l.includes('TEST_TAG')),
    `로그에 원문·태그가 안 남았다: ${JSON.stringify(logs)}`);
});

test('문구를 따로 주면 그것을 쓴다', async () => {
  const realError = console.error;
  console.error = () => {};
  let body;
  try {
    body = await serverError('X', new Error('boom'), '풀이 중 오류가 발생했습니다. 엽전은 환불되었습니다.').text();
  } finally {
    console.error = realError;
  }
  assert.match(body, /엽전은 환불되었습니다/);
  assert.doesNotMatch(body, /boom/);
});

test('serverError 를 부를 때 태그를 빠뜨리지 않았다', () => {
  // 태그가 없으면 로그가 서른네 줄의 똑같은 문장이 되어 어디서 터졌는지 알 수 없다.
  const calls = [...worker.matchAll(/serverError\(([^,)]*)/g)]
    .map((m) => m[1].trim())
    .filter((a) => a !== 'tag');   // 정의부 자신은 뺀다
  assert.ok(calls.length >= 30, `serverError 호출이 ${calls.length}곳뿐이다 — 바꾸다 만 것은 아닌지 확인할 것`);
  const bad = calls.filter((a) => !/^'[A-Z][A-Z0-9_]*'$/.test(a));
  assert.deepEqual(bad, [], `태그가 대문자 문자열이 아니다: ${bad.join(', ')}`);
});

test('유료 풀이가 터졌을 때는 환불했다고 알려 준다', () => {
  // 차감만 되고 화면에는 아무 말이 없으면 사용자는 엽전이 사라진 줄 안다.
  const refundLines = [...worker.matchAll(/serverError\('[A-Z0-9_]+', e, '([^']*)'\)/g)].map((m) => m[1]);
  assert.ok(refundLines.length >= 15, `환불 문구를 쓰는 곳이 ${refundLines.length}곳뿐이다`);
  for (const line of refundLines) {
    assert.match(line, /환불/, `유료 핸들러 문구에 환불 안내가 없다: "${line}"`);
  }
});
