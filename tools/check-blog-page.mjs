// 붙여넣기 대장이 실제로 쓸 만한지 브라우저에서 눌러 본다.
//
//   node tools/check-blog-page.mjs
//
// ⚠️ 왜 필요한가: 이 페이지의 값어치는 "단추를 누르면 클립보드에 제대로 담기느냐"
//    하나뿐이다. 그런데 그건 HTML 을 눈으로 봐서는 알 수 없다. 실제로 눌러서
//    클립보드를 읽어 봐야 안다.
//
//    토막으로 끊은 뒤로는 볼 것이 하나 더 늘었다. 토막을 다 이으면 **원래 글과
//    같아야 한다.** 한 토막이라도 빠지면 블로그에 실린 글에 구멍이 난다.

import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const 글파일 = ['손없는날.txt', '띠궁합.txt', '만세력.txt', '오행식단.txt'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();

const 잘못 = [];
page.on('pageerror', (e) => 잘못.push('page error: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') 잘못.push('console: ' + m.text()); });

await page.goto('file:///' + join(ROOT, 'blog', 'blog-page.html').replace(/\\/g, '/'));

const 글수 = await page.locator('article.post').count();
console.log(`글 ${글수}편`);

for (let i = 0; i < 글수; i++) {
  const post = page.locator('article.post').nth(i);
  const 단추 = post.locator('.seg-head .copy');
  const 토막수 = await 단추.count();

  // 토막을 차례로 눌러 클립보드에 담긴 것을 모은다.
  //
  // 표가 든 토막은 클립보드에 <table> 로도 담겨야 한다. 글자로만 담기면 블로그에서
  // 줄글이 되고, 그러면 표를 만든 뜻이 없다.
  const 담긴것 = [];
  for (let j = 0; j < 토막수; j++) {
    await 단추.nth(j).click();
    담긴것.push(await page.evaluate(() => navigator.clipboard.readText()));

    const 표있나 = await post.locator('section.seg').nth(j).locator('figure.tbl').count() > 0;
    if (!표있나) continue;
    const html = await page.evaluate(async () => {
      for (const x of await navigator.clipboard.read()) {
        if (x.types.includes('text/html')) return new Response(await x.getType('text/html')).text();
      }
      return '';
    });
    if (!/<table/i.test(html)) {
      잘못.push(`${글파일[i]} ${j + 1}번째 토막: 표가 글자로만 담겼다`);
    }
  }

  // 원래 글에서 제목과 사진 자리를 뺀 것과 견준다.
  const 원문 = readFileSync(join(ROOT, 'blog', 글파일[i]), 'utf8')
    .replace(/\r\n/g, '\n').trimEnd().split('\n');
  const 기대 = 원문.slice(1)                       // 제목은 블로그 제목칸에 따로 넣는다
    .filter((l) => !/^사진 넣는 자리 (하나|둘)$/.test(l.trim()))
    .join('\n');

  // 빈 줄과 칸 수는 편집기가 어차피 다시 잡는다. 글자만 견준다.
  const 씻기 = (s) => s.replace(/\s+/g, '');
  const 붙인것 = 담긴것.join('\n');

  const 같나 = 씻기(붙인것) === 씻기(기대);
  console.log(`  ${글파일[i].padEnd(12)} 토막 ${토막수}개  ${같나 ? '원문과 같다' : '✖ 원문과 다르다'}`);

  if (!같나) {
    잘못.push(`${글파일[i]}: 토막을 다 이어도 원문이 안 나온다`);
    // 어디서 갈렸는지 짚어 준다.
    const a = 씻기(기대), b = 씻기(붙인것);
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    console.log(`     갈린 곳: ...${a.slice(Math.max(0, k - 30), k + 30)}`);
    console.log(`     담긴 것: ...${b.slice(Math.max(0, k - 30), k + 30)}`);
  }

}

await browser.close();

if (잘못.length) {
  console.error('\n' + 잘못.join('\n'));
  process.exit(1);
}
console.log('\n토막을 다 이으면 원문 그대로. 오류도 없다.');
