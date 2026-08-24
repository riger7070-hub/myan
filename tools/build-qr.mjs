// 미니앱 공유 주소의 QR 을 한 장 만든다.
//
// 주소가 고정이라 QR 도 고정이다. 사용자 브라우저에서 QR 라이브러리를 받아 그릴
// 이유가 없다 — 그만큼 느려지고, 그쪽이 죽으면 여기도 죽는다.
//
//   node tools/build-qr.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const LINK = process.argv[2];
if (!LINK) { console.error('주소를 인자로 주세요'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 420 } });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:420px;background:#fff}
#q{padding:18px;background:#fff}</style></head>
<body><div id="q"></div>
<script>new QRCode(document.getElementById('q'),
  { text: ${JSON.stringify(LINK)}, width: 360, height: 360,
    colorDark: '#0d0b09', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M });</script></body></html>`,
  { waitUntil: 'networkidle' });
// qrcodejs 는 canvas 와 img 를 둘 다 넣고 하나를 숨긴다. 어느 쪽이 보이든
// 담고 있는 칸을 통째로 찍으면 된다.
await page.waitForFunction(() => document.querySelector('#q')?.children.length > 0);
await new Promise(r => setTimeout(r, 500));

mkdirSync('og', { recursive: true });
const buf = await page.locator('#q').screenshot({ type: 'png' });
writeFileSync('og/qr-app.png', buf);
console.log(`og/qr-app.png  ${(buf.length / 1024).toFixed(0)}KB`);
await browser.close();
