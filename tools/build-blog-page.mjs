// blog/*.txt 와 사진을 한 장으로 합쳐 본다.
//
//   node tools/build-blog-page.mjs
//
// 왜 만드는가: 네이버 블로그에 올리려면 글은 복사해서 붙이고 사진은 따로 넣어야 하는데,
// 글 파일과 그림 파일이 따로 있으면 **어느 사진이 어디 들어가는지**를 매번 다시 맞춰야
// 한다. 여기서는 사진이 들어갈 자리에 사진이 그대로 앉아 있다.
//
// ⚠️ 글은 파일에서 **그대로** 읽는다. 여기서 다시 적으면 복사한 글과 파일이 갈라진다.
// ⚠️ 사진은 data 주소로 심는다. 아티팩트는 바깥 주소를 막으므로 파일 경로로 걸면
//    빈 칸만 나온다. 심어 두면 오른쪽 눌러 복사도 된다.

import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'blog', 'blog-page.html');

// 프로필 사진은 인스타·X 에 쓴 것을 그대로 쓴다.
//
// ⚠️ 손으로 복사해 두지 않고 **여기서 복사한다.** 두 벌을 손으로 관리하면 원본을
//    고치고 이쪽을 잊는 것은 시간 문제다. 원본은 insta/profile.png 하나뿐이다.
// ⚠️ 계정마다 다른 얼굴을 쓰면 같은 곳이라는 것을 알아보지 못한다. 블로그에서 보고
//    인스타에 와도 같은 그림이어야 한다.
const PROFILE = 'insta/profile.png';
copyFileSync(join(ROOT, PROFILE), join(ROOT, 'blog', 'profile.png'));

// 올리는 순서대로.
//
// 사진이 둘씩 들어간다. 첫째는 만든 카드(insta/), 둘째는 **진짜 돌아가는 화면**
// (blog/shots/, npm run shots 로 찍는다).
//
// ⚠️ 둘 다 카드면 광고 두 장이 된다. 하나는 실제 화면이어야 쓸 수 있는 것으로 읽힌다.
const POSTS = [
  { file: '손없는날.txt', card: 'insta/sonnal.png', shot: 'blog/shots/sonnal.png',
    보낼곳: '/calc/sonnal', 둘째: '2026년 4월을 계산한 실제 화면' },
  { file: '띠궁합.txt', card: 'insta/gunghap.png', shot: 'blog/shots/gunghap.png',
    보낼곳: '/gunghap', 둘째: '궁합표 페이지의 실제 화면' },
  { file: '만세력.txt', card: 'insta/manseryeok.png', shot: 'blog/shots/manseryeok.png',
    보낼곳: '/calc/manseryeok', 둘째: '1990년 5월 15일 사시로 뽑아 본 실제 화면' },
  { file: '오행식단.txt', card: 'insta/ohaeng-food.png', shot: 'blog/shots/manseryeok.png',
    보낼곳: '/calc/manseryeok', 둘째: '만세력이 오행 비율을 내주는 실제 화면' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');

/**
 * 글에 적힌 주소를 **누를 수 있는 링크**로 바꾼다.
 *
 * ⚠️ 글 파일(blog/*.txt)에는 링크 문법을 넣지 않는다. 대괄호를 쓰면 붙여 넣었을 때
 *    그 기호가 그대로 찍히고, 그게 싫어서 애초에 기호를 다 뺐다. 그래서 문법 대신
 *    **주소 생김새로 찾는다.** 글 파일은 계속 맨 글자로 남는다.
 *
 * ⚠️ 보이는 글자는 주소 그대로 둔다. 네이버가 링크를 떼어 내더라도 주소는 남아야
 *    손으로 치기라도 한다. "여기를 누르세요" 로 바꾸면 떼이는 순간 아무 데도 못 간다.
 *
 * 아무 주소나 걸지 않는다. 우리 것과 크몽 하나뿐이다.
 */
const 주소찾기 = /(myan\.riger7070\.workers\.dev\/[\w/-]*|kmong\.com\/gig\/\d+)/g;
const 링크걸기 = (s) => s.replace(주소찾기, '<a href="https://$1">$1</a>');

/**
 * 표로 만들 줄인가.
 *
 * 글에서 표는 "들여쓰고 칸 사이를 두 칸 넘게 띄운 줄" 로 적혀 있다.
 * 글 파일 하나만 놓고 봐도 표처럼 읽히고, 여기서는 진짜 표로 세울 수 있다.
 *
 *     1월   7(수) 8(목) 17(토)
 *     목    간과 담    푸른색, 신맛
 *
 * ⚠️ 글 파일에 따로 문법을 넣지 않았다. 대괄호나 파이프 같은 기호를 넣으면 붙여
 *    넣었을 때 그 기호가 그대로 찍힌다. 지금 모양은 기호 없이도 표로 읽힌다.
 */
const 표줄인가 = (line) => /^\s{2,}\S/.test(line) && /\S {2,}\S/.test(line);
const 칸나누기 = (line) => line.trim().split(/ {2,}/);

/**
 * 글 한 편을 화면에 올릴 조각으로 바꾼다.
 *
 * 첫 줄은 제목, 마지막 줄은 태그다. 그 사이가 본문이고, 본문 안의 "사진 넣는 자리"
 * 줄은 사진으로, 표처럼 적힌 줄 묶음은 진짜 표로 바꿔 끼운다.
 */
function 조각내기(text, post) {
  const lines = text.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const 제목 = lines[0].trim();
  const 태그 = lines[lines.length - 1].trim();
  const 본문 = lines.slice(1, -1);

  const out = [];
  let 묶음 = [];
  let 표 = [];

  const 글쏟기 = () => {
    const t = 묶음.join('\n').trim();
    if (t) out.push({ 종류: '글', 값: t });
    묶음 = [];
  };
  const 표쏟기 = () => {
    // 한 줄짜리는 표가 아니다. 그냥 들여 쓴 문장일 뿐이다.
    if (표.length >= 2) out.push({ 종류: '표', 행: 표.map(칸나누기) });
    else 묶음.push(...표);
    표 = [];
  };

  for (const line of 본문) {
    if (표줄인가(line)) { 글쏟기(); 표.push(line); continue; }
    표쏟기();
    const m = /^사진 넣는 자리 (하나|둘)$/.exec(line.trim());
    if (!m) { 묶음.push(line); continue; }
    글쏟기();
    out.push({ 종류: '사진', 첫째: m[1] === '하나' });
  }
  표쏟기();
  글쏟기();
  return { 제목, 태그, 조각: out, 태그수: (태그.match(/#/g) || []).length };
}

/**
 * 조각을 **사진 자리에서 끊어** 토막으로 묶는다.
 *
 * ⚠️ 왜 끊는가: 네이버 편집기는 붙여 넣은 글에 사진을 안 실어 준다. 사진은 손으로
 *    올려야 한다. 그런데 글을 통째로 붙이면 "사진 넣는 자리 하나" 라는 글자가
 *    본문에 그대로 박히고, 그걸 지운 다음 그 자리에 사진을 올려야 한다.
 *    글 한 편에 두 번, 네 편이면 여덟 번이다.
 *
 *    그래서 사진 자리에서 끊어 둔다. 토막을 붙이고, 사진을 올리고, 다음 토막을
 *    붙인다. **지울 글자가 없다.**
 *
 * 태그는 마지막 토막에 붙인다. 따로 떼면 한 번 더 복사해야 한다.
 */
function 마디나누기(조각, 태그) {
  const 마디 = [[]];
  for (const c of 조각) {
    if (c.종류 === '사진') { 마디.push([]); continue; }
    마디[마디.length - 1].push(c);
  }
  마디[마디.length - 1].push({ 종류: '글', 값: 태그 });
  return 마디;
}

/** 토막을 글자로만 편다. 클립보드가 막혔을 때 쓰는 뒷길이다. */
const 마디글 = (조각들) => 조각들.map((c) => c.종류 === '표'
  ? c.행.map((r) => '  ' + r.join('   ')).join('\n')
  : c.값).join('\n\n');

const 글들 = POSTS.map((p) => {
  const 쪼갠것 = 조각내기(readFileSync(join(ROOT, 'blog', p.file), 'utf8'), p);
  return {
    ...p,
    ...쪼갠것,
    마디: 마디나누기(쪼갠것.조각, 쪼갠것.태그),
    이름: p.file.replace('.txt', ''),
    카드: 'data:image/png;base64,' + b64(p.card),
    화면: 'data:image/png;base64,' + b64(p.shot),
  };
});

/**
 * 사진 폴더 이름을 **디스크에서 읽어 온다.**
 *
 * ⚠️ 여기에 폴더 이름을 다시 적지 않는다. build-blog-photos.mjs 가 만드는 이름에는
 *    올린 글번호가 붙는데(1-손없는날-224392909113), 그 번호는 글을 올려야 생긴다.
 *    두 곳에 적어 두면 한쪽만 고치고 넘어가 안내가 틀린 폴더를 가리키게 된다.
 *    실제로 있는 폴더를 찾아 그 이름을 쓴다.
 */
function 사진폴더(순서, 이름) {
  const 밑 = join(ROOT, 'blog', '사진');
  const 앞 = `${순서}-${이름}`;
  if (existsSync(밑)) {
    const 찾음 = readdirSync(밑).find((d) => d === 앞 || d.startsWith(앞 + '-'));
    if (찾음) return 찾음;
  }
  return 앞;                                  // 아직 안 만들었으면 짐작한 이름
}

/**
 * 그 폴더에 든 사진 파일 이름. [카드, 실제화면] 차례로.
 *
 * ⚠️ 이름 규칙(카드는 "띠.png", 실제 화면은 "띠 예시.png")을 여기 다시 적지 않는다.
 *    실제로 있는 파일을 보고, "예시" 가 붙은 쪽이 실제 화면이다. 규칙을 두 곳에
 *    적으면 build-blog-photos.mjs 만 고치고 여기를 잊는다.
 */
function 사진이름들(순서, 이름) {
  const 폴더 = join(ROOT, 'blog', '사진', 사진폴더(순서, 이름));
  if (!existsSync(폴더)) return ['', ''];
  const png = readdirSync(폴더).filter((f) => f.endsWith('.png'));
  return [png.find((f) => !f.includes('예시')) || '', png.find((f) => f.includes('예시')) || ''];
}

// 표마다 제 번호를 준다. 아래 스크립트가 이 번호로 클립보드에 실을 표를 고른다.
const 표들 = [];
// 토막마다 글자만 편 것. 클립보드가 막혔을 때 쓴다.
const 평문들 = [];

/** 토막 하나를 숨은 덩어리(복사되는 것)로 그린다. */
const 깨끗하게 = (조각들, 이름) => 조각들.map((c) => c.종류 === '표'
  ? `<table border="1" style="border-collapse:collapse">${c.행.map((r) =>
      `<tr>${r.map((cell) => `<td style="padding:6px 10px">${esc(cell)}</td>`).join('')}</tr>`
    ).join('')}</table><p></p>`
  : 링크걸기(esc(c.값)).split('\n\n').map((p) => `<p>${p.split('\n').join('<br>')}</p>`).join('')
).join('');

/** 토막 하나를 눈에 보이게 그린다. */
const 보이게 = (조각들) => 조각들.map((c) => c.종류 === '표'
  ? `<figure class="tbl">
       <table>
         ${c.행.map((r) => `<tr>${r.map((cell, k) =>
           k === 0 ? `<th scope="row">${esc(cell)}</th>` : `<td>${esc(cell)}</td>`
         ).join('')}</tr>`).join('\n         ')}
       </table>
       <button class="copy small" type="button" data-table="${표들.push(c.행) - 1}">
         <span class="copy-label">이 표만 복사</span>
       </button>
       <figcaption>이 표는 위 토막 복사에 이미 들어 있습니다.
         표 하나만 따로 쓰실 때 누르세요.</figcaption>
     </figure>`
  : `<pre class="text">${링크걸기(esc(c.값))}</pre>`).join('\n      ');

const 본문HTML = 글들.map((g, i) => `
  <article class="post" id="post-${i + 1}">
    <header class="post-head">
      <div class="ord"><span>${i + 1}</span>번째로 올릴 글</div>
      <h2>${esc(g.제목)}</h2>
      <dl class="meta">
        <div><dt>보내는 곳</dt><dd><code>myan.riger7070.workers.dev${esc(g.보낼곳)}</code></dd></div>
        <div><dt>태그</dt><dd>${g.태그수}개, 글 끝에 붙어 있음</dd></div>
      </dl>
      <button class="copy" type="button"
              data-clean="clean-${i}"
              data-plain="${평문들.push(g.마디.map(마디글).join('\n\n')) - 1}">
        <span class="copy-label">본문 전체 복사 (표와 링크까지, 사진은 빼고)</span>
      </button>
      <p class="how"><b>한 번에 다 붙여 넣으시면 됩니다.</b> 사진은 안 실립니다.
        붙여 넣으신 뒤 아래 표시된 자리에 사진만 올리세요.
        사진은 <code>blog/사진/${esc(사진폴더(i + 1, g.이름))}/</code> 폴더에 있습니다.</p>
    </header>

    ${/* ⚠️ 복사되는 것은 아래 화면이 아니라 이 숨은 덩어리다.
          화면에 보이는 쪽에는 "여기에 이 사진" 같은 안내가 붙어 있어서, 그대로
          복사하면 그 안내까지 블로그에 들어간다. 그래서 글과 표와 링크만 담은
          깨끗한 것을 따로 만들어 두고 그것을 복사한다.
          display:none 으로 숨기면 안 된다 — 안 그려진 것은 골라 담을 수 없다.
          화면 밖으로 밀어 둔다.
          ⚠️ 사진은 여기 안 넣는다. 네이버가 어차피 안 받아 주고, 폴더에 따로
             빼 두었다. 넣어 봐야 클립보드만 무거워진다. */''}
    <div class="clean" id="clean-${i}" aria-hidden="true">${
      g.마디.map((조각들) => 깨끗하게(조각들, g.이름)).join('')}</div>

    <div class="body">
      ${g.마디.map((조각들, j) => {
        const 사진 = j > 0 ? g.조각.filter((c) => c.종류 === '사진')[j - 1] : null;
        const 사진칸 = !사진 ? '' : (사진.첫째
          ? `<figure class="shot">
               <img src="${g.카드}" alt="${esc(g.제목)} 카드">
               <figcaption><b>여기에 사진 하나를 올리세요.</b>
                 폴더의 <code>${esc(사진이름들(i + 1, g.이름)[0])}</code> 입니다.</figcaption>
             </figure>`
          : `<figure class="shot real">
               <img src="${g.화면}" alt="${esc(g.둘째)}">
               <figcaption><b>여기에 사진 둘을 올리세요.</b>
                 폴더의 <code>${esc(사진이름들(i + 1, g.이름)[1])}</code>, ${esc(g.둘째)}입니다.
                 카드만 두 장이면 광고로 보입니다. 진짜 돌아가는 화면이 한 장 있어야
                 쓸 수 있는 것으로 읽힙니다.</figcaption>
             </figure>`);
        return `${사진칸}
      <section class="seg">${보이게(조각들)}
      </section>`;
      }).join('\n      ')}
    </div>
  </article>`).join('\n');

const html = `<title>블로그 붙여넣기 대장</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@400;600&display=swap">
<style>
  /* ── 색 ──
     바탕은 거의 흰 종이, 글자는 먹. 강조는 브랜드 금색 하나뿐인데, 흰 바탕에서는
     원래 값(#c9a96e)이 흐려서 한 단 낮춘 것을 쓴다. 카드 그림 자체가 금·먹이라
     페이지가 조용해야 그림이 물건처럼 도드라진다. */
  :root {
    --paper: #fbfbfa;
    --raise: #ffffff;
    --ink: #17171a;
    --dim: #62656d;
    --gold: #8a6d2f;
    --rule: rgba(23,23,26,.11);
    --hair: rgba(23,23,26,.07);
    --ok: #2f6f4f;
  }
  :root:not([data-theme="light"]) {
    @media (prefers-color-scheme: dark) {
      --paper: #121214;
      --raise: #1a1a1e;
      --ink: #e6e4df;
      --dim: #8f939c;
      --gold: #c9a96e;
      --rule: rgba(230,228,223,.14);
      --hair: rgba(230,228,223,.08);
      --ok: #6fbb92;
    }
  }
  :root[data-theme="dark"] {
    --paper: #121214;
    --raise: #1a1a1e;
    --ink: #e6e4df;
    --dim: #8f939c;
    --gold: #c9a96e;
    --rule: rgba(230,228,223,.14);
    --hair: rgba(230,228,223,.08);
    --ok: #6fbb92;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif;
    line-height: 1.7; -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 780px; margin: 0 auto; padding: 56px 22px 96px; }

  /* ── 머리 ── */
  .top { border-bottom: 1px solid var(--rule); padding-bottom: 30px; margin-bottom: 46px; }
  .kicker { font-size: .74rem; letter-spacing: .22em; color: var(--gold); font-weight: 700; }
  h1 { font-family: 'Noto Serif KR', serif; font-size: clamp(1.7rem, 4.4vw, 2.3rem);
       font-weight: 600; margin: 12px 0 10px; letter-spacing: -.01em; text-wrap: balance; }
  .lede { margin: 0; color: var(--dim); font-size: .96rem; max-width: 58ch; }

  /* ── 기호 안내 ── */
  .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
  .legend div {
    display: flex; align-items: baseline; gap: 9px; flex: 1 1 190px;
    border: 1px solid var(--hair); border-radius: 3px; padding: 11px 13px; background: var(--raise);
  }
  .legend i { font-style: normal; font-size: 1.05rem; color: var(--gold); line-height: 1; }
  .legend span { font-size: .82rem; color: var(--dim); }
  .legend b { color: var(--ink); font-weight: 500; }

  /* ── 프로필 ── */
  .profile {
    display: flex; gap: 20px; align-items: flex-start; margin-top: 34px;
    border: 1px solid var(--hair); border-radius: 4px; background: var(--raise); padding: 20px;
  }
  .profile img {
    width: 96px; height: 96px; flex: none; border-radius: 50%;
    border: 1px solid var(--hair); object-fit: cover;
  }
  .profile h3 { font-family: 'Noto Serif KR', serif; font-size: 1rem; font-weight: 600; margin: 0 0 8px; }
  .profile p { margin: 0 0 8px; font-size: .85rem; color: var(--dim); max-width: 52ch; }
  .profile p:last-child { margin-bottom: 0; }
  .profile b { color: var(--ink); font-weight: 500; }
  .profile .fine { font-size: .79rem; }
  .profile code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .76rem; color: var(--gold);
  }
  @media (max-width: 520px) { .profile { flex-direction: column; } }

  /* ── 글 하나 ── */
  .post { margin-top: 62px; }
  .post-head { margin-bottom: 22px; }
  .ord { font-size: .76rem; color: var(--dim); letter-spacing: .04em; }
  .ord span {
    display: inline-grid; place-items: center; width: 20px; height: 20px; margin-right: 7px;
    border: 1px solid var(--gold); border-radius: 50%; color: var(--gold);
    font-size: .7rem; font-weight: 700; font-variant-numeric: tabular-nums;
  }
  .post h2 {
    font-family: 'Noto Serif KR', serif; font-size: clamp(1.25rem, 3.2vw, 1.55rem);
    font-weight: 600; margin: 10px 0 14px; line-height: 1.42; text-wrap: balance;
  }
  .meta { margin: 0 0 18px; display: flex; flex-wrap: wrap; gap: 8px 28px; }
  .meta div { display: flex; align-items: baseline; gap: 9px; }
  .meta dt { font-size: .74rem; color: var(--dim); letter-spacing: .05em; }
  .meta dd { margin: 0; font-size: .82rem; }
  .meta code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: .78rem; color: var(--gold); word-break: break-all;
  }

  /* ── 복사 단추 ── */
  .copy {
    font: inherit; font-size: .88rem; font-weight: 500; cursor: pointer;
    background: var(--ink); color: var(--paper); border: 0; border-radius: 3px;
    padding: 11px 20px; transition: opacity .15s;
  }
  .copy:hover { opacity: .84; }
  .copy:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
  .copy.done { background: var(--ok); }

  /* ── 붙여 넣을 덩어리 ──
     테두리로 둘러 "여기까지가 복사되는 것" 을 눈으로 알게 한다. */
  .body {
    border: 1px solid var(--rule); border-radius: 4px; background: var(--raise);
    padding: 30px 28px; display: flex; flex-direction: column; gap: 26px;
  }
  pre.text {
    margin: 0; white-space: pre-wrap; word-break: keep-all; overflow-wrap: anywhere;
    font-family: 'Noto Serif KR', serif; font-size: .95rem; line-height: 1.95;
  }
  pre.tags {
    font-family: 'Noto Sans KR', sans-serif; font-size: .84rem; color: var(--gold);
    line-height: 1.8; padding-top: 20px; border-top: 1px solid var(--hair);
  }

  /* ── 사진 자리 ── */
  .shot { margin: 0; }
  .shot img {
    display: block; width: 100%; max-width: 380px; height: auto;
    border-radius: 3px; border: 1px solid var(--hair);
  }
  .shot figcaption { margin-top: 10px; font-size: .8rem; color: var(--dim); max-width: 52ch; }
  .shot figcaption b { color: var(--ink); font-weight: 500; }
  /* 실제 화면은 폰 캡처라 세로로 길다. 카드보다 좁게 두어 카드와 구별되게 한다. */
  .shot.real img { max-width: 280px; }

  /* ── 표 ── */
  .tbl { margin: 0; }
  .tbl .scroll { overflow-x: auto; }
  .tbl table {
    border-collapse: collapse; font-size: .87rem; width: 100%;
    font-variant-numeric: tabular-nums;
  }
  .tbl th, .tbl td {
    border: 1px solid var(--hair); padding: 8px 12px; text-align: left; vertical-align: baseline;
  }
  .tbl th[scope=row] {
    background: var(--paper); color: var(--gold); font-weight: 600;
    white-space: nowrap; width: 1%;
  }
  .tbl figcaption { margin-top: 10px; font-size: .78rem; color: var(--dim); max-width: 54ch; }
  .tbl figcaption b { color: var(--ink); font-weight: 500; }
  .copy.small { margin-top: 12px; padding: 7px 15px; font-size: .8rem; }

  /* 복사만 되고 보이지는 않는 덩어리.
     ⚠️ display:none 이나 visibility:hidden 이면 골라 담을 수 없다. 그려는 두되
        화면 밖으로 밀어 둔다. 폭을 정해 두어야 표가 한 줄로 늘어지지 않는다. */
  .clean {
    position: fixed; left: -200vw; top: 0; width: 700px;
    pointer-events: none; user-select: text;
  }
  .clean img { max-width: 100%; height: auto; }

  /* ── 맺음 ── */
  .rules { margin-top: 72px; padding-top: 30px; border-top: 1px solid var(--rule); }
  .rules h3 { font-family: 'Noto Serif KR', serif; font-size: 1.05rem; font-weight: 600; margin: 0 0 14px; }
  .rules ul { margin: 0; padding-left: 1.05em; color: var(--dim); font-size: .88rem; }
  .rules li { margin-bottom: 9px; }
  .rules b { color: var(--ink); font-weight: 500; }

  /* 사진 자리로 갈린 덩어리. 복사는 통째로 하지만, 사진을 어디에 넣을지는
     눈으로 보여야 한다. */
  .seg { margin: 0; }

  /* 복사되는 글 안의 링크. 붙여 넣으면 네이버에서도 링크로 남는다. */
  .text a, .clean a { color: var(--gold); text-underline-offset: 3px; }

  .how {
    margin: 12px 0 0; font-size: 14px; line-height: 1.7;
    color: var(--muted); max-width: 62ch;
  }
  .how b { color: var(--ink); font-weight: 600; }
  .how.fine { margin-top: 6px; font-size: 13px; }
  .how code {
    background: rgba(0,0,0,0.05); padding: 1px 5px;
    border-radius: 4px; font-size: 12px;
  }


  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="wrap">
  <header class="top">
    <div class="kicker">네이버 블로그</div>
    <h1>붙여넣기만 하시면 됩니다</h1>
    <p class="lede">단추 하나로 <b>글과 표와 링크가 한 번에</b> 복사됩니다.
      주소는 누를 수 있는 링크로 실려 가고, 사진은 빠집니다.
      붙여 넣으신 뒤 표시된 자리에 사진만 올리세요.
      사진은 글마다 <code>blog/사진/</code> 밑에 폴더로 갈라 뒀습니다.</p>
    <div class="legend">
      <div><i>◈</i><span><b>소제목</b> 문단이 바뀌는 자리</span></div>
      <div><i>※</i><span><b>주의</b> 오해하기 쉬운 대목</span></div>
      <div><i>★</i><span><b>핵심</b> 한 줄만 가져간다면</span></div>
    </div>
  </header>

  <section class="profile">
    <img src="data:image/png;base64,${b64(PROFILE)}" alt="오늘운빨 프로필 사진">
    <div>
      <h3>블로그 프로필 사진</h3>
      <p>인스타와 X 에 쓴 것과 <b>같은 그림</b>입니다. 계정마다 얼굴이 다르면
        같은 곳이라는 것을 알아보지 못합니다. 블로그에서 보고 인스타에 와도 같아야 합니다.</p>
      <p class="fine">동그랗게 잘리는 것을 셈해 글씨를 넣지 않았고, 모서리에도 아무것도 두지
        않았습니다. 1080 정사각형이라 그대로 올리시면 됩니다.
        파일은 <code>blog/profile.png</code> 에도 넣어 두었습니다.</p>
    </div>
  </section>
${본문HTML}

  <section class="rules">
    <h3>올리실 때</h3>
    <ul>
      <li><b>한 주에 하나씩.</b> 셋을 몰아 올리면 홍보 계정으로 읽힙니다.</li>
      <li><b>웹페이지 글을 그대로 옮기지 마세요.</b> 같은 글이 두 주소에 있으면
        검색이 둘 중 하나를 중복으로 보고 낮춥니다. 블로그는 왜 그런지 설명하는 글,
        페이지는 계산해 주는 도구로 나눠 두었습니다.</li>
      <li><b>한 글을 여러 블로그에 붙여 넣지 마세요.</b> 그것도 중복입니다.</li>
      <li>제목은 글 첫 줄을 그대로 쓰시면 됩니다. 태그는 본문 끝에 들어 있어
        따로 옮겨 적지 않으셔도 됩니다.</li>
      <li>검색에 잡히기까지 <b>1주에서 3주</b> 걸립니다. 다음 날 확인해 봐야 아무것도 없습니다.</li>
    </ul>
  </section>
</div>

<script>
  const 평문들 = ${JSON.stringify(평문들)};
  const 표들 = ${JSON.stringify(표들)};

  /** 글만 싣는다. 막아 둔 곳을 위해 옛 방법도 남겨 둔다. */
  async function 글복사(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch { /* 아래로 */ }
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  /**
   * 표를 클립보드에 **표로** 싣는다.
   *
   * ⚠️ 글로만 실으면 네이버에서 칸이 무너진다. 편집기 글꼴은 글자마다 폭이 달라서
   *    띄어쓰기로 맞춘 줄이 어긋난다. text/html 로 실어야 편집기가 표로 받는다.
   *    글로만 받는 곳을 위해 text/plain 도 같이 싣는다(탭으로 나눈다).
   */
  async function 표복사(rows) {
    const 안전 = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = '<table border="1" style="border-collapse:collapse">'
      + rows.map((r) => '<tr>'
        + r.map((c) => '<td style="padding:6px 10px">' + 안전(c) + '</td>').join('')
        + '</tr>').join('')
      + '</table>';
    const plain = rows.map((r) => r.join('\\t')).join('\\n');
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      return true;
    } catch {
      return 글복사(plain);
    }
  }

  /**
   * 글과 표와 사진을 **한 번에** 싣는다.
   *
   * ⚠️ 클립보드에 HTML 을 글자로 써 넣는 방법(ClipboardItem)으로는 사진이 잘 안 간다.
   *    받는 편집기가 data 주소를 그림으로 안 받아 주는 곳이 많다.
   *
   *    그래서 **사람이 드래그해서 복사하는 것과 똑같이** 한다. 숨겨 둔 덩어리를
   *    골라 담고 복사 명령을 준다. 브라우저가 만들어 주는 클립보드라 표도 사진도
   *    사람이 직접 복사했을 때와 같은 것이 실린다.
   *
   * 안 되면 글만이라도 실어 준다. 아무것도 안 되는 것보다 낫다.
   */
  function 통째로복사(el, 글) {
    const sel = window.getSelection();
    const 되돌릴것 = sel.rangeCount ? sel.getRangeAt(0) : null;
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand('copy');
      sel.removeAllRanges();
      if (되돌릴것) sel.addRange(되돌릴것);
      if (ok) return true;
    } catch { /* 아래로 */ }
    return 글복사(글);
  }

  for (const btn of document.querySelectorAll('.copy')) {
    const 원래글 = btn.querySelector('.copy-label').textContent;
    btn.addEventListener('click', async () => {
      const 표번호 = btn.dataset.table;
      const ok = 표번호 !== undefined
        ? await 표복사(표들[+표번호])
        : 통째로복사(document.getElementById(btn.dataset.clean), 평문들[+btn.dataset.plain]);
      const label = btn.querySelector('.copy-label');
      label.textContent = ok ? '복사했습니다' : '복사가 막혔어요. 직접 긁어 주세요';
      btn.classList.toggle('done', ok);
      setTimeout(() => { label.textContent = 원래글; btn.classList.remove('done'); }, 2600);
    });
  }
</script>
`;

writeFileSync(OUT, html);
console.log(`blog/blog-page.html  ${(html.length / 1024).toFixed(0)}KB  (글 ${글들.length}편)`);
