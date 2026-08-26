// 미니앱(mini/src)에서 죽은 것을 찾는다.
//
//   npm run dead:mini
//
// 웹(js/*.js)은 <script> 로 전역에 쏟아 놓는 구조라 tools/find-dead.mjs 로 충분하지만,
// 미니앱은 ES 모듈이라 죽는 모양이 다르다. 여기서 보는 것은 넷이다.
//
//   1. 안 쓰는 export   — 내보내 놓고 아무도 import 하지 않는다
//   2. 안 쓰는 import   — 들여왔는데 파일 안에서 안 쓴다 (번들에 그대로 실린다)
//   3. 안 부르는 함수   — 들여쓴 것까지 본다. main.js 는 대부분이 모듈 안쪽이다
//   4. 안 쓰는 아이콘   — icons.js 의 그림 조각
//
// ⚠️ 아이콘과 콘텐츠는 이름을 문자열로 찾아 쓴다(icon('compat')). 그래서 이름이
//    **문자열 안에** 있는지까지 세야 한다. 식별자만 세면 전부 죽었다고 나온다.
//
// ⚠️ mini/src/icons.js 는 미니앱만의 것이 아니다. 이것이 **원본**이고 웹의
//    js/icons.js 가 tools/build-web-icons.mjs 로 여기서 만들어진다. 그래서
//    아이콘이 살았는지는 **저장소 전체**에서 세야 한다. 처음에 mini/src 안에서만
//    셌더니 quickFortune·chart·trophy·coin·chat·eye 따위 아홉 개를 죽었다고 했는데,
//    전부 웹이 쓰고 있었다 — 그대로 지웠으면 웹이 깨졌다.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mini', 'src');

const FILES = readdirSync(SRC).filter((f) => f.endsWith('.js'));
const TEXT = new Map(FILES.map((f) => [f, readFileSync(join(SRC, f), 'utf8')]));

// 미니앱 바깥에서도 쓸 수 있다(테스트가 import 한다). 그쪽도 함께 센다.
function readAll(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.tmp', '.wrangler'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) readAll(p, out);
    else if (/\.(js|mjs|html)$/.test(e.name)) out.push(readFileSync(p, 'utf8'));
  }
  return out;
}
const OUTSIDE = readAll(join(ROOT, 'test')).concat(readAll(join(ROOT, 'tools'))).join('\n');
const ALL = [...TEXT.values()].join('\n') + '\n' + OUTSIDE;

// 아이콘은 저장소 전체에서 센다(위 ⚠️ 참고). 웹이 쓰는 것을 죽었다고 하면 안 된다.
const REPO = readAll(ROOT).join('\n');

function count(hay, name) {
  let n = 0, i = 0;
  const word = (c) => c !== undefined && /[A-Za-z0-9_$]/.test(c);
  for (;;) {
    i = hay.indexOf(name, i);
    if (i < 0) break;
    if (!word(hay[i - 1]) && !word(hay[i + name.length])) n++;
    i += name.length;
  }
  return n;
}

export function findMiniDead(root = ROOT) {
  void root;
  const dead = { exports: [], imports: [], funcs: [], icons: [] };

  for (const [f, src] of TEXT) {
    const lineOf = (i) => src.slice(0, i).split('\n').length;

    // 1. 안 쓰는 export
    for (const m of src.matchAll(/^export (?:async )?(?:function|const|let) (\w+)/gm)) {
      if (count(ALL, m[1]) <= 1) dead.exports.push(`${f}:${lineOf(m.index)}  ${m[1]}`);
    }

    // 2. 안 쓰는 import — 중괄호 안의 이름을 하나씩 본다
    for (const m of src.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)/gm)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/).pop().trim();
        if (!name) continue;
        // 이 파일 안에서 import 줄 말고 다른 데 나오는지
        const body = src.slice(0, m.index) + src.slice(m.index + m[0].length);
        if (count(body, name) === 0) dead.imports.push(`${f}:${lineOf(m.index)}  ${name} (${m[2]})`);
      }
    }

    // 3. 안 부르는 함수 — 들여쓴 것까지. 객체 메서드(foo() {)는 제외한다.
    for (const m of src.matchAll(/^\s*(?:async )?function (\w+)/gm)) {
      if (count(ALL, m[1]) <= 1) dead.funcs.push(`${f}:${lineOf(m.index)}  ${m[1]}`);
    }
  }

  // 4. 안 쓰는 아이콘. icon('이름') 처럼 문자열로 찾으므로 문자열째로 센다.
  const icons = TEXT.get('icons.js') || '';
  const start = icons.search(/^(?:export )?const ICONS\s*=/m);
  if (start >= 0) {
    for (const m of icons.slice(start).matchAll(/^  (\w+):/gm)) {
      const name = m[1];
      // 자기 정의 한 줄 말고, 어디서든 'name' 이나 "name" 으로 불리는지.
      // 웹(js/icons.js)에도 같은 이름이 생성되어 있으므로 그 정의 줄은 빼고 센다.
      const hay = REPO.split('\n')
        .filter((l) => !/^\s{2}\w+: S\(/.test(l))
        .join('\n');
      const used = count(hay, `'${name}'`) + count(hay, `"${name}"`) + count(hay, '`' + name + '`');
      if (used === 0) dead.icons.push(name);
    }
  }
  return dead;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('find-dead-mini.mjs')) {
  const d = findMiniDead();
  const show = (t, xs) => console.log(`\n${t}: ${xs.length ? '\n  ' + xs.join('\n  ') : '없음'}`);
  console.log(`mini/src 파일 ${FILES.length}개`);
  show('안 쓰는 export', d.exports);
  show('안 쓰는 import', d.imports);
  show('안 부르는 함수', d.funcs);
  show('안 쓰는 아이콘', d.icons);
}
