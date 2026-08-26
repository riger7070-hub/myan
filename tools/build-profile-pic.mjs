// 인스타·스레드 프로필 사진을 그린다.
//
// 웹 첫 화면(#splash)과 같은 그림이다 — 안도령 둘레를 오행 다섯 글자가 돈다.
// 로딩 화면을 본 사람이 프로필에서 같은 얼굴을 알아보게 하려는 것이다.
//
// ⚠️ 프로필 사진은 **동그랗게 잘린다**. 정사각형 1080 안에서 실제로 보이는 것은
//    가운데 지름 1080 의 원뿐이고, 모서리는 다 잘려 나간다. 그래서
//    글씨를 넣지 않고, 궤도 반지름도 원 안쪽(448+32 < 540)으로 잡는다.
//
// ⚠️ 실제로는 150px 남짓으로 줄여서 보여준다. 잔글씨는 뭉개지므로
//    안도령과 오행 글자만 크게 둔다.
//
//   node tools/build-profile-pic.mjs
//
// 결과물은 insta/profile.png (1080x1080).

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'insta');
const S = 1080;

// 안도령을 파일로 걸지 않고 문서 안에 박아 넣는다. file:// 로 열면 상대 경로가
// 안 잡혀서 그림이 통째로 빠진 채로 저장되는 일이 있었다.
const ORACLE = readFileSync(join(ROOT, 'andoryeong.svg'), 'utf8')
  .replace(/<\?xml[^>]*\?>/, '')
  .trim();

// 각도·색은 index.html 의 .sp-orb 와 같다. 순서(木火土金水)도 같이 맞춘다.
const ORBS = [
  { g: '木', a: 0,   c: '#5d9e6f' },
  { g: '火', a: 72,  c: '#c0563f' },
  { g: '土', a: 144, c: '#c9a96e' },
  { g: '金', a: 216, c: '#e6e2d8' },
  { g: '水', a: 288, c: '#4a7bb0' },
];

// 프로필은 150px 남짓으로 줄어든다. 스플래시와 같은 비율로 그리면 안도령이
// 75px 이 되어 뭉개지므로, 원을 꽉 채우도록 키운다.
const ORACLE_H = 700;   // 안도령 높이 (원 지름의 65%)
const R = 448;          // 궤도 반지름 — 글자 반폭까지 더해도 480 < 540 이라 안 잘린다
const ORB_PX = 64;

const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;500&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:${S}px; height:${S}px; overflow:hidden;
    display:flex; align-items:center; justify-content:center;
    /* 새까맣게 두면 아이콘이 아니라 구멍으로 보인다. 가운데를 살짝 덥힌다. */
    background:
      radial-gradient(circle at 50% 42%,#1b150d 0%,#0b0a08 55%,#060608 100%);
  }
  /* 스플래시와 같은 숨결. 멈춘 그림이라 한가운데 밝기로 고정한다. */
  .halo {
    position:absolute; width:${S * 0.78}px; height:${S * 0.78}px; border-radius:50%;
    background:radial-gradient(circle,rgba(201,169,110,.26) 0%,rgba(201,169,110,0) 66%);
  }
  /* 동그랗게 잘리는 자리에 맞춘 금테. 잘림선보다 안쪽(505)에 둔다. */
  .rim {
    position:absolute; width:1010px; height:1010px; border-radius:50%;
    border:3px solid rgba(201,169,110,.35);
  }
  .stage { position:relative; width:${S}px; height:${S}px;
    display:flex; align-items:center; justify-content:center; }
  .oracle { position:relative; height:${ORACLE_H}px; }
  .orb {
    position:absolute; left:50%; top:50%;
    font-family:'Batang','Noto Serif KR',serif; font-size:${ORB_PX}px; font-weight:500;
    /* 글자 자신의 색으로 번지게 한다(currentColor) — 스플래시와 같다. */
    text-shadow:0 0 20px currentColor, 0 0 48px currentColor, 0 0 76px rgba(255,255,255,.22);
    transform-origin:0 0;
  }
</style></head><body>
<div class="stage">
  <div class="halo"></div>
  <div class="rim"></div>
  ${ORACLE.replace('<svg ', '<svg class="oracle" ')}
  ${ORBS.map((o) => `<span class="orb" style="color:${o.c};
    transform:rotate(${o.a}deg) translateX(${R}px) rotate(${-o.a}deg) translate(-50%,-50%)"
    >${o.g}</span>`).join('')}
</div>
</body></html>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: S, height: S }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

// 안도령이 실제로 그려졌는지 본다. 빠져도 검은 동그라미가 나올 뿐이라
// 눈으로 보기 전에는 모른다 — 여기서 걸러야 한다.
const box = await page.locator('svg.oracle').boundingBox();
if (!box || box.height < 600) {
  console.error(`안도령이 안 들어갔다 (${JSON.stringify(box)})`);
  process.exit(1);
}

const buf = await page.screenshot({ type: 'png' });
writeFileSync(join(OUT, 'profile.png'), buf);
console.log(`insta/profile.png  ${S}x${S}  ${(buf.length / 1024).toFixed(0)}KB`);
await browser.close();
