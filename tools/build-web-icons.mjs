// mini/src/icons.js → js/icons.js
//
// 아이콘을 두 벌 관리하면 반드시 어긋난다. 원본은 미니앱 쪽 하나로 두고,
// 웹에서 쓰는 고전 스크립트(모듈이 아님)를 여기서 만들어 낸다.
//
//   node tools/build-web-icons.mjs
//
// icons.js 를 고쳤으면 이걸 다시 돌리고 함께 커밋할 것.
// test/web-icons-sync.test.mjs 가 두 파일이 어긋나면 잡아 준다.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'mini', 'src', 'icons.js'), 'utf8');

const body = src
  .replace(/^\/\/[^\n]*\n(?:\/\/[^\n]*\n)*/, '')          // 맨 위 설명 주석은 아래에서 새로 쓴다
  .replace(/\bexport const\b/g, 'const')
  .trimStart();

const out = `// 콘텐츠 아이콘 — 자동 생성 파일. 직접 고치지 말 것.
//
// 원본은 mini/src/icons.js 다. 고쳤으면 아래를 돌려 다시 만들고 함께 커밋한다.
//   node tools/build-web-icons.mjs
//
// 웹은 <script src> 로 읽는 고전 스크립트라 import/export 를 쓸 수 없다.
// 그래서 같은 내용을 전역으로 노출한다.

${body}
// 전역으로 내보낸다(app.js 가 icon() 을 그대로 부른다).
window.ICONS = ICONS;
window.icon = icon;

// HTML 에 직접 박아 둔 자리도 채운다: <span data-icon="secGift"></span>
// JS 로 그리는 목록과 달리 index.html 에 고정된 아이콘들이 여기 해당한다.
window.paintIcons = function (root) {
  (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
    if (el.firstElementChild) return;               // 이미 채웠으면 그대로 둔다
    el.innerHTML = icon(el.getAttribute('data-icon'));
  });
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { window.paintIcons(); });
} else {
  window.paintIcons();
}
`;

writeFileSync(join(ROOT, 'js', 'icons.js'), out);
console.log('js/icons.js 생성:', Object.keys(src.match(/^\s{2}[a-zA-Z]+:/gm) || []).length || '', '항목');
