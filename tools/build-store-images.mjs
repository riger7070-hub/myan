// 인앱 상품 이미지(1024×1024 PNG)를 만든다.
//
//   node tools/build-store-images.mjs
//
// 원본은 mini/store/product-image.html. 결과는 mini/store/ 로 나온다.
// 앱인토스 콘솔의 '상품 이미지' 칸에 그대로 올리면 된다.
//
// 같은 그림을 `blog/토스 상품 이미지/` 에 **한글 이름으로 한 벌 더** 둔다.
// 올릴 파일을 찾을 때 blog/ 밑을 보시기 때문이다. token-100.png 보다 엽전100.png 가
// 눈에 빨리 들어온다.
//
// ⚠️ 두 벌을 **한 번에** 만든다. 손으로 복사해 두면 그림을 고치고 한쪽을 잊는다.
// ⚠️ blog/사진/ 안에는 두지 않는다. 거기는 build-blog-photos.mjs 가 돌 때마다
//    통째로 지우고 다시 만드는 자리라, 넣어 두면 조용히 사라진다.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const { chromium } = require('playwright');

// worker.js 의 MINI_PRODUCTS 와 짝을 맞춘다.
// [저장소에 둘 이름, 원본에 붙일 물음표 뒤, blog/ 에 둘 한글 이름]
const PRODUCTS = [
  ['token-10',  'tokens=10',  '엽전10'],
  ['token-30',  'tokens=30',  '엽전30'],
  ['token-100', 'tokens=100', '엽전100'],
  ['alms',      'kind=alms',  '동냥'],      // 안스님 동냥
];

const 블로그쪽 = join(ROOT, 'blog', '토스 상품 이미지');

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

await mkdir(블로그쪽, { recursive: true });

for (const [name, query, 한글] of PRODUCTS) {
  await pg.goto(`http://localhost:${port}/?${query}`, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(600);          // 웹폰트가 자리를 잡을 틈
  const out = join(ROOT, 'mini', 'store', `${name}.png`);
  // 화면을 한 번만 찍고 두 곳에 쓴다. 두 번 찍으면 미세하게 달라질 수 있다.
  const png = await pg.screenshot({ path: out });
  await writeFile(join(블로그쪽, `${한글}.png`), png);
  console.log(`만듦: ${name}.png  →  blog/토스 상품 이미지/${한글}.png`);
}

await writeFile(join(블로그쪽, '어디에 쓰나.txt'),
  [
    '앱인토스 콘솔의 「인앱 상품」에서 상품을 만들 때 「상품 이미지」 칸에 올리는 그림입니다.',
    '네이버 블로그에 넣는 사진이 아닙니다.',
    '',
    '모두 1024x1024 PNG 입니다. 콘솔이 요구하는 크기 그대로라 손대지 말고 그냥 올리세요.',
    '',
    '  엽전10.png    엽전 10개 (공급가 3,900 → 판매가 4,290원)',
    '  엽전30.png    엽전 30개 (공급가 9,000 → 판매가 9,900원)',
    '  엽전100.png   엽전 100개 (공급가 25,000 → 판매가 27,500원)',
    '  동냥.png      안스님 동냥 (공급가 1,000 → 판매가 1,100원)',
    '',
    '고치려면 mini/store/product-image.html 을 고치고 npm run store 를 돌리세요.',
    '이 폴더는 그때마다 다시 만들어지므로 여기서 직접 고치지 마세요.',
    '',
  ].join('\r\n'), 'utf8');

await br.close();
srv.close();
console.log(`\nblog/토스 상품 이미지/ 에 한 벌 더 뒀습니다 (한글 이름).`);
