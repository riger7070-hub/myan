// 아침에 저절로 열리는 **홍보 대장**을 짓는다.
//
//   npm run promo        →  promo/promo-page.html
//
// 왜 있는가: 원고는 이미 다 써 뒀는데(docs/홍보.md) 올리는 걸 잊는다. 잊지 않게
// 하는 물건이 없어서 만든다. 날마다 08:30 에 작업 스케줄러가 이걸 짓고 브라우저로
// 연다 — 사장님은 명령어를 치지 않는다.
//
// ⚠️ **날마다 같은 커뮤니티에 올리라고 하지 않는다.** 커뮤니티 글은 한 곳에 한 번이다.
//    docs/홍보.md 가 첫 줄부터 그렇게 못 박아 뒀고("같은 글을 복사해 열 군데 돌리는
//    것이 가장 빨리 망하는 길"), 사주 앱은 한 번 스팸으로 찍히면 되돌리기 어렵다.
//    그래서 날마다 서는 것은 **내 채널(인스타·스레드·X)** 이고, 커뮤니티는 남은
//    목록에서 **하루 한 곳씩 줄어들 뿐**이다. 다 비면 커뮤니티 칸은 사라진다.
//
// ⚠️ 어디까지 했는지는 promo/기록.md 한 곳에만 있다. 여기에 따로 적어 두면
//    두 곳이 어긋나고, 어긋난 날부터 이미 올린 곳을 또 올리라고 시킨다.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRanking } from './lib/tti.mjs';
import { 오늘글 } from './lib/post-text.mjs';
import { 기록읽기, 대목나누기, 대목찾기 as 대목에서찾기 } from './lib/promo-record.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'promo', 'promo-page.html');

const 오늘 = new Date();
const 오늘YMD = [오늘.getFullYear(),
  String(오늘.getMonth() + 1).padStart(2, '0'),
  String(오늘.getDate()).padStart(2, '0')].join('-');

// ── 기록 읽기 ────────────────────────────────────────────────────────────────
//
// 읽는 규칙은 lib/promo-record.mjs 에 있다. 이 파일은 첫 줄부터 살아 있는 /tti 를
// 부르므로 통째로는 시험에 걸 수 없다 — 규칙만 따로 두면 인터넷 없이도 시험한다.
const 묶음 = 기록읽기(readFileSync(join(ROOT, 'promo', '기록.md'), 'utf8'));
const 이상한줄 = 묶음.이상한줄;

const 남은커뮤니티 = 묶음.한번.filter((x) => !x.올림);
const 오늘의커뮤니티 = 남은커뮤니티[0] || null;

// ── 오늘의 원고 ──────────────────────────────────────────────────────────────
//
// ⚠️ /tti 를 못 읽어도 페이지는 서야 한다. 아침 8시 반에 인터넷이 잠깐 끊겼다고
//    해서 "오늘 뭘 올려야 하나" 까지 같이 사라지면 안 된다 — 커뮤니티 칸은
//    인터넷 없이도 멀쩡히 쓸 수 있다.
let 원고 = null;
let 원고못한이유 = '';
try {
  원고 = 오늘글(await fetchRanking());
} catch (e) {
  원고못한이유 = e.message;
}

// ── 홍보.md 의 해당 대목 ─────────────────────────────────────────────────────
//
// 원고를 여기 옮겨 적지 않는다. 옮겨 적으면 홍보.md 를 고친 날부터 둘이 갈린다.
// `### ` 로 잘라서 그 대목을 통째로 접어 둔다 — 파싱이 정교할수록 잘 깨진다.
const 대목 = 대목나누기(readFileSync(join(ROOT, 'docs', '홍보.md'), 'utf8'));
const 대목찾기 = (이름) => 대목에서찾기(대목, 이름);

// ── HTML ─────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const 평문들 = [];
/** 복사 단추 하나. 담을 글은 평문들에 실어 보내고 번호만 남긴다. */
const 복사단추 = (글, 이름) =>
  `<button class="copy" type="button" data-plain="${평문들.push(글) - 1}">`
  + `<span class="copy-label">${esc(이름)}</span></button>`;

const 카드 = (것) => {
  const 대 = 대목찾기(것.이름);
  return `
  <li class="place">
    <div class="place-head">
      <a class="place-name" href="${esc(것.주소)}" target="_blank" rel="noreferrer">${esc(것.이름)}</a>
      ${것.말 ? `<span class="note">${esc(것.말)}</span>` : ''}
    </div>
    ${대 ? `<details><summary>원고 보기 — 홍보.md 「${esc(대.제목)}」</summary><pre>${esc(대.몸)}</pre></details>` : ''}
  </li>`;
};

const 오늘칸 = () => {
  if (오늘의커뮤니티) {
    const 대 = 대목찾기(오늘의커뮤니티.이름);
    return `
    <div class="today">
      <p class="today-lead">오늘 커뮤니티는 <strong>${esc(오늘의커뮤니티.이름)}</strong> 한 곳입니다.</p>
      ${오늘의커뮤니티.말 ? `<p class="today-block">${esc(오늘의커뮤니티.말)}</p>` : ''}
      <p class="today-go"><a href="${esc(오늘의커뮤니티.주소)}" target="_blank" rel="noreferrer">${esc(오늘의커뮤니티.주소)}</a></p>
      ${대 ? `<details open><summary>원고 — 홍보.md 「${esc(대.제목)}」</summary><pre>${esc(대.몸)}</pre></details>` : ''}
      <p class="today-after">올리고 나면 저한테 "<b>${esc(오늘의커뮤니티.이름)} 올렸다</b>" 고만 말씀해 주세요. 기록은 제가 적습니다.</p>
    </div>`;
  }
  return `
    <div class="today done">
      <p class="today-lead">커뮤니티는 <strong>다 돌았습니다.</strong></p>
      <p class="today-block">한 곳에 한 번이라, 여기서 더 올릴 곳은 없습니다.
      새로 올릴 데를 찾으면 <code>promo/기록.md</code> 에 한 줄 더하면 됩니다.</p>
    </div>`;
};

const 원고칸 = () => {
  if (!원고) {
    return `<div class="warn">
      <p><strong>오늘 순위를 못 받았습니다.</strong> 인터넷이 끊겼거나 사이트가 잠깐 안 열린 것입니다.</p>
      <p class="mono">${esc(원고못한이유)}</p>
      <p>순위 글은 <b>손으로 쓰지 마세요.</b> 어제 1위가 그대로 남는데 그림에는
      오늘 1위가 박혀 있어서, 글과 그림이 서로 다른 띠를 말한 채로 나갑니다.
      인터넷이 돌아온 뒤 다시 열면 됩니다.</p>
    </div>`;
  }
  const 넘침 = 원고.길이 > 280;
  return `
    <div class="draft">
      <h3>인스타그램</h3>
      <p class="hint">본문 링크는 눌리지 않습니다 — 프로필 링크로 보냅니다.
      그림은 <code>${esc(원고.카드)}</code></p>
      <pre class="body">${esc(원고.인스타)}</pre>
      ${복사단추(원고.인스타, '인스타 글 복사')}
    </div>
    <div class="draft">
      <h3>스레드 · X</h3>
      <p class="hint">본문 링크가 눌리고 미리보기 카드까지 뜹니다.
      <b>그림은 붙이지 마세요</b> — 붙이면 미리보기 카드가 사라집니다(둘 중 하나만 뜹니다).</p>
      <pre class="body">${esc(원고.x)}</pre>
      ${복사단추(원고.x, '스레드·X 글 복사')}
      <p class="hint ${넘침 ? 'bad' : ''}">길이 ${원고.길이}/280${
        원고.뺀줄 ? ` · 들어가느라 까닭 ${원고.뺀줄}줄을 뺐습니다(인스타 쪽엔 그대로 있습니다)` : ''
      }${넘침 ? ' · ⚠️ 다 빼도 넘칩니다. 손으로 줄여 주세요' : ''}</p>
    </div>
    <p class="check">그림에 박힌 1위는 <b>${esc(원고.으뜸.name)}</b> 입니다. 글과 같은지 한 번만 봐 주세요.</p>`;
};

const html = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>홍보 대장</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&family=Noto+Serif+KR:wght@600&display=swap">
<style>
  :root {
    --paper: #fbfbfa; --raise: #ffffff; --ink: #17171a; --dim: #62656d;
    --gold: #8a6d2f; --rule: rgba(23,23,26,.11); --hair: rgba(23,23,26,.07);
    --ok: #2f6f4f; --bad: #a4462f;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #14141a; --raise: #1c1c23; --ink: #ececf0; --dim: #9a9aa4;
      --gold: #c9a96e; --rule: rgba(236,236,240,.14); --hair: rgba(236,236,240,.08);
      --ok: #6fbb92; --bad: #e28b74;
    }
  }
  :root[data-theme="dark"] {
    --paper: #14141a; --raise: #1c1c23; --ink: #ececf0; --dim: #9a9aa4;
    --gold: #c9a96e; --rule: rgba(236,236,240,.14); --hair: rgba(236,236,240,.08);
    --ok: #6fbb92; --bad: #e28b74;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 20px 96px; background: var(--paper); color: var(--ink);
    font-family: 'Noto Sans KR', -apple-system, 'Malgun Gothic', sans-serif;
    line-height: 1.75; font-size: 15px;
  }
  main { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 34px; }
  .kicker { font-size: .74rem; letter-spacing: .22em; color: var(--gold); font-weight: 700; margin: 0; }
  h1 { font-family: 'Noto Serif KR', serif; font-size: clamp(1.6rem, 4vw, 2.1rem);
       margin: 6px 0 0; text-wrap: balance; }
  .date { color: var(--dim); font-size: .86rem; margin: 4px 0 0; }
  h2 { font-family: 'Noto Serif KR', serif; font-size: 1.1rem; margin: 0 0 14px;
       padding-bottom: 8px; border-bottom: 1px solid var(--rule); }
  h3 { font-size: .95rem; margin: 0 0 6px; }
  section { background: var(--raise); border: 1px solid var(--hair); border-radius: 14px; padding: 22px 24px; }
  .today { border-left: 3px solid var(--gold); padding-left: 16px; }
  .today.done { border-left-color: var(--ok); }
  .today-lead { margin: 0 0 8px; font-size: 1.05rem; }
  .today-block, .today-go, .today-after { margin: 0 0 8px; color: var(--dim); font-size: .9rem; }
  .today-after { margin-top: 12px; color: var(--ink); }
  a { color: var(--gold); }
  ul.places { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  .place { border-bottom: 1px solid var(--hair); padding-bottom: 12px; }
  .place:last-child { border-bottom: 0; padding-bottom: 0; }
  .place-head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
  .place-name { font-weight: 600; text-decoration: none; }
  .note { color: var(--dim); font-size: .84rem; }
  .draft { margin-bottom: 22px; }
  .hint { color: var(--dim); font-size: .84rem; margin: 0 0 8px; }
  .hint.bad { color: var(--bad); font-weight: 600; }
  pre {
    background: var(--paper); border: 1px solid var(--hair); border-radius: 10px;
    padding: 14px 16px; margin: 0 0 12px; overflow-x: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .84rem; line-height: 1.7;
  }
  pre.body { font-family: inherit; font-size: .93rem; line-height: 1.85; white-space: pre-wrap; }
  .copy {
    border: 0; border-radius: 999px; background: var(--gold); color: var(--paper);
    font: inherit; font-weight: 600; font-size: .85rem; padding: 9px 20px; cursor: pointer;
  }
  .copy:hover { opacity: .84; }
  .copy:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
  .copy.done { background: var(--ok); }
  details { margin-top: 8px; }
  summary { cursor: pointer; color: var(--dim); font-size: .84rem; }
  .warn { border-left: 3px solid var(--bad); padding-left: 16px; }
  .warn p { margin: 0 0 8px; }
  .mono { font-family: ui-monospace, monospace; font-size: .82rem; color: var(--dim); }
  .check { color: var(--dim); font-size: .86rem; margin: 0; }
  .done-list { color: var(--dim); font-size: .86rem; margin: 14px 0 0; }
  code { font-family: ui-monospace, monospace; font-size: .88em; }
  footer { max-width: 720px; margin: 40px auto 0; color: var(--dim); font-size: .82rem; }
</style>

<main>
  <header>
    <p class="kicker">M;Y 安</p>
    <h1>홍보 대장</h1>
    <p class="date">${오늘YMD} · 날마다 아침 8시 30분에 저절로 열립니다</p>
  </header>

  <section>
    <h2>오늘</h2>
    ${오늘칸()}
  </section>

  <section>
    <h2>날마다 — 인스타 · 스레드 · X</h2>
    ${원고칸()}
  </section>

  ${남은커뮤니티.length ? `
  <section>
    <h2>한 번만 올리는 곳 — ${남은커뮤니티.length}곳 남았습니다</h2>
    <p class="hint">한 곳에 한 번입니다. 날마다 같은 곳에 올리면 대부분 밴이고,
    사주 앱은 한 번 스팸으로 찍히면 되돌리기 어렵습니다.</p>
    <ul class="places">${남은커뮤니티.map(카드).join('')}</ul>
  </section>` : ''}

  ${묶음.한번.some((x) => x.올림) || 묶음.날마다.some((x) => x.올림) ? `
  <section>
    <h2>이미 올린 곳</h2>
    <p class="done-list">${[...묶음.한번, ...묶음.날마다].filter((x) => x.올림)
      .map((x) => `${esc(x.날)} ${esc(x.이름)}`).join(' · ')}</p>
  </section>` : ''}

  ${이상한줄.length ? `
  <section>
    <h2>⚠️ 읽지 못한 줄</h2>
    <p class="hint">promo/기록.md 의 아래 줄은 모양이 달라 건너뛰었습니다.
    그 곳은 이 대장에 나오지 않습니다.</p>
    <pre>${이상한줄.map(esc).join('\n')}</pre>
  </section>` : ''}
</main>

<footer>
  원고는 <code>docs/홍보.md</code>, 어디까지 했는지는 <code>promo/기록.md</code> 에 있습니다.
  이 페이지는 <code>npm run promo</code> 가 그 둘을 읽어서 다시 짓습니다 — 여기를 고쳐도 남지 않습니다.
</footer>

<script>
  const 평문들 = ${JSON.stringify(평문들)};

  async function 글복사(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch { /* 아래로 */ }
    // file:// 에서는 위쪽이 막히는 브라우저가 있다. 옛 방법을 남겨 둔다.
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  for (const btn of document.querySelectorAll('.copy')) {
    const 원래글 = btn.querySelector('.copy-label').textContent;
    btn.addEventListener('click', async () => {
      const ok = await 글복사(평문들[+btn.dataset.plain]);
      const label = btn.querySelector('.copy-label');
      label.textContent = ok ? '복사했습니다' : '복사가 막혔어요. 직접 긁어 주세요';
      btn.classList.toggle('done', ok);
      setTimeout(() => { label.textContent = 원래글; btn.classList.remove('done'); }, 2600);
    });
  }
</script>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);

const 말 = 오늘의커뮤니티 ? `오늘 커뮤니티: ${오늘의커뮤니티.이름}` : '커뮤니티는 다 돌았다';
console.log(`promo/promo-page.html  ${(html.length / 1024).toFixed(0)}KB  · ${말}`
  + ` · 원고 ${원고 ? '실었다' : '못 받았다'}`
  + (이상한줄.length ? ` · ⚠️ 읽지 못한 줄 ${이상한줄.length}개` : ''));
