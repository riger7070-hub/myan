// 링크 미리보기 카드를 미리 그려 둔다.
//
// 왜 미리 만드는가:
//   카톡·트위터·디스콰이엇 같은 데는 미리보기로 **래스터 그림(PNG)** 만 받는다.
//   SVG 를 걸어 두면 대부분 그냥 빈 칸이 뜬다. 그런데 Workers 에서 PNG 를 즉석에서
//   그리려면 폰트 렌더러(satori+resvg WASM, 1MB 넘는다)를 얹어야 한다 —
//   미리보기 그림 하나 때문에 워커를 그만큼 무겁게 만들 이유가 없다.
//
//   대신 나올 수 있는 그림이 몇 장 안 된다는 점을 쓴다. 띠 순위는 1위가 열두 띠 중
//   하나이므로 열두 장이면 모든 날을 덮는다. 계산기들은 페이지마다 한 장씩이다.
//
//   node tools/build-og-cards.mjs
//
// 결과물은 og/ 아래에 들어가고 워커가 정적 자산으로 그대로 내보낸다.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'og');

// 카톡·트위터가 함께 좋아하는 비율(1.91:1). 정사각으로 두면 양쪽에서 잘린다.
const W = 1200, H = 630;

const TTI = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];

/** 카드 한 장. 화면 CSS 와 같은 금·먹 팔레트를 쓴다. */
function card({ eyebrow, title, sub }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${W}px; height: ${H}px; overflow: hidden;
    font-family: 'Noto Serif KR', serif; color: #e9e4da;
    background:
      radial-gradient(1.6px 1.6px at 12% 16%, rgba(232,212,168,0.5), transparent),
      radial-gradient(1.6px 1.6px at 74% 10%, rgba(232,212,168,0.4), transparent),
      radial-gradient(1.6px 1.6px at 88% 34%, rgba(232,212,168,0.35), transparent),
      radial-gradient(1.6px 1.6px at 32% 8%,  rgba(232,212,168,0.3), transparent),
      radial-gradient(ellipse 80% 60% at 50% 0%, #1b150d 0%, transparent 62%),
      linear-gradient(160deg, #100c08 0%, #060608 60%, #050506 100%);
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 92px; position: relative;
  }
  /* 오른쪽 위에 뜬 달 */
  .moon {
    position: absolute; right: 96px; top: 88px;
    width: 108px; height: 108px; border-radius: 50%;
    background: radial-gradient(circle at 38% 34%, #fdf3d8 0%, #eed9a4 45%, #cbb072 100%);
    box-shadow: 0 0 60px rgba(232,212,168,0.42);
  }
  .brand { color: #c9a96e; letter-spacing: 15px; font-size: 25px; margin-bottom: 40px; }
  .eyebrow { color: #c9a96e; font-size: 30px; letter-spacing: 3px; margin-bottom: 20px; opacity: .92; }
  .title {
    font-size: ${title.length > 14 ? 74 : 92}px; font-weight: 600; line-height: 1.24;
    background: linear-gradient(176deg, #f4e3bd, #c9a96e 62%, #a5854e);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    word-break: keep-all;
  }
  .sub { margin-top: 30px; font-size: 31px; color: rgba(233,228,218,0.62); word-break: keep-all; }
  /* 아래를 가로지르는 금선 — 화면의 구분선과 같은 결 */
  .rule {
    position: absolute; left: 92px; right: 92px; bottom: 74px; height: 1px;
    background: linear-gradient(90deg, rgba(201,169,110,0.55), rgba(201,169,110,0.06));
  }
</style></head><body>
  <div class="moon"></div>
  <div class="brand">M ; Y 安</div>
  <div class="eyebrow">${eyebrow}</div>
  <div class="title">${title}</div>
  ${sub ? `<div class="sub">${sub}</div>` : ''}
  <div class="rule"></div>
</body></html>`;
}

const CARDS = [
  ...TTI.map((t) => ({
    name: `tti-${t}`,
    eyebrow: '오늘의 띠 순위',
    title: `오늘 1위는<br>${t}띠입니다`,
    sub: '일진과 열두 띠가 맺는 관계로 냈습니다',
  })),
  { name: 'tti', eyebrow: '오늘의 띠 순위', title: '오늘 내 띠는<br>몇 위일까',
    sub: '뽑기가 아니라 계산입니다' },
  { name: 'calc', eyebrow: '무료 사주 계산기', title: '가입 없이<br>바로 봅니다',
    sub: '삼재 · 신살 · 본명궁' },
  { name: 'calc-samjae', eyebrow: '삼재 계산기', title: '내 삼재는<br>언제인가',
    sub: '태어난 해만 넣으면 됩니다' },
  { name: 'calc-sinsal', eyebrow: '신살 풀이', title: '내 사주에 든<br>신살 찾기',
    sub: '도화 · 역마 · 화개 · 백호 · 천을귀인' },
  { name: 'calc-bonmyeong', eyebrow: '본명궁과 방위', title: '나에게 좋은<br>방위 찾기',
    sub: '집과 책상 방향을 고를 때' },
  { name: 'home', eyebrow: '명리학으로 보는 하루', title: '안도령이<br>오늘의 기운을 풀어 드려요',
    sub: '사주 · 궁합 · 택일 · 귀인' },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

for (const c of CARDS) {
  await page.setContent(card(c), { waitUntil: 'networkidle' });
  // 웹폰트가 다 앉을 때까지 기다린다. 안 기다리면 기본 고딕으로 찍힌다.
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ type: 'png' });
  writeFileSync(join(OUT, `${c.name}.png`), buf);
  console.log(`og/${c.name}.png  ${(buf.length / 1024).toFixed(0)}KB`);
}

await browser.close();
console.log(`\n${CARDS.length}장 만들었다.`);
