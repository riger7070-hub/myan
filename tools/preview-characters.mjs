// 캐릭터 넷을 나란히 세워 그린다. 눈으로 견주려고 만든 자리다.
//
// SVG 는 브라우저에 올리기 전에는 어긋난 걸 알 수 없다 — 머리가 얼굴 밖으로
// 삐져나오거나, 키가 안 맞거나, 색이 배경에 묻히는 것은 좌표만 봐서는 안 보인다.
//
//   node tools/preview-characters.mjs
//
// 결과물은 insta/characters.png. 어두운 바탕과 밝은 바탕 양쪽에 세운다 —
// 웹은 두 벌 테마를 쓰므로 한쪽에서만 보이는 색을 쓰면 안 된다.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'insta');

const CAST = [
  { file: 'andoryeong.svg', name: '안도령', role: '오늘의 기운 · 사주 풀이' },
  { file: 'annangja.svg',   name: '안낭자', role: '궁합 · 인연' },
  { file: 'anhalmae.svg',   name: '안할매', role: '삼재 · 신살 · 액막이' },
  { file: 'andongja.svg',   name: '안동자', role: '귀인 · 길신' },
];

const svgs = CAST.map((c) => ({
  ...c,
  svg: readFileSync(join(ROOT, c.file), 'utf8').replace(/<\?xml[^>]*\?>/, '').trim(),
}));

const row = (bg, fg, dim) => `
  <div class="row" style="background:${bg}; color:${fg}">
    ${svgs.map((c) => `
      <div class="cell">
        <div class="art">${c.svg}</div>
        <div class="nm">${c.name}</div>
        <div class="rl" style="color:${dim}">${c.role}</div>
      </div>`).join('')}
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;500&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1240px; font-family:'Noto Serif KR',serif; }
  .row { display:flex; gap:0; padding:44px 30px 40px; }
  .cell { flex:1; display:flex; flex-direction:column; align-items:center; }
  /* 키 차이를 보려면 바닥을 맞춰야 한다 — 가운데 정렬하면 안동자가 떠 보인다. */
  .art { height:250px; display:flex; align-items:flex-end; }
  .art svg { height:250px; width:auto; display:block; }
  .nm { margin-top:20px; font-size:25px; font-weight:500; letter-spacing:1px; }
  .rl { margin-top:7px; font-size:16px; }
</style></head><body>
${row('#0b0a08', '#e9e4da', 'rgba(233,228,218,.55)')}
${row('#f7f2e8', '#2b1d10', 'rgba(43,29,16,.6)')}
</body></html>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 900 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

// 넷 다 실제로 그려졌는지 본다. 파일이 비거나 SVG 가 깨지면
// 빈 칸이 나올 뿐이라 그림만 봐서는 놓치기 쉽다.
const drawn = await page.$$eval('.art svg', (els) => els.map((e) => e.getBBox().width));
if (drawn.length !== CAST.length * 2 || drawn.some((w) => w < 100)) {
  console.error(`그려진 캐릭터: ${JSON.stringify(drawn)} — 빠지거나 찌그러진 것이 있다`);
  process.exit(1);
}

const buf = await page.screenshot({ type: 'png', fullPage: true });
writeFileSync(join(OUT, 'characters.png'), buf);
console.log(`insta/characters.png  ${(buf.length / 1024).toFixed(0)}KB`);
await browser.close();
