// 붙여넣기 대장이 실제로 쓸 만한지 브라우저에서 눌러 본다.
//
//   node tools/check-blog-page.mjs      (npm run blog:check)
//
// ⚠️ 왜 필요한가: 이 페이지의 값어치는 "단추를 누르면 클립보드에 제대로 담기느냐"
//    하나뿐이다. 그런데 그건 HTML 을 눈으로 봐서는 알 수 없다. 실제로 눌러서
//    클립보드를 읽어 봐야 안다.
//
// 세 가지를 본다.
//   1. 담긴 글이 **원문 그대로**인가 (제목과 사진 자리만 빼고)
//   2. 표가 <table> 로 담기는가. 글자로만 담기면 블로그에서 줄글이 된다
//   3. 주소가 <a> 로 담기는가. 글자로만 담기면 읽는 사람이 손으로 쳐야 한다

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const 글파일 = ['손없는날.txt', '띠궁합.txt', '만세력.txt', '오행식단.txt'];

// 글 파일에 적힌 주소. 기대값을 여기서 뽑는다.
//
// ⚠️ 만들어진 페이지에서 세면 안 된다. 처음에 페이지의 <a> 를 세어 견줬더니
//    링크 거는 코드를 통째로 지워도 검사가 통과했다. 기대값도 같이 0 이 되기
//    때문이다. **자기가 만든 것을 자로 삼으면 무엇을 재도 맞는다.**
const 주소찾기 = /myan\.riger7070\.workers\.dev\/[\w/-]*|kmong\.com\/gig\/\d+/g;

const browser = await chromium.launch();
const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();

const 잘못 = [];
page.on('pageerror', (e) => 잘못.push('page error: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') 잘못.push('console: ' + m.text()); });

await page.goto('file:///' + join(ROOT, 'blog', 'blog-page.html').replace(/\\/g, '/'));

const 글수 = await page.locator('article.post').count();
if (글수 !== 글파일.length) 잘못.push(`글이 ${글수}편이다. ${글파일.length}편이어야 한다`);
console.log(`글 ${글수}편`);

for (let i = 0; i < 글수; i++) {
  const post = page.locator('article.post').nth(i);
  const 이름 = 글파일[i];

  await post.locator('.post-head .copy').click();
  const 글자 = await page.evaluate(() => navigator.clipboard.readText());
  const html = await page.evaluate(async () => {
    for (const x of await navigator.clipboard.read()) {
      if (x.types.includes('text/html')) return new Response(await x.getType('text/html')).text();
    }
    return '';
  });

  // ── 1. 원문 그대로인가
  const 원본 = readFileSync(join(ROOT, 'blog', 이름), 'utf8');
  const 기대 = 원본.replace(/\r\n/g, '\n').trimEnd().split('\n')
    .slice(1)                                     // 제목은 블로그 제목칸에 따로 넣는다
    .filter((l) => !/^사진 넣는 자리 (하나|둘)$/.test(l.trim()))
    .join('\n');
  // 빈 줄과 칸 수는 편집기가 어차피 다시 잡는다. 글자만 견준다.
  const 씻기 = (s) => s.replace(/\s+/g, '');
  const 같나 = 씻기(글자) === 씻기(기대);

  // ── 2. 표
  const 표수 = await post.locator('figure.tbl').count();
  const 담긴표 = (html.match(/<table/gi) || []).length;

  // ── 3. 링크
  const 있어야할링크 = (원본.match(주소찾기) || []).length;
  const 담긴링크 = (html.match(/<a [^>]*href=/gi) || []).length;

  // ── 4. 사진은 안 담겨야 한다. 폴더에 따로 빼 뒀고, 네이버가 어차피 안 받는다.
  const 담긴사진 = (html.match(/<img/gi) || []).length;

  console.log(`  ${이름.padEnd(12)} 글 ${같나 ? '그대로' : '✖ 다름'}`
    + ` · 표 ${담긴표}/${표수}`
    + ` · 링크 ${담긴링크}/${있어야할링크}`
    + ` · 사진 ${담긴사진}장`);

  if (!같나) {
    잘못.push(`${이름}: 담긴 글이 원문과 다르다`);
    const a = 씻기(기대), b = 씻기(글자);
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    console.log(`     원문은: ...${a.slice(Math.max(0, k - 30), k + 30)}`);
    console.log(`     담긴건: ...${b.slice(Math.max(0, k - 30), k + 30)}`);
  }
  if (담긴표 < 표수) 잘못.push(`${이름}: 표 ${표수}개 중 ${담긴표}개만 표로 담겼다`);
  if (담긴링크 < 있어야할링크) {
    잘못.push(`${이름}: 주소 ${있어야할링크}개 중 ${담긴링크}개만 링크로 담겼다`);
  }
  if (담긴사진) 잘못.push(`${이름}: 사진 ${담긴사진}장이 딸려 담겼다. 빼기로 했다`);
}

await browser.close();

if (잘못.length) {
  console.error('\n' + 잘못.join('\n'));
  process.exit(1);
}
console.log('\n글은 원문 그대로, 표와 링크는 살아서, 사진은 빠진 채로 담긴다.');
