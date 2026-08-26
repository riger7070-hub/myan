// 선언해 놓고 아무 데서도 안 쓰는 최상위 이름을 찾는다.
//
//   npm run dead
//
// 세는 법은 일부러 무디게 잡았다. 문자열 안이든 주석 안이든 이름이 보이기만 하면
// "쓰인다"고 친다. 그래서 여기 걸린 것은 정말 안 쓰이는 것이고, 반대로 여기를
// 통과했다고 다 살아 있는 것은 아니다 — 놓치는 쪽이 잘못 지우는 쪽보다 낫다.
//
// ⚠️ 세는 쪽(ALL)에서 한 폴더라도 빠지면 살아 있는 것을 죽었다고 한다. 실제로 두 번 당했다.
//      · index.html 을 빼먹었더니 onclick="openDrawer()" 로만 불리는 함수 30개가 걸렸다
//      · js/modules/ 를 빼먹었더니 거기서만 쓰는 이름이 걸렸다
//    그래서 목록을 손으로 적지 않고 저장소를 통째로 훑는다.
//
// ⚠️ 번역 키(t.xxx)와 CSS 클래스는 일부러 안 본다. t['takilP_' + p] 처럼
//    이름을 이어 붙여 읽는 자리가 있어서, 세는 것만으로는 죽었는지 알 수 없다.
//
// ⚠️ 이름은 ASCII 만 본다(\w). 이 저장소의 식별자는 전부 ASCII 이고 한글은
//    문자열과 주석에만 있어서 문제되지 않지만, 한글로 이름 지은 함수는 못 잡는다.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..');

// 남이 만든 것과 만들어진 것은 보지 않는다.
const SKIP = new Set(['node_modules', '.git', 'dist', '.wrangler', '.tmp', 'insta', 'coverage']);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

// 앞뒤가 식별자 글자가 아닌 자리만 센다. sub 를 세면서 subtitle 까지 세면 안 된다.
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

// 최상위 선언만 본다. 안쪽 것은 스코프가 좁아 얻는 게 적고 오판이 잦다.
const DECL = /^(?:export )?(?:async )?function (\w+)|^(?:export )?const (\w+)\s*=|^(?:export )?let (\w+)\s*=/gm;

export function findDead(root = ROOT) {
  const files = walk(root);
  const text = files.map((f) => [f, readFileSync(f, 'utf8')]);
  const all = text.map(([, s]) => s).join('\n');

  const dead = [];
  for (const [f, src] of text) {
    // 도구와 테스트는 스스로가 끝이라 "안 쓰인다"가 정상이다.
    if (/[\\/](test|tools)[\\/]/.test(f)) continue;
    DECL.lastIndex = 0;
    let m;
    while ((m = DECL.exec(src))) {
      const name = m[1] || m[2] || m[3];
      if (!name || name.length < 2) continue;
      if (count(all, name) <= 1) {
        dead.push({
          file: relative(root, f).replace(/\\/g, '/'),
          line: src.slice(0, m.index).split('\n').length,
          name,
        });
      }
    }
  }
  return { files: files.length, dead };
}

// 겹치는 전역 선언. 브라우저는 전역이 한 그릇이라 나중에 실린 쪽이 앞의 것을
// **조용히** 덮는다 — 오류가 안 나서 눈으로는 못 찾는다.
const LOAD_ORDER = [
  'js/modules/performance.js', 'js/modules/analytics.js', 'js/modules/notifications.js',
  'js/icons.js', 'js/constants.js', 'js/locales.js', 'js/saju-engine.js',
  'js/effect.js', 'js/fortunes.js', 'js/onboarding.js', 'js/app.js',
];
const TOP = /^(?:async )?function (\w+)|^(?:const|let|var) (\w+)\s*=/gm;

export function findShadowed(root = ROOT) {
  const seen = new Map();
  for (const f of LOAD_ORDER) {
    const src = readFileSync(join(root, f), 'utf8');
    TOP.lastIndex = 0;
    let m;
    while ((m = TOP.exec(src))) {
      const name = m[1] || m[2];
      if (!seen.has(name)) seen.set(name, []);
      seen.get(name).push(`${f}:${src.slice(0, m.index).split('\n').length}`);
    }
  }
  return [...seen].filter(([, at]) => at.length > 1).map(([name, at]) => ({ name, at }));
}

// 직접 실행했을 때만 찍는다.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const { files, dead } = findDead();
  console.log(`훑은 파일 ${files}개`);
  console.log(dead.length
    ? dead.map((d) => `  ${d.file}:${d.line}  ${d.name}`).join('\n')
    : '  안 쓰는 최상위 선언 없음');

  const dup = findShadowed();
  console.log(dup.length
    ? '\n겹치는 전역 선언 (뒤엣것이 이긴다)\n' + dup.map((d) => `  ${d.name}\n    ${d.at.join('\n    ')}`).join('\n')
    : '\n겹치는 전역 선언 없음');
}
