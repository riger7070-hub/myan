// 모든 풀이가 **누군가의 목소리**로 나가는지 지킨다.
//
// 콘텐츠마다 프롬프트가 따로 있다 보니 말투와 깊이가 제각각이었다. 어떤 건 딱딱하고
// 어떤 건 전문용어를 그냥 쏟아냈다. 화자를 systemInstruction 한 곳으로 모았는데,
// Gemini 호출을 새로 추가하면서 이걸 빼먹기가 아주 쉽다 — 그 콘텐츠만 조용히
// 아무 인격 없는 말투가 되고, 배포 전에는 아무도 모른다.
//
// 화자가 넷으로 늘어난 뒤로도 이 검사는 그대로 유효하다. 누가 말하든 **인격이 붙어
// 나가는지**를 보는 것이 여기 일이고, 넷의 배정이 맞는지는 speakers.test.mjs 가 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = readFileSync(join(ROOT, 'worker.js'), 'utf8');

test('모든 Gemini 호출이 인격을 달고 나간다', () => {
  const calls = [...worker.matchAll(/generativelanguage\.googleapis\.com\/v1beta/g)].map(m => m.index);
  assert.ok(calls.length >= 1, `Gemini 호출을 하나도 못 찾았다 — 추출을 확인할 것`);

  // 호출 지점 앞뒤로 본문이 끝날 만한 폭 안에 systemInstruction 이 있어야 한다.
  // (앞도 보는 이유: geminiText 는 body 를 먼저 만들고 그 다음에 URL 을 쓴다.)
  const missing = calls.filter(i => !worker.slice(Math.max(0, i - 800), i + 800).includes('speakerSI('));
  assert.equal(missing.length, 0,
    `인격 없이 나가는 호출 ${missing.length}곳 (줄 ${missing.map(i =>
      worker.slice(0, i).split('\n').length).join(', ')})`);
});

test('유료 핸들러는 스스로 Gemini 를 부르지 않는다', () => {
  // 예전엔 여덟 곳이 각자 fetch 했다. 그러면 추론 끄기·타임아웃·페르소나를 저마다
  // 다시 적어야 하고, 빠뜨려도 화면은 멀쩡해 보인다. 호출을 geminiText 한 곳으로
  // 모았으니, 이제는 "핸들러 안에 URL 이 있다" 자체가 회귀 신호다.
  const starts = [...worker.matchAll(/^async function (\w+)\(request, env\)/gm)];
  const offenders = starts
    .map((m, i) => ({
      name: m[1],
      span: worker.slice(m.index, starts[i + 1] ? starts[i + 1].index : worker.length),
    }))
    .filter(h => /await accountSpend\(env, acct, /.test(h.span))
    .filter(h => h.span.includes('generativelanguage.googleapis.com'))
    .map(h => h.name);

  assert.deepEqual(offenders, [],
    `직접 Gemini 를 부르는 유료 핸들러: ${offenders.join(', ')} — geminiText 로 옮길 것`);
});

test('인격에 초보자 배려가 들어 있다', () => {
  // "사주를 전혀 모르는 사람에게 풀어 설명한다"가 이 서비스의 약속이다.
  // 문구를 다듬는 건 자유지만 이 방향이 빠지면 안 된다.
  // ⚠️ 넷이 함께 쓰는 규칙(_VOICE_COMMON)에 있어야 한다. 한 사람 것에만 적으면
  //    나머지 셋의 풀이에서 조용히 빠진다.
  const at = worker.indexOf('const _VOICE_COMMON = `');
  assert.ok(at >= 0, '넷이 함께 쓰는 규칙이 없다');
  const common = worker.slice(at, worker.indexOf('`;', at));

  for (const must of ['전혀 모른다', '쉬운 말']) {
    assert.ok(common.includes(must), `공통 규칙에서 "${must}" 가 빠졌다`);
  }
});

test('인격이 기호 금지와 JSON 예외를 함께 말한다', () => {
  const at = worker.indexOf('const _VOICE_COMMON = `');
  const common = worker.slice(at, worker.indexOf('`;', at));

  // 별표·우물정자는 "AI가 쓴 글" 느낌의 주범이라 이미 한 번 걷어낸 적이 있다.
  assert.match(common, /별표|\*/, '기호 금지가 빠졌다');
  // 럭키 아이템처럼 JSON 으로 받는 콘텐츠가 있다. 인격이 세면 거기에 산문을 붙여
  // 파싱이 깨지므로, 예외를 명시해 둬야 한다.
  assert.match(common, /JSON/, 'JSON 응답 예외가 빠졌다');
});

test('AI 임을 밝히는 고지는 앱이 하고, 화자는 사람으로 남는다', () => {
  // 화자가 스스로 "저는 AI입니다"라고 하면 몰입이 깨진다. 대신 화면에 생성형 AI
  // 고지를 띄우는 방식으로 심사 요건을 맞춘다(mini/src/main.js 의 AI_NOTICE).
  const at = worker.indexOf('const _VOICE_COMMON = `');
  const common = worker.slice(at, worker.indexOf('`;', at));
  assert.match(common, /AI\s*나?\s*모델이라 부르지 않는다/, '화자 규정이 빠졌다');

  const mini = readFileSync(join(ROOT, 'mini', 'src', 'main.js'), 'utf8');
  assert.match(mini, /생성형 AI/, '미니앱에서 생성형 AI 고지가 사라졌다');
});
