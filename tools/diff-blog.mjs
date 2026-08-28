// 윤문 전후로 얼마나 바뀌었는지 잰다.
//
//   node tools/diff-blog.mjs
//
// ⚠️ 왜 재는가: 규칙집이 변경률 10~25% 를 권하고 30% 넘으면 과윤문, 50% 넘으면
//    중단하라고 못박아 뒀다. 많이 고칠수록 좋은 글이 되는 게 아니다. 많이 고치면
//    원래 하려던 말이 사라진다. 그래서 스스로 재고, 넘으면 알린다.
//
//    레벤슈타인 거리를 원문 길이로 나눈다.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'blog');
const 전 = join(DIR, 'before');

if (!existsSync(전)) {
  console.error('blog/before 가 없다. 견줄 원본이 있어야 한다.');
  process.exit(1);
}

// 레벤슈타인 거리. 두 줄만 들고 돌린다.
function 거리(a, b) {
  let 앞 = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const 이번 = [i];
    for (let j = 1; j <= b.length; j++) {
      이번[j] = a[i - 1] === b[j - 1]
        ? 앞[j - 1]
        : 1 + Math.min(앞[j - 1], 앞[j], 이번[j - 1]);
    }
    앞 = 이번;
  }
  return 앞[b.length];
}

// 표와 태그는 손대지 않기로 했다. 정말 그런지도 같이 본다.
const 표와태그 = (s) =>
  s.split('\n').filter((l) => /^\s{2,}\S/.test(l) || l.trim().startsWith('#')).join('\n');

let 탈 = 0;
for (const f of readdirSync(전).filter((x) => x.endsWith('.txt'))) {
  const a = readFileSync(join(전, f), 'utf8');
  const b = readFileSync(join(DIR, f), 'utf8');
  const 율 = 거리(a, b) / a.length * 100;
  const 표같나 = 표와태그(a) === 표와태그(b);

  let 판정 = '알맞다';
  if (율 > 50) { 판정 = '✖ 과윤문 (중단선 넘음)'; 탈++; }
  else if (율 > 30) { 판정 = '✖ 과윤문 경고'; 탈++; }
  // ⚠️ 적게 고친 것 자체는 흠이 아니다. 규칙집이 "탐지 없는 구간을 건드리지
  //    않는다"고 못박아 두었으니, 원문이 이미 깨끗하면 변경률은 당연히 낮다.
  //    낮은 변경률이 문제가 되는 것은 **고칠 것이 남아 있는데도** 안 고쳤을
  //    때뿐이고, 그건 diagnose-blog.mjs 가 판단한다. 여기서는 알리기만 한다.
  else if (율 < 5) 판정 = '조금 고침 (원문이 이미 깨끗하면 정상)';

  console.log(`${f.padEnd(14)} 변경률 ${율.toFixed(1).padStart(5)}%  ${판정}`);
  if (!표같나) { console.log('               ✖ 표나 태그가 바뀌었다'); 탈++; }
}
console.log(탈 ? `\n${탈}군데 문제` : '\n표와 태그는 그대로, 변경률도 범위 안');
process.exit(탈 ? 1 : 0);
