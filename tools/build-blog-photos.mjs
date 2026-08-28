// 블로그에 손으로 넣을 사진을 글마다 따로 빼 둔다.
//
//   node tools/build-blog-photos.mjs      (npm run photos)
//
// ⚠️ 왜 필요한가: 네이버 편집기는 글을 붙여 넣어도 **사진은 안 따라온다.** 손으로
//    하나씩 올려야 한다. 그런데 사진이 insta/ 와 blog/shots/ 에 흩어져 있고
//    이름도 sonnal.png, gunghap.png 라서, 올릴 때마다 어느 게 몇 번째 자리인지
//    다시 찾아야 했다.
//
//    그래서 글 순서대로 폴더를 파고, 자리 순서대로 이름을 붙여 둔다. 폴더를 열면
//    위에서부터 차례로 올리면 끝나도록.
//
// ⚠️ 이름은 **사장님이 쓰시던 것을 따른다.** 손으로 blog/띠.png, blog/띠 예시.png
//    처럼 빼서 쓰고 계셨다. 카드는 그냥 이름, 실제 화면은 "예시" 를 붙인다.
//    내가 편한 이름(사진1-하나.png)으로 바꾸면 쓰던 사람이 다시 익혀야 한다.
//
// ⚠️ 원본을 옮기지 않고 **베낀다.** insta/ 는 인스타에도 쓰는 자리라 건드리면 안 된다.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const 나갈곳 = join(ROOT, 'blog', '사진');

// 올릴 차례대로. 번호는 블로그에 올리는 순서다.
//
// ⚠️ 글번호는 네이버가 올릴 때 붙여 준다. 올리기 전에는 알 수 없으므로 비워 둔다.
//    올리고 나면 주소 끝의 숫자를 여기 적어 둔다. 그래야 나중에 어느 글의
//    사진인지 폴더 이름만 보고 안다.
const 글들 = [
  { 순서: 1, 이름: '손없는날', 글번호: '224392909113', 짧은이름: '음력',
    사진: ['insta/sonnal.png', 'blog/shots/sonnal.png'],
    설명: ['만든 카드', '2026년 4월을 계산한 실제 화면'] },
  { 순서: 2, 이름: '띠궁합', 글번호: '', 짧은이름: '띠',
    사진: ['insta/gunghap.png', 'blog/shots/gunghap.png'],
    설명: ['열두 띠 궁합표 카드', '궁합표 페이지의 실제 화면'] },
  { 순서: 3, 이름: '만세력', 글번호: '', 짧은이름: '기둥',
    사진: ['insta/manseryeok.png', 'blog/shots/manseryeok.png'],
    설명: ['네 기둥 카드', '1990년 5월 15일 사시로 뽑아 본 실제 화면'] },
  { 순서: 4, 이름: '오행식단', 글번호: '', 짧은이름: '오행',
    사진: ['insta/ohaeng-food.png', 'blog/shots/manseryeok.png'],
    설명: ['오행 식단 카드', '만세력이 오행 비율을 내주는 실제 화면'] },
];

/** 몇 번째 자리 사진인가에 따라 이름을 짓는다. 첫째는 카드, 둘째는 실제 화면. */
const 사진이름 = (g, i) => (i === 0 ? `${g.짧은이름}.png` : `${g.짧은이름} 예시.png`);

// 매번 새로 만든다. 지난번 것이 남아 있으면 어느 게 최신인지 알 수 없다.
if (existsSync(나갈곳)) rmSync(나갈곳, { recursive: true });
mkdirSync(나갈곳, { recursive: true });

const 줄 = [];
for (const g of 글들) {
  const 폴더이름 = g.글번호 ? `${g.순서}-${g.이름}-${g.글번호}` : `${g.순서}-${g.이름}`;
  const 폴더 = join(나갈곳, 폴더이름);
  mkdirSync(폴더);

  g.사진.forEach((p, i) => {
    writeFileSync(join(폴더, 사진이름(g, i)), readFileSync(join(ROOT, p)));
  });

  // 폴더마다 어디에 넣는지 적어 둔다. 사진만 있으면 며칠 뒤에 헷갈린다.
  //
  // ⚠️ 줄바꿈을 \r\n 으로 쓴다. 윈도우 메모장으로 열 것이라, \n 만 쓰면 한 줄로
  //    죽 붙어 나온다.
  const 안내 = [`${g.이름} 글에 넣을 사진입니다.`, ''];
  g.사진.forEach((p, i) => {
    안내.push(
      사진이름(g, i),
      `  ${i + 1}번째 토막을 붙인 다음 자리입니다.`,
      `  ${g.설명[i]}`,
      `  원본: ${p}`,
      '');
  });
  안내.push(g.글번호
    ? `올린 글: blog.naver.com/sexyfood99/${g.글번호}`
    : '아직 안 올린 글입니다.');
  writeFileSync(join(폴더, '어디에 넣나.txt'), 안내.join('\r\n') + '\r\n', 'utf8');

  줄.push(`  ${폴더이름}/  ${g.사진.map((p, i) => 사진이름(g, i)).join(', ')}`);
}

console.log(`blog/사진/ 에 글 ${글들.length}편치를 갈라 놨다.`);
console.log(줄.join('\n'));
