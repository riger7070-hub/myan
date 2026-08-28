// 우리가 쓴 이모지가 실제로 그려지는지 재 본다.
//
//   node tools/check-emoji.mjs
//
// ⚠️ 왜 필요한가: 이모지는 글꼴에 없으면 **네모 상자나 빈칸**으로 뜬다. 그런데 코드
//    상으로는 멀쩡한 글자라 아무도 알려 주지 않는다. 쓴 사람 화면에서만 안 보이고
//    다른 기기에서는 보이기도 해서 더 헷갈린다.
//
//    새로 나온 이모지일수록 위험하다. 🪞(거울)는 2020년에 들어온 것이라 조금 오래된
//    윈도우에서는 빈칸이다.
//
// 어떻게 재는가: 글자를 그려 보고, **글꼴에 없는 글자**(U+10FFFF)를 그린 것과
// 견준다. 똑같으면 그 이모지도 없는 것이다. 상자 모양이 같기 때문이다.

import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 우리가 쓰는 곳을 다 훑어 이모지를 모은다.
const 볼파일 = [
  ...readdirSync(join(ROOT, 'blog')).filter((f) => f.endsWith('.txt')).map((f) => join('blog', f)),
  'worker.js',
];
const 이모지찾기 = /[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}\u{2b00}-\u{2bff}][\u{fe0f}\u{fe0e}]?/gu;

const 쓴것 = new Map();                       // 이모지 → 어디서 썼는지
for (const f of 볼파일) {
  const src = readFileSync(join(ROOT, f), 'utf8');
  for (const m of src.matchAll(이모지찾기)) {
    // ⚠️ 주석에 쓴 것은 세지 않는다. 화면에 안 나가므로 안 보여도 상관없다.
    if (!쓴것.has(m[0])) 쓴것.set(m[0], f);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<body></body>');

const 결과 = await page.evaluate((목록) => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const 그리기 = (ch) => {
    g.clearRect(0, 0, 64, 64);
    g.font = '40px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textBaseline = 'top';
    g.fillText(ch, 4, 4);
    return c.toDataURL();
  };
  // 어떤 글꼴에도 없는 글자. 이것과 같으면 상자만 그려진 것이다.
  const 없는것 = 그리기('\u{10FFFF}');
  const 빈것 = 그리기(' ');
  return 목록.map((ch) => {
    const 그림 = 그리기(ch);
    return { ch, 상자: 그림 === 없는것, 빈칸: 그림 === 빈것 };
  });
}, [...쓴것.keys()]);

await browser.close();

const 못그림 = 결과.filter((r) => r.상자 || r.빈칸);
console.log(`이모지 ${결과.length}개를 재 봤다.\n`);
for (const r of 결과) {
  const 상태 = r.상자 ? '✖ 상자로 뜬다' : r.빈칸 ? '✖ 빈칸이다' : '보인다';
  console.log(`  ${r.ch}  ${상태.padEnd(14)} ${쓴것.get(r.ch)}`);
}
if (못그림.length) {
  console.error(`\n${못그림.length}개가 안 보인다: ${못그림.map((r) => r.ch).join(' ')}`);
  console.error('다른 이모지로 바꿀 것. 안 보이는 이모지는 없느니만 못하다.');
  process.exit(1);
}
console.log('\n전부 보인다');
