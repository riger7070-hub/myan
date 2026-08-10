// 모든 풀이가 "안도령" 한 사람의 목소리로 나가는지 지킨다.
//
// 콘텐츠마다 프롬프트가 따로 있다 보니 말투와 깊이가 제각각이었다. 어떤 건 딱딱하고
// 어떤 건 전문용어를 그냥 쏟아냈다. 화자를 systemInstruction 한 곳으로 모았는데,
// Gemini 호출을 새로 추가하면서 이걸 빼먹기가 아주 쉽다 — 그 콘텐츠만 조용히
// 다른 사람 말투가 되고, 배포 전에는 아무도 모른다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');

test('모든 Gemini 호출이 안도령 인격을 달고 나간다', () => {
  const calls = [...worker.matchAll(/generativelanguage\.googleapis\.com\/v1beta/g)].map(m => m.index);
  assert.ok(calls.length >= 10, `Gemini 호출을 ${calls.length}곳만 찾았다 — 추출을 확인할 것`);

  // 호출 지점부터 본문이 끝날 만한 폭 안에 systemInstruction 이 있어야 한다.
  const missing = calls.filter(i => !worker.slice(i, i + 800).includes('_ANDORYEONG_SI'));
  assert.equal(missing.length, 0,
    `안도령 없이 나가는 호출 ${missing.length}곳 (줄 ${missing.map(i =>
      worker.slice(0, i).split('\n').length).join(', ')})`);
});

test('인격에 초보자 배려가 들어 있다', () => {
  // "사주를 전혀 모르는 사람에게 풀어 설명한다"가 이 서비스의 약속이다.
  // 문구를 다듬는 건 자유지만 이 방향이 빠지면 안 된다.
  const at = worker.indexOf('const ANDORYEONG = `');
  assert.ok(at >= 0, 'ANDORYEONG 인격 정의가 없다');
  const persona = worker.slice(at, worker.indexOf('`;', at));

  for (const must of ['안도령', '전혀 모른다', '쉬운 말']) {
    assert.ok(persona.includes(must), `인격에서 "${must}" 가 빠졌다`);
  }
});

test('인격이 기호 금지와 JSON 예외를 함께 말한다', () => {
  const at = worker.indexOf('const ANDORYEONG = `');
  const persona = worker.slice(at, worker.indexOf('`;', at));

  // 별표·우물정자는 "AI가 쓴 글" 느낌의 주범이라 이미 한 번 걷어낸 적이 있다.
  assert.match(persona, /별표|\*/, '기호 금지가 빠졌다');
  // 럭키 아이템처럼 JSON 으로 받는 콘텐츠가 있다. 인격이 세면 거기에 산문을 붙여
  // 파싱이 깨지므로, 예외를 명시해 둬야 한다.
  assert.match(persona, /JSON/, 'JSON 응답 예외가 빠졌다');
});

test('AI 임을 밝히는 고지는 앱이 하고, 화자는 안도령으로 남는다', () => {
  // 화자가 스스로 "저는 AI입니다"라고 하면 몰입이 깨진다. 대신 화면에 생성형 AI
  // 고지를 띄우는 방식으로 심사 요건을 맞춘다(mini/src/main.js 의 AI_NOTICE).
  const at = worker.indexOf('const ANDORYEONG = `');
  const persona = worker.slice(at, worker.indexOf('`;', at));
  assert.match(persona, /AI\s*나?\s*모델이라 부르지 않는다|AI/, '화자 규정이 빠졌다');

  const mini = readFileSync(join(ROOT, 'mini', 'src', 'main.js'), 'utf8');
  assert.match(mini, /생성형 AI/, '미니앱에서 생성형 AI 고지가 사라졌다');
});
