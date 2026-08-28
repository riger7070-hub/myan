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

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'blog', 'blog-page.html');

// 올리는 순서대로. 사진 둘째 자리는 직접 캡처하는 자리라 비워 둔다.
const POSTS = [
  { file: '손없는날.txt', card: 'sonnal.png',
    보낼곳: '/calc/sonnal', 둘째: '손 없는 날 페이지를 열어 아무 달이나 계산한 화면' },
  { file: '띠궁합.txt', card: 'gunghap.png',
    보낼곳: '/gunghap', 둘째: '띠 궁합표 페이지를 연 화면' },
  { file: '만세력.txt', card: 'manseryeok.png',
    보낼곳: '/calc/manseryeok', 둘째: '만세력에 아무 날짜나 넣어 본 결과 화면' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');

/**
 * 글 한 편을 화면에 올릴 조각으로 바꾼다.
 *
 * 첫 줄은 제목, 마지막 줄은 태그다. 그 사이가 본문이고, 본문 안의 "사진 넣는 자리"
 * 줄은 사진으로 바꿔 끼운다.
 */
function 조각내기(text, post) {
  const lines = text.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const 제목 = lines[0].trim();
  const 태그 = lines[lines.length - 1].trim();
  const 본문 = lines.slice(1, -1);

  const out = [];
  let 묶음 = [];
  const 쏟기 = () => {
    const t = 묶음.join('\n').trim();
    if (t) out.push({ 종류: '글', 값: t });
    묶음 = [];
  };

  for (const line of 본문) {
    const m = /^사진 넣는 자리 (하나|둘)$/.exec(line.trim());
    if (!m) { 묶음.push(line); continue; }
    쏟기();
    out.push({ 종류: '사진', 첫째: m[1] === '하나' });
  }
  쏟기();
  return { 제목, 태그, 조각: out, 태그수: (태그.match(/#/g) || []).length };
}

const 글들 = POSTS.map((p) => ({
  ...p,
  ...조각내기(readFileSync(join(ROOT, 'blog', p.file), 'utf8'), p),
  원문: readFileSync(join(ROOT, 'blog', p.file), 'utf8').replace(/\r\n/g, '\n').trimEnd(),
  이미지: 'data:image/png;base64,' + b64(join('insta', p.card)),
}));

const 본문HTML = 글들.map((g, i) => `
  <article class="post" id="post-${i + 1}">
    <header class="post-head">
      <div class="ord"><span>${i + 1}</span>번째로 올릴 글</div>
      <h2>${esc(g.제목)}</h2>
      <dl class="meta">
        <div><dt>보내는 곳</dt><dd><code>myan.riger7070.workers.dev${esc(g.보낼곳)}</code></dd></div>
        <div><dt>태그</dt><dd>${g.태그수}개, 글 끝에 붙어 있음</dd></div>
      </dl>
      <button class="copy" type="button" data-post="${i}">
        <span class="copy-label">본문 전체 복사</span>
      </button>
    </header>

    <div class="body">
      ${g.조각.map((c) => c.종류 === '글'
        ? `<pre class="text">${esc(c.값)}</pre>`
        : c.첫째
          ? `<figure class="shot">
               <img src="${g.이미지}" alt="${esc(g.제목)} 홍보 카드">
               <figcaption><b>여기에 이 사진.</b> 오른쪽 눌러 이미지 복사하신 뒤 편집기에 붙이시면 됩니다.</figcaption>
             </figure>`
          : `<figure class="shot empty">
               <div class="ph">직접 캡처해서 넣는 자리</div>
               <figcaption><b>${esc(g.둘째)}</b>를 찍어서 넣으세요.
                 카드만 두 장이면 광고로 보입니다. 실제 화면이 한 장 있어야 쓸 수 있는 것으로 읽힙니다.</figcaption>
             </figure>`).join('\n      ')}
      <pre class="text tags">${esc(g.태그)}</pre>
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
  .shot.empty .ph {
    display: grid; place-items: center; max-width: 380px; aspect-ratio: 4 / 5;
    border: 1px dashed var(--rule); border-radius: 3px;
    color: var(--dim); font-size: .84rem;
  }

  /* ── 맺음 ── */
  .rules { margin-top: 72px; padding-top: 30px; border-top: 1px solid var(--rule); }
  .rules h3 { font-family: 'Noto Serif KR', serif; font-size: 1.05rem; font-weight: 600; margin: 0 0 14px; }
  .rules ul { margin: 0; padding-left: 1.05em; color: var(--dim); font-size: .88rem; }
  .rules li { margin-bottom: 9px; }
  .rules b { color: var(--ink); font-weight: 500; }

  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="wrap">
  <header class="top">
    <div class="kicker">네이버 블로그</div>
    <h1>글과 사진을 한자리에 두었습니다</h1>
    <p class="lede">테두리 안이 통째로 붙여 넣을 것입니다. 사진은 들어갈 자리에 그대로 앉혀 두었으니,
      오른쪽 눌러 이미지를 복사해 편집기에 붙이시면 됩니다.</p>
    <div class="legend">
      <div><i>◈</i><span><b>소제목</b> 문단이 바뀌는 자리</span></div>
      <div><i>※</i><span><b>주의</b> 오해하기 쉬운 대목</span></div>
      <div><i>★</i><span><b>핵심</b> 한 줄만 가져간다면</span></div>
    </div>
  </header>
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
  const 원문 = ${JSON.stringify(글들.map((g) => g.원문))};
  for (const btn of document.querySelectorAll('.copy')) {
    btn.addEventListener('click', async () => {
      const t = 원문[+btn.dataset.post];
      let ok = false;
      try { await navigator.clipboard.writeText(t); ok = true; } catch { /* 아래로 */ }
      if (!ok) {
        // 클립보드를 막아 둔 곳이 있다. 옛 방법으로 한 번 더 해 본다.
        const ta = document.createElement('textarea');
        ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
      }
      const label = btn.querySelector('.copy-label');
      label.textContent = ok ? '복사했습니다' : '복사가 막혔어요. 글을 직접 긁어 주세요';
      btn.classList.toggle('done', ok);
      setTimeout(() => { label.textContent = '본문 전체 복사'; btn.classList.remove('done'); }, 2600);
    });
  }
</script>
`;

writeFileSync(OUT, html);
console.log(`blog/blog-page.html  ${(html.length / 1024).toFixed(0)}KB  (글 ${글들.length}편)`);
