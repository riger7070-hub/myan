// 과거에 실제로 터졌던 버그 3종이 같은 모양으로 되돌아오는 걸 막는 가드.
//
// 셋 다 CLAUDE.md 가 "이 모양이 다시 보이면 회귀"라고 못박아둔 것들이다.
// 사람 눈으로 리뷰하는 규칙은 결국 새는데, 셋 다 문법이 특징적이라 소스 검사로 잡힌다.
//
// 주의: 이건 정적 검사라 우회하려면 얼마든지 우회된다. 목적은 악의적 우회 방지가 아니라
// "예전 코드를 복붙하다 무심코 되살리는 것"을 막는 것이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');

/** 매칭된 줄 번호와 내용을 사람이 읽을 수 있게 만든다. */
function hits(src, re) {
  return src.split('\n')
    .map((line, i) => ({ n: i + 1, line: line.trim() }))
    .filter(({ line }) => re.test(line))
    .map(({ n, line }) => `  ${n}: ${line}`);
}

test('토큰 잔액을 UPDATE 로 더하지 않는다 (원장은 append-only)', () => {
  // payment_requests 는 잔액 컬럼이 아니라 append-only 원장이다.
  // `UPDATE ... SET tokens = tokens + N WHERE user_email = ?` 는 그 사용자의 **모든 행**에
  // 적용돼 지급액이 보유 행 수만큼 뻥튀기된다. 지급·차감은 항상 새 행 INSERT 로 해야 한다.
  const found = hits(worker, /UPDATE\s+payment_requests\s+SET\s+tokens\s*=\s*tokens/i);
  assert.deepEqual(found, [],
    `토큰 인플레 버그 패턴이 되살아났다. 지급/차감은 INSERT 로 할 것:\n${found.join('\n')}`);
});

test('Authorization 토큰을 서명 검증 없이 직접 디코드하지 않는다', () => {
  // `JSON.parse(atob(token.split('.')[1]))` 로 페이로드를 그냥 까면 서명이 검증되지 않아
  // 누구나 임의의 email 을 넣은 토큰을 위조할 수 있다. 반드시 getEmailFromToken() 을 쓸 것.
  const found = hits(worker, /atob\s*\(\s*\w*[Tt]oken\s*\.\s*split/);
  assert.deepEqual(found, [],
    `서명 검증 없는 JWT 디코드가 되살아났다. getEmailFromToken() 을 쓸 것:\n${found.join('\n')}`);
});

test('PIN 을 소스의 문자열 리터럴과 비교하지 않는다', () => {
  // UNGI_PIN / CAFE_STAFF_PIN / PROMO_ADMIN_PIN 은 공개 저장소에 하드코딩돼 있던 것을
  // env 시크릿으로 옮긴 것이다. 시크릿이 없으면 해당 경로는 항상 거부돼야 한다(폴백 금지).
  const found = hits(worker, /\b(admin)?[Pp]in\b\s*(===?|!==?)\s*['"`]|['"`]\s*(===?|!==?)\s*\b(admin)?[Pp]in\b/);
  assert.deepEqual(found, [],
    `PIN 이 다시 하드코딩됐다. env.* 시크릿으로 옮길 것:\n${found.join('\n')}`);
});
