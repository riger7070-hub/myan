// X(트위터) 프로필 머리그림을 그린다. 1500x500.
//
// 인스타에는 없는 자리다. X 프로필에서 가장 크게 보이는 그림이라 비워 두면
// 계정이 비어 보인다.
//
// ⚠️ 자리 두 군데를 비워 둬야 한다.
//    1. 왼쪽 아래 — 프로필 사진(동그라미)이 머리그림 위로 걸쳐 앉는다.
//       실제로 재 보니 1500 기준 x=395 까지 덮는다 — 300 으로 뒀다가
//       마지막 줄("토스에서 …") 앞부분이 가렸다. 넉넉히 430 을 비운다.
//    2. 위아래 가장자리 — 좁은 화면에서는 3:1 로 잘려 나간다.
//       글씨는 세로 가운데에 둔다.
//
//   node tools/build-x-header.mjs
//
// 결과물은 insta/x-header.png.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'insta');
const W = 1500, H = 500;

// 프로필 사진이 덮는 자리. 글씨를 여기서부터 띄운다.
const AVATAR_SAFE = 430;

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;500;700&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:${W}px; height:${H}px; overflow:hidden; position:relative;
    font-family:'Noto Serif KR',serif; color:#e9e4da;
    /* 인스타 카드와 같은 밤하늘. 별은 그림 파일 없이 점 그라디언트로 찍는다. */
    background:
      radial-gradient(1.6px 1.6px at 22% 24%,rgba(232,212,168,.55),transparent),
      radial-gradient(1.6px 1.6px at 41% 68%,rgba(232,212,168,.40),transparent),
      radial-gradient(1.6px 1.6px at 58% 18%,rgba(232,212,168,.45),transparent),
      radial-gradient(1.6px 1.6px at 73% 76%,rgba(232,212,168,.32),transparent),
      radial-gradient(1.6px 1.6px at 88% 34%,rgba(232,212,168,.42),transparent),
      radial-gradient(ellipse 60% 130% at 78% 50%,#1c160e 0%,transparent 62%),
      linear-gradient(105deg,#0a0806 0%,#060608 58%,#050506 100%);
    display:flex; align-items:center;
    padding-left:${AVATAR_SAFE}px;
  }
  .moon {
    position:absolute; right:118px; top:50%; transform:translateY(-50%);
    width:132px; height:132px; border-radius:50%;
    background:radial-gradient(circle at 38% 34%,#fdf3d8,#eed9a4 45%,#cbb072);
    box-shadow:0 0 78px rgba(232,212,168,.40);
  }
  .brand { color:#c9a96e; letter-spacing:15px; font-size:23px; margin-bottom:20px; }
  .hl {
    font-size:52px; font-weight:700; line-height:1.34; letter-spacing:-.5px;
    background:linear-gradient(176deg,#f4e3bd,#c9a96e 62%,#a5854e);
    -webkit-background-clip:text; background-clip:text; color:transparent;
  }
  .sub { margin-top:20px; font-size:25px; color:rgba(233,228,218,.55); letter-spacing:.5px; }
  .sub b { color:#c9a96e; font-weight:500; }
  /* 오행 다섯 글자를 달 둘레에 흩는다 — 로딩 화면의 궤도를 눕혀 놓은 셈이다. */
  .el { position:absolute; font-family:'Batang','Noto Serif KR',serif; font-size:30px;
        text-shadow:0 0 16px currentColor, 0 0 38px currentColor; opacity:.75; }
</style></head><body>
  <div class="moon"></div>
  <div class="el" style="color:#5d9e6f; right:330px; top:112px">木</div>
  <div class="el" style="color:#c0563f; right:196px; top:64px">火</div>
  <div class="el" style="color:#c9a96e; right:92px;  top:118px">土</div>
  <div class="el" style="color:#e6e2d8; right:86px;  bottom:96px">金</div>
  <div class="el" style="color:#4a7bb0; right:238px; bottom:58px">水</div>
  <div>
    <div class="brand">M ; Y 安</div>
    <div class="hl">오늘 당신의 기운을<br>사주로 풀어 드립니다</div>
    <div class="sub">토스에서 <b>오늘운빨</b> · 검색</div>
  </div>
</body></html>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

// 글씨가 프로필 사진 자리로 밀려들지 않았는지 본다. 눈으로만 보면
// 사진을 올린 뒤에야 가려진 걸 알게 된다.
const left = await page.locator('.hl').boundingBox();
if (!left || left.x < AVATAR_SAFE - 1) {
  console.error(`글씨가 프로필 사진 자리를 침범한다 (x=${left?.x})`);
  process.exit(1);
}

const buf = await page.screenshot({ type: 'png' });
writeFileSync(join(OUT, 'x-header.png'), buf);
console.log(`insta/x-header.png  ${W}x${H}  ${(buf.length / 1024).toFixed(0)}KB`);
await browser.close();
