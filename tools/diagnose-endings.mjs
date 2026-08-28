// 해요체 글에서 종결어미가 한쪽으로 쏠렸는지 잰다.
//
//   node tools/diagnose-endings.mjs [폴더]
//
// ⚠️ 왜 따로 재는가: 규칙집의 E-2 는 "같은 종결어미 4문장 연속"을 본다. 그런데
//    해요체에서는 -에요 -예요 -어요 -아요 가 글자로는 다 다르면서 **읽는 귀에는
//    똑같이 들린다.** 글자만 견주면 안 걸리고, 읽으면 단조롭다.
//    그래서 소리 나는 대로 묶어서 센다.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const 어디 = process.argv[2]
  || join(dirname(fileURLToPath(import.meta.url)), '..', 'blog');

const 본문만 = (src) =>
  src.split('\n')
    .filter((l) => !/^\s{2,}\S/.test(l) && !l.trim().startsWith('#'))
    .join('\n');

const 문장들 = (t) =>
  t.replace(/\n+/g, ' ').split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter((s) => s.length > 1);

// 종결어미를 소리 나는 갈래로 묶는다. 위에 있는 것부터 맞춰 본다.
const 갈래 = [
  [/(거든요|거든)[.?!]$/, '거든요'],
  [/(잖아요|잖아)[.?!]$/, '잖아요'],
  [/(는데요|던데요|인데요)[.?!]$/, '는데요'],
  [/(고요|구요)[.?!]$/, '고요'],
  [/(죠|지요)[.?!]$/, '죠'],
  [/(ㄹ게요|을게요|를게요|게요)[.?!]$/, '게요'],
  [/(네요)[.?!]$/, '네요'],
  [/(나요|까요|세요\?|가요\?)[.?!]$/, '물음'],
  [/(더라고요|더라구요)[.?!]$/, '더라고요'],
  [/(세요|십니다|시죠)[.?!]$/, '높임'],
  [/(습니다|ㅂ니다|입니다)[.?!]$/, '합쇼체'],
  [/(예요|에요|어요|아요|해요|와요|요)[.?!]$/, '~요 (평서)'],
];

const 파일들 = readdirSync(어디).filter((f) => f.endsWith('.txt'));

for (const f of 파일들) {
  const ss = 문장들(본문만(readFileSync(join(어디, f), 'utf8')));
  const 센것 = new Map();
  const 줄 = [];
  for (const s of ss) {
    let 이름 = '기타';
    for (const [re, n] of 갈래) if (re.test(s)) { 이름 = n; break; }
    센것.set(이름, (센것.get(이름) || 0) + 1);
    줄.push(이름);
  }
  // 평서형 -요 가 몇 번이나 잇따르는가
  let 최장 = 0, 이어짐 = 0, 어디서 = 0;
  for (let i = 0; i < 줄.length; i++) {
    if (줄[i] === '~요 (평서)') {
      이어짐++;
      if (이어짐 > 최장) { 최장 = 이어짐; 어디서 = i - 이어짐 + 1; }
    } else 이어짐 = 0;
  }
  const 순 = [...센것].sort((a, b) => b[1] - a[1]);
  const 으뜸 = 순[0];
  console.log(`\n${f}  (문장 ${ss.length})`);
  console.log('  ' + 순.map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(`  으뜸 갈래가 ${(으뜸[1] / ss.length * 100).toFixed(0)}%, 평서형 -요 최장 ${최장}문장 연속`);
  if (최장 >= 4) {
    console.log(`  ✖ 가장 단조로운 대목 (${최장}문장):`);
    for (const s of ss.slice(어디서, 어디서 + 최장)) console.log(`      ${s}`);
  }
}
