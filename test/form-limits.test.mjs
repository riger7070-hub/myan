// 폼이 실제로 제출되는가.
//
// ⚠️ 이 검사가 왜 있는가:
//    생년월일 칸의 max 에 1970 이 박힌 채로 배포된 적이 있다. 1970년 뒤에 태어난
//    사람은 브라우저가 폼 제출을 막았고, **오류 한 줄 없이 단추만 안 먹었다.**
//    화면에는 아무 말도 안 뜬다. 콘솔에도 안 뜬다. 서버 응답도 멀쩡하다.
//    사람이 눌러 보기 전까지 알 방법이 없었다.
//
//    원인은 워커가 모듈을 처음 읽을 때 Date.now() 로 0 을 준다는 것이다. 최상위
//    상수 안에서 _kstYear() 를 부르면 올해가 아니라 1970 이 들어간다. 요청이 들어온
//    뒤에 만들어야 한다.
//
//    API 를 아무리 두드려 봐도 이건 안 잡힌다. 화면에 박힌 값을 봐야 잡힌다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = readFileSync(join(ROOT, 'worker.js'), 'utf8');

const H = await loadWorker(['handleCalcPage', 'handleSamjaeYearPage', '_kstYear']);
const 올해 = H._kstYear();

// 폼이 있는 무료 페이지 전부. 새 계산기를 만들면 여기에 더한다.
const 폼페이지 = ['samjae', 'sinsal', 'bonmyeong', 'manseryeok', 'sonnal'];

test('⚠️ 태어난 해 칸이 올해까지 받는다', async () => {
  for (const kind of 폼페이지) {
    const res = H.handleCalcPage(kind);
    assert.ok(res, `${kind} 페이지가 없다`);
    const html = await res.text();
    const m = /id="f-year"[^>]*?max="(\d+)"/.exec(html);
    assert.ok(m, `${kind}: 태어난 해 칸에 max 가 없다`);
    const max = Number(m[1]);
    // 손 없는 날만 앞날을 묻는다(내년 이사). 나머지는 올해까지.
    const 기대 = kind === 'sonnal' ? 올해 + 5 : 올해;
    assert.equal(max, 기대,
      `${kind}: max 가 ${max} 다 — ${기대} 여야 한다. `
      + `최상위 상수에서 _kstYear() 를 불렀는지 볼 것(워커는 그때 Date.now() 가 0 이다)`);
  }
});

test('⚠️ 지금 살아 있는 사람이 폼을 통과한다', async () => {
  // max 하나만 보면 min 이 잘못돼도 못 잡는다. 실제로 넣을 값으로 확인한다.
  const 넣어볼값 = [1935, 1970, 1990, 2005, 올해];
  for (const kind of 폼페이지) {
    if (kind === 'sonnal') continue;                 // 태어난 해를 묻지 않는다
    const html = await H.handleCalcPage(kind).text();
    const m = /id="f-year"[^>]*?min="(\d+)"[^>]*?max="(\d+)"/.exec(html);
    assert.ok(m, `${kind}: min/max 를 못 찾았다`);
    const [min, max] = [Number(m[1]), Number(m[2])];
    for (const y of 넣어볼값) {
      assert.ok(y >= min && y <= max,
        `${kind}: ${y}년생이 폼을 못 지나간다 (min=${min} max=${max})`);
    }
  }
});

test('⚠️ 최상위 상수가 시각 함수를 부르지 않는다', () => {
  // 위 두 검사는 걸린 뒤에 잡는다. 이건 같은 실수를 아예 막는다.
  //
  // 워커는 모듈을 처음 읽을 때 Date.now() 가 0 이다. 그 자리에서 시각을 읽으면
  // 1970 이 박히고, 그 값은 워커가 살아 있는 내내 그대로 남는다.
  const 시각함수 = /_kstYear\(\)|_kstYmd\(\)|_kstToday\(\)|Date\.now\(\)|new Date\(\)/;
  const lines = WORKER.split('\n');

  for (let i = 0; i < lines.length; i++) {
    // 최상위 const/let 만 본다(들여쓰기 없는 줄). 함수 안은 요청 때 도니 괜찮다.
    const m = /^(?:const|let) (\w+) = (.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, 이름, 첫줄] = m;

    // 화살표 함수와 일반 함수는 부를 때 돈다 — 상관없다.
    if (/^\(?[\w\s,]*\)?\s*=>/.test(첫줄) || /^function\b/.test(첫줄)) continue;

    // 선언이 끝나는 곳까지 모아 본다. 템플릿 문자열은 여러 줄에 걸친다.
    let 몸통 = 첫줄;
    for (let j = i + 1; j < lines.length && !/^(?:const|let|function|\/\*|\/\/)/.test(lines[j]); j++) {
      몸통 += '\n' + lines[j];
      if (몸통.length > 4000) break;
    }
    const hit = 시각함수.exec(몸통);
    assert.equal(hit, null,
      `최상위 상수 ${이름}(worker.js:${i + 1}) 이 ${hit?.[0]} 를 부른다. `
      + `워커는 모듈을 읽을 때 Date.now() 가 0 이라 1970 이 박힌다 — 함수로 바꿔서 부를 때 돌게 할 것`);
  }
});
