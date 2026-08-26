// 콘텐츠 이름 시안을 **화면에 보이는 모양 그대로** 나란히 그린다.
//
// 표로 비교하면 다 그럴듯해 보인다. 실제 타일에 앉혀 봐야 길이가 넘치는지,
// 옆의 엽전 값과 부딪히는지, 한 칸에 몰아 놓았을 때 톤이 튀는지가 보인다.
//
//   node tools/preview-labels.mjs
//
// 결과물은 insta/labels.png (커밋하지 않는다 — 고르고 나면 쓸 일이 없다).

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'insta');

// [엽전, 지금 쓰는 이름, 사람 말투(B), 고민을 그대로(C)]
const ROWS = [
  [4, '돈이 모이는 자리'], [3, '내 사주에 앉은 살'], [4, '누가 나를 도와줄까'],
  [4, '이 길이 내 길이 맞을까'], [6, '지금 나는 어느 10년'], [4, '전생에 나는 누구였나'],
  [6, '이 사람과 좋은 때'], [5, '속궁합'], [5, '왜 자꾸 이 사람과 어긋날까'],
  [2, '오행으로 보는 두 사람'], [3, '내 짝은 어떤 사람'],
  [4, '내 이름에 담긴 기운'], [4, '아이 이름 지을 때'], [4, '관상과 손금'], [2, '숫자로 보는 내 성향'],
  [2, '이 일에 좋은 날'], [3, '나에게 좋은 방향'], [4, '올해 나에게 오는 것'], [4, '토정비결 신년운세'],
  [1, '오늘의 운세'], [1, '오늘의 띠 순위'], [1, '띠와 별자리 운세'], [1, '궁금한 것만 골라 보기'],
  [1, '오늘의 행운 아이템'], [1, '행성으로 보는 오늘'], [0, '산가지 뽑기'],
  [1, '오늘의 타로'], [1, '주역으로 물어보기'], [1, '룬 문자 점'], [1, '꿈해몽'],
  [0, '내 사주 풀이'],
];

const COLS = [{ key: '확정', title: '바뀐 이름', desc: 'B(사람 말투)를 기본으로, 셋만 C(고민 그대로)를 섞었다.' }];


const tile = (label, cost) => `
  <div class="tile">
    <span class="ic"></span>
    <span class="lb">${label}</span>
    <span class="ct">${cost} 엽전</span>
  </div>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;500;600&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background:#0d0d0f; color:#e8e4dc; font-family:'Noto Serif KR',serif;
    padding:38px 34px; width:560px;
  }
  h1 { font-size:23px; font-weight:600; color:#c9a96e; letter-spacing:2px; margin-bottom:6px; }
  .sub { font-size:14px; color:#8d8880; margin-bottom:30px; }
  .cols { display:flex; gap:26px; }
  .col { flex:1; min-width:0; }
  .head { margin-bottom:14px; }
  .head b { display:block; font-size:17px; font-weight:600; color:#e8c98a; margin-bottom:5px; }
  .head i { font-style:normal; font-size:12.5px; line-height:1.6; color:#8d8880; }
  /* 미니앱 타일과 같은 결. 폭이 좁아 이름이 길면 여기서 바로 티가 난다. */
  .tile {
    display:flex; align-items:center; gap:11px;
    background:linear-gradient(160deg,rgba(201,169,110,.09),rgba(201,169,110,.03));
    border:1px solid rgba(201,169,110,.16); border-radius:13px;
    padding:15px 15px; margin-bottom:9px;
  }
  .ic { width:21px; height:21px; flex:none; border-radius:5px;
        background:rgba(201,169,110,.22); }
  .lb { flex:1; min-width:0; font-size:15px; color:#e8e4dc;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .ct { flex:none; font-size:12.5px; color:#c9a96e; opacity:.75; }
</style></head><body>
  <h1>바뀐 콘텐츠 이름</h1>
  <div class="sub">실제 미니앱 타일 폭이다. 여기서 안 잘리면 화면에서도 안 잘린다.</div>
  <div class="cols">
    ${COLS.map((c, i) => `
      <div class="col">
        <div class="head"><b>${c.key}. ${c.title}</b><i>${c.desc}</i></div>
        ${ROWS.map(r => tile(r[1], r[0])).join('')}
      </div>`).join('')}
  </div>
</body></html>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

// 말줄임으로 잘린 이름이 있는지 재 본다. 눈으로는 놓치기 쉽다.
const clipped = await page.$$eval('.lb', (els) =>
  els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim()));
if (clipped.length) console.log('⚠️ 타일에서 잘리는 이름:', clipped.join(' / '));
else console.log('잘리는 이름 없음');

writeFileSync(join(OUT, 'labels.png'), await page.screenshot({ type: 'png', fullPage: true }));
console.log('insta/labels.png');
await browser.close();
