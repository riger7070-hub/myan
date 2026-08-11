// 인앱 상품 이미지(1024×1024 PNG)를 만든다.
//
//   node tools/build-store-images.mjs
//
// 원본은 mini/store/product-image.html. 결과는 mini/store/token-*.png 로 나온다.
// 앱인토스 콘솔의 '상품 이미지' 칸에 그대로 올리면 된다.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const { chromium } = require('playwright');

const PRODUCTS = [10, 30, 100];          // worker.js 의 MINI_PRODUCTS 와 같은 개수

const srv = createServer(async (rq, rs) => {
  try {
    const b = await readFile(join(ROOT, 'mini', 'store', 'product-image.html'));
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(b);
  } catch { rs.writeHead(404).end(); }
});
await new Promise(r => srv.listen(0, r));
const port = srv.address().port;

let br;
for (const ch of ['msedge', 'chrome', undefined]) {
  try { br = await chromium.launch(ch ? { channel: ch } : {}); break; } catch (e) { if (!ch) throw e; }
}
// 배율 1 — 콘솔이 요구하는 크기가 정확히 1024×1024 다.
const pg = await br.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });

for (const n of PRODUCTS) {
  await pg.goto(`http://localhost:${port}/?tokens=${n}`, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(600);          // 웹폰트가 자리를 잡을 틈
  const out = join(ROOT, 'mini', 'store', `token-${n}.png`);
  await pg.screenshot({ path: out });
  console.log('만듦:', out);
}

await br.close();
srv.close();
