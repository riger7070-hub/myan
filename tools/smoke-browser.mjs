// 배포본을 **브라우저로** 두드려 본다.
//
//   node tools/smoke-browser.mjs              배포본
//   node tools/smoke-browser.mjs http://…     다른 대상
//
// tools/smoke.mjs 와 무엇이 다른가: 그쪽은 fetch 로 계약만 본다. 이쪽은 진짜 브라우저를
// 띄워 **사람이 하듯 눌러 본다.**
//
// ⚠️ 이 도구가 왜 생겼는가:
//    생년월일 칸에 max="1970" 이 박힌 채 배포된 적이 있다. 1970년 뒤에 태어난 사람은
//    브라우저가 폼 제출을 막았고 오류 한 줄 없이 단추만 안 먹었다.
//    API 는 200 을 냈고, 페이지도 200 이었고, 테스트도 전부 초록이었다.
//    **누가 눌러 보기 전까지 아무도 몰랐다.**
//
//    fetch 로는 이 부류를 절대 못 잡는다. HTML5 유효성 검사, 자바스크립트 오류,
//    안 눌리는 단추, 죽은 링크는 브라우저를 띄워야 보인다.

import { chromium } from 'playwright';

const SITE = (process.argv[2] || 'https://myan.riger7070.workers.dev').replace(/\/$/, '');
const 실패 = [];
const 적기 = (곳, 무엇) => { 실패.push(`${곳}  ${무엇}`); };

// 그냥 열리기만 하면 되는 곳.
const 열어볼곳 = [
  '/', '/app', '/calc', '/tti', '/gunghap',
  '/calc/samjae', '/calc/sinsal', '/calc/bonmyeong', '/calc/manseryeok', '/calc/sonnal',
  '/calc/samjae/1990', '/terms', '/privacy-policy',
];

// 값을 넣고 눌러 봐야 하는 곳. [주소, 채우기, 결과가 나왔는지 보는 법]
const 눌러볼곳 = [
  ['/calc/sinsal', { 'f-year': '1995', 'f-month': '8', 'f-day': '20' }, '#out .card'],
  ['/calc/bonmyeong', { 'f-year': '1995' }, '#out .card'],
  ['/calc/manseryeok', { 'f-year': '1995', 'f-month': '8', 'f-day': '20' }, '#out .card'],
  ['/calc/sonnal', { 'f-year': '2026', 'f-month': '4' }, '#out .card'],
  // 삼재는 결과가 제 주소를 갖는다. 카드가 아니라 주소가 바뀌는지 본다.
  ['/calc/samjae', { 'f-year': '1995' }, 'URL:/calc/samjae/1995'],
];

const browser = await chromium.launch();

// ── 하나. 열리는가, 조용한가, 링크가 살아 있는가 ──
const 본링크 = new Map();

for (const path of 열어볼곳) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const 시끄러움 = [];
  page.on('pageerror', (e) => 시끄러움.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // 구글 로그인은 로그인 안 한 채로 열면 늘 시끄럽다. 우리 잘못이 아니다.
    if (/GSI_LOGGER|identity provider|accounts list is empty|FedCM/.test(t)) return;
    시끄러움.push('console: ' + t.slice(0, 120));
  });

  try {
    const res = await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 30000 });
    if (!res || res.status() >= 400) 적기(path, `상태 ${res?.status()}`);
    await page.evaluate(() => document.fonts?.ready);

    // 화면에 글이 하나도 없으면 껍데기만 뜬 것이다.
    const 글자수 = (await page.evaluate(() => document.body.innerText.trim().length));
    if (글자수 < 80) 적기(path, `본문이 ${글자수}자뿐이다 — 화면이 안 그려졌다`);

    // 우리 안으로 가는 링크를 모아 둔다. 뒤에서 한 번에 확인한다.
    for (const href of await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))) {
      if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:|intoss)/.test(href)) continue;
      const clean = href.split('?')[0].split('#')[0];
      if (clean && !본링크.has(clean)) 본링크.set(clean, path);
    }
    for (const s of 시끄러움) 적기(path, s);
  } catch (e) {
    적기(path, '열지 못했다: ' + e.message.split('\n')[0]);
  }
  await page.close();
}

// ── 둘. 링크가 정말 살아 있는가 ──
for (const [href, 어디서] of 본링크) {
  try {
    const r = await fetch(SITE + href, { method: 'GET', redirect: 'follow' });
    if (r.status >= 400) 적기(어디서, `죽은 링크 ${href} (${r.status})`);
  } catch {
    적기(어디서, `못 여는 링크 ${href}`);
  }
}

// ── 셋. 폼이 정말 제출되는가 ──
//
// ⚠️ 여기가 max="1970" 을 잡았을 자리다. 채우고, 브라우저가 막지 않는지 보고, 누른다.
for (const [path, 값들, 확인] of 눌러볼곳) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  try {
    await page.goto(SITE + path, { waitUntil: 'networkidle', timeout: 30000 });
    for (const [id, v] of Object.entries(값들)) await page.fill('#' + id, v);

    // 누르기 **전에** 브라우저가 막을 것인지 본다. 막히면 아무 일도 안 일어나고
    // 오류도 안 뜨므로, 여기서 짚어 주지 않으면 원인을 찾는 데 한참 걸린다.
    const 막힘 = await page.evaluate(() =>
      [...document.querySelectorAll('#f input, #f select')]
        .filter((el) => !el.checkValidity())
        .map((el) => `${el.id}: ${el.validationMessage} (값=${el.value})`));
    if (막힘.length) {
      적기(path, '브라우저가 제출을 막는다 — ' + 막힘.join(' / '));
      await page.close();
      continue;
    }

    await page.click('#go');
    if (확인.startsWith('URL:')) {
      await page.waitForURL(SITE + 확인.slice(4), { timeout: 15000 });
    } else {
      await page.waitForSelector(확인, { timeout: 15000 });
      const n = await page.$$eval(확인, (e) => e.length);
      if (!n) 적기(path, '결과가 비어 있다');
    }
  } catch (e) {
    const err = await page.textContent('#err').catch(() => '');
    적기(path, '눌러도 결과가 안 나온다' + (err ? ` (화면 문구: ${err})` : '') );
  }
  await page.close();
}

await browser.close();

console.log(`대상: ${SITE}`);
console.log(`  페이지 ${열어볼곳.length}장, 링크 ${본링크.size}개, 폼 ${눌러볼곳.length}개를 눌러 봤다.\n`);
if (!실패.length) {
  console.log('  전부 정상');
} else {
  for (const f of 실패) console.error('  ✖ ' + f);
  console.error(`\n${실패.length}건`);
  process.exit(1);
}
