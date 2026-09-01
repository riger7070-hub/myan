// 아침에 저절로 도는 배치 파일 둘을 지킨다.
//
//   tools/blog-morning.bat   평일 08:15  블로그 붙여넣기 대장
//   tools/promo-daily.bat    날마다 08:30  홍보 대장
//
// ⚠️ 이 둘은 **사람이 안 보는 데서 돈다.** 깨져도 아무도 모르고, 아침에 창이
//    안 뜨는 것으로만 나타난다. 실제로 세 번 그렇게 당했다 —
//
//      1. 한글 파일 이름.  cmd.exe 가 못 찾는다("not recognized"). 작업
//         스케줄러가 부르면 조용히 실패하고 기록도 안 남는다.
//      2. `timeout /t 3`.  콘솔이 없으면 "Input redirection is not supported"
//         로 죽는다. 모든 단계가 성공했는데도 작업은 Last Result 1 로 잡힌다.
//      3. 기록 파일을 blog\ 에 뒀다.  거기 .txt 는 전부 블로그 글로 취급되므로
//         시험 일곱 개가 깨졌다.
//
//    세 번 다 고쳤다. 이 시험은 그 셋이 되돌아오지 못하게 막는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const 도구 = new URL('../tools/', import.meta.url);
const 배치들 = readdirSync(도구).filter((f) => f.endsWith('.bat'));

test('아침에 도는 배치 파일이 둘 다 있다', () => {
  assert.ok(배치들.includes('blog-morning.bat'), '블로그 쪽 배치가 없다');
  assert.ok(배치들.includes('promo-daily.bat'), '홍보 쪽 배치가 없다');
});

for (const 이름 of 배치들) {
  const 글 = readFileSync(new URL(이름, 도구), 'utf8');

  test(`${이름} — 이름이 ASCII 다`, () => {
    // cmd.exe 가 한글 파일 이름을 못 찾는다. 작업 스케줄러는 그걸 조용히
    // 실패로 처리하고 기록도 안 남긴다.
    assert.match(이름, /^[\x20-\x7e]+$/, '파일 이름에 ASCII 밖 글자가 있다');
  });

  test(`${이름} — 안쪽도 ASCII 다`, () => {
    // 주석에 한글을 쓰면 코드페이지에 따라 깨져 보이고, 최악에는 명령줄이
    // 잘린다. 이 둘만은 영어로 둔다 (다른 파일들은 한글이 맞다).
    const 나쁜줄 = 글.split(/\r?\n/)
      .map((l, i) => [i + 1, l])
      .filter(([, l]) => /[^\x00-\x7e]/.test(l) && !/^REM/.test(l.trim()));
    assert.deepEqual(나쁜줄.map(([n]) => n), [],
      `ASCII 밖 글자가 있는 줄: ${나쁜줄.map(([n, l]) => `${n}: ${l}`).join(' / ')}`);
  });

  test(`${이름} — timeout 을 부르지 않는다`, () => {
    const 산다 = 글.split(/\r?\n/).filter((l) => !/^\s*REM/.test(l));
    assert.ok(!산다.some((l) => /\btimeout\b/.test(l)),
      'timeout 은 콘솔 없이 죽는다 — 작업이 통째로 Last Result 1 이 된다');
  });

  test(`${이름} — 성공하면 0 으로 끝난다`, () => {
    assert.match(글, /exit \/b 0/, '작업 스케줄러가 성공을 못 알아본다');
  });

  test(`${이름} — 커밋하거나 밀지 않는다`, () => {
    // 받아서 짓기만 한다. 사람이 안 보는 데서 돌기 때문에, 미는 순간
    // 아무도 안 읽은 것이 저장소에 들어간다.
    const 산다 = 글.split(/\r?\n/).filter((l) => !/^\s*REM/.test(l)).join('\n');
    assert.ok(!/git\s+(commit|push|add)\b/.test(산다), '아침 배치는 밀지 않는다');
  });

  test(`${이름} — 기록 파일이 blog\\ 밖에 있다`, () => {
    // blog\ 의 .txt 는 전부 블로그 글로 취급된다. 기록을 거기 두면
    // blog-plaintext 시험 일곱 개가 깨진다.
    const 기록 = /set "LOG=([^"]+)"/.exec(글)?.[1];
    assert.ok(기록, '기록 파일 자리를 못 찾았다');
    assert.ok(!/blog[\\/]/.test(기록), `기록이 blog\\ 안에 있다: ${기록}`);
  });
}

test('홍보 배치는 pull 이 막혀도 대장을 짓는다', () => {
  // 기록과 원고는 이미 이 디스크에 있다. 충돌 하나 때문에 "오늘 뭘 올리나"
  // 까지 같이 사라지면 안 된다. 블로그 쪽은 반대다 — 새 글이 안 내려왔으면
  // 지을 것이 없으므로 거기서 멈추는 게 맞다.
  const 글 = readFileSync(new URL('promo-daily.bat', 도구), 'utf8');
  const pull자리 = 글.indexOf('git pull');
  const 다음 = 글.slice(pull자리, 글.indexOf('npm run promo'));
  assert.ok(!/exit \/b 1/.test(다음), 'pull 이 막히면 대장을 못 짓게 되어 있다');
});
