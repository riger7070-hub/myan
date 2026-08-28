// 블로그에 넣을 **실제 화면**을 찍는다.
//
//   node tools/build-blog-shots.mjs
//
// 왜 카드 말고 화면인가: 글마다 사진이 둘 들어가는데, 둘 다 카드면 광고 두 장이 된다.
// 하나는 만든 그림, 하나는 **진짜 돌아가는 화면**이어야 "쓸 수 있는 것" 으로 읽힌다.
//
// 사람이 손으로 찍으면 매번 크기와 자르는 자리가 달라지고, 페이지를 고치면 낡는다.
// 여기서 찍으면 늘 같은 폭이고 다시 돌리기만 하면 새것이 된다.
//
// ⚠️ 값을 넣고 **결과가 나온 뒤** 찍는다. 빈 폼을 찍으면 무엇을 해 주는 곳인지
//    보이지 않아서, 사진을 넣는 뜻이 없어진다.
// ⚠️ 배포본을 찍는다. 로컬을 찍으면 아직 안 나간 화면이 블로그에 먼저 실린다.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'blog', 'shots');
const SITE = process.argv[2] || 'https://myan.riger7070.workers.dev';

// 폰 폭. 블로그 본문 폭에 넣었을 때 글자가 읽히는 크기다.
const W = 430;

const 찍을것 = [
  {
    name: 'sonnal',
    path: '/calc/sonnal',
    // 이사철에 가까운 달로 채운다. 빈 달이 나오면 사진이 허전하다.
    채우기: async (p) => {
      await p.fill('#f-year', '2026');
      await p.fill('#f-month', '4');
      await p.click('#go');
      await p.waitForSelector('#out .card', { timeout: 15000 });
    },
  },
  {
    name: 'manseryeok',
    path: '/calc/manseryeok',
    채우기: async (p) => {
      await p.fill('#f-year', '1990');
      await p.fill('#f-month', '5');
      await p.fill('#f-day', '15');
      await p.selectOption('#f-hour', '사시');
      await p.click('#go');
      await p.waitForSelector('#out .card', { timeout: 15000 });
    },
  },
  {
    // 궁합표는 폼이 없다. 표가 그려진 그대로 찍는다.
    name: 'gunghap',
    path: '/gunghap',
    채우기: async () => {},
  },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let 실패 = 0;

for (const s of 찍을것) {
  const page = await browser.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: 2 });
  try {
    await page.goto(SITE + s.path, { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => document.fonts?.ready);
    await s.채우기(page);
    // 결과가 그려지고 글자가 앉을 틈.
    await page.waitForTimeout(700);

    // ⚠️ 다 찍지 않는다. 페이지 아래에는 다른 계산기 목록과 베타 안내가 붙어 있어서,
    //    통째로 찍으면 무엇을 보여주려는 사진인지 흐려진다. 화면 한 장 높이만 찍는다.
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: 900 } });
    writeFileSync(join(OUT, `${s.name}.png`), buf);
    console.log(`blog/shots/${s.name}.png  ${(buf.length / 1024).toFixed(0)}KB`);
  } catch (e) {
    실패++;
    console.error(`  ✖ ${s.name}: ${e.message.split('\n')[0]}`);
  }
  await page.close();
}

await browser.close();
if (실패) {
  console.error(`\n${실패}장을 못 찍었다. 배포본이 살아 있는지 보고 다시 돌릴 것.`);
  process.exit(1);
}
console.log(`\n${찍을것.length}장 찍었다. (${SITE})`);
