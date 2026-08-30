// 인스타·스레드에 올릴 카드를 그린다.
//
// og/ 의 카드와 왜 따로 두는가:
//   미리보기 카드는 1.91:1 (1200x630) 이다. 그 비율을 인스타에 올리면 위아래가
//   허옇게 남거나 잘린다. 인스타 피드는 4:5 (1080x1350) 가 화면을 가장 많이
//   차지하고, 글자를 넣기에도 세로가 넉넉하다. 그래서 같은 팔레트로 비율만
//   다시 그린다 — og 카드를 잘라 쓰면 글자가 날아간다.
//
//   node tools/build-insta-cards.mjs            전부
//   node tools/build-insta-cards.mjs --offline  서버를 안 타는 것만
//
// 결과물은 insta/ 아래에 들어간다. 사이트가 쓰는 그림이 아니라 손으로 올리는
// 자료라 워커는 이걸 서빙하지 않는다.
//
// ⚠️ 삼재 카드의 띠와 연도는 **박아 넣은 값이다.** 삼재는 2027년에 끝나므로
//    2028년부터는 SAMJAE 상수를 고쳐서 다시 돌려야 한다. 지금 값이 맞는지는
//    /calc/samjae/<그 띠의 아무 해> 를 열어 보면 확인된다.
//
// 띠 순위 카드만 성격이 다르다. 날마다 바뀌므로 **서버에서 오늘 값을 받아** 그린다.
// 그래야 날마다 올릴 거리가 생긴다 — 새 서비스가 홍보를 못 하는 이유는 대개
// 올릴 것이 떨어져서다. 서버가 안 잡히면 그 한 장만 건너뛰고 나머지는 그린다.

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// 띠 순위 읽기는 원고 뽑는 쪽과 함께 쓴다 — 두 벌이면 그림과 글이 다른 1위를 말한다.
import { fetchRanking } from './lib/tti.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'insta');
const SITE = 'https://myan.riger7070.workers.dev';

// 인스타 피드에서 가장 크게 잡히는 비율(4:5).
const W = 1080, H = 1350;

// 카드에 박아 넣는 주소.
//
// ⚠️ 캡션이 아니라 **그림 안에** 넣는다. 인스타는 캡션의 링크가 눌리지 않아서
//    어차피 손으로 쳐야 하는데, 스크린샷으로 퍼지면 캡션은 아예 떨어져 나간다.
//    그림에 있으면 어디서 다시 나타나든 출처가 따라간다.
//
//    그래서 짧은 주소여야 한다. myan.riger7070.workers.dev/... 는 보고 칠 사람이
//    없다. 이건 토스가 만들어 준 공유 주소라 짧고, 딥링크와 달리 토스가 없는
//    사람은 설치 안내로 간다 — 눌러도 아무 일 없는 상태가 되지 않는다.
//    worker.js 의 MINI_SHARE_LINK 와 같은 값이니, 그쪽이 바뀌면 여기도 바꾼다.
const SHARE = 'minion.toss.im/H0LAdMNg';

// 2025~2027 삼재는 亥卯未 삼합국 — 토끼·양·돼지다.
const SAMJAE = {
  tti: ['토끼', '양', '돼지'],
  years: [[2025, '들삼재'], [2026, '눌삼재'], [2027, '날삼재']],
  now: 2026,
};


/**
 * 띠 궁합표를 **살아 있는 페이지에서 그대로** 읽어 온다.
 *
 * 왜 다시 계산하지 않는가: 여기서 지지 관계를 또 적으면 페이지와 카드가 갈라진다.
 * 한쪽을 고치고 다른 쪽을 잊는 것은 시간 문제다. 페이지가 원본이고 카드는 사본이다.
 *
 * ⚠️ 이 카드는 **광고가 아니라 표 자체**다. 사람들이 스크린샷으로 가져가는 것은
 *    "좋은 표" 이지 "좋은 표가 있다는 안내" 가 아니다.
 */
async function fetchGunghap() {
  const html = await (await fetch(`${SITE}/gunghap`)).text();

  // ⚠️ 칸 안에 <i>🐭</i> 처럼 그림이 들어 있다. [^<]* 로 읽으면 하나도 안 잡혀서
  //    "표가 12x12 가 아니다" 로 그냥 건너뛴다 — 실제로 그렇게 조용히 빠졌다.
  //    태그를 걷어내되 그림은 살려서 읽는다.
  const 속 = (s) => s.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').trim();
  const 갈라읽기 = (s) => {
    const t = 속(s);
    const m = /^(\P{L}*)\s*(.*)$/u.exec(t);           // 앞에 붙은 그림과 이름을 가른다
    return { emoji: (m?.[1] || '').trim(), name: (m?.[2] || t).trim() };
  };

  const head = [...html.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((m) => 갈라읽기(m[1]));
  const rows = [...html.matchAll(/<th scope="row">([\s\S]*?)<\/th>((?:<td class="[a-z]*">[^<]*<\/td>)+)/g)]
    .map((m) => ({
      ...갈라읽기(m[1]),
      cells: [...m[2].matchAll(/<td class="([a-z]*)">([^<]*)<\/td>/g)].map((c) => ({ cls: c[1], text: c[2] })),
    }));
  if (head.length !== 12 || rows.length !== 12 || rows.some((r) => r.cells.length !== 12)) {
    throw new Error(`표가 12x12 가 아니다 — /gunghap 이 바뀌었는지 볼 것 (${head.length}x${rows.length})`);
  }
  return { head, rows };
}

// 카드에 세울 사람. 그 풀이를 맡은 인물을 넣는다 — 궁합이면 안낭자, 액막이면 안할매.
//
// ⚠️ 글만 있는 카드는 밋밋해서 넘겨진다. 사람이 한 명 서 있으면 그 자리에 눈이 멎고,
//    앱을 열었을 때 같은 얼굴이 답하므로 카드와 앱이 이어진다.
// ⚠️ SVG 를 그대로 심는다. <img src> 로 걸면 파일 URL 이라 스크린샷에 안 잡힌다.
const 사람 = (이름) => {
  const svg = readFileSync(join(ROOT, `${이름}.svg`), 'utf8')
    .replace(/<\?xml[^>]*\?>/, '')
    .replace('<svg ', '<svg preserveAspectRatio="xMidYMax meet" ');
  return `<div class="who">${svg}</div>`;
};

const shell = (body, extraCss = '', who = '') => `<!doctype html><html><head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${W}px; height: ${H}px; overflow: hidden;
    font-family: 'Noto Serif KR', serif; color: #e9e4da;
    background:
      radial-gradient(2px 2px at 12% 12%, rgba(232,212,168,0.5), transparent),
      radial-gradient(2px 2px at 78% 8%,  rgba(232,212,168,0.4), transparent),
      radial-gradient(2px 2px at 88% 26%, rgba(232,212,168,0.35), transparent),
      radial-gradient(2px 2px at 30% 6%,  rgba(232,212,168,0.3), transparent),
      radial-gradient(ellipse 80% 46% at 50% 0%, #1b150d 0%, transparent 62%),
      linear-gradient(160deg, #100c08 0%, #060608 60%, #050506 100%);
    display: flex; flex-direction: column; padding: 96px 84px; position: relative;
  }
  .moon {
    position: absolute; right: 84px; top: 90px;
    width: 120px; height: 120px; border-radius: 50%;
    background: radial-gradient(circle at 38% 34%, #fdf3d8 0%, #eed9a4 45%, #cbb072 100%);
    box-shadow: 0 0 70px rgba(232,212,168,0.42);
  }
  .brand { color: #c9a96e; letter-spacing: 16px; font-size: 26px; }
  .mid { flex: 1; display: flex; flex-direction: column; justify-content: center; padding-bottom: 96px; }
  .eyebrow { color: #c9a96e; font-size: 34px; letter-spacing: 4px; opacity: .92; }
  .gold {
    background: linear-gradient(176deg, #f4e3bd, #c9a96e 62%, #a5854e);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .rule {
    position: absolute; left: 84px; right: 84px; bottom: 108px; height: 1px;
    background: linear-gradient(90deg, rgba(201,169,110,0.55), rgba(201,169,110,0.06));
  }
  .foot { position: absolute; left: 84px; bottom: 62px; font-size: 27px; color: rgba(233,228,218,0.5); }
  .foot b { font-weight: 600; color: rgba(233,228,218,0.72); margin-right: 22px; }
  ${/* 사람은 오른쪽 **위**, 달 아래에 세운다.
       ⚠️ 아래쪽에 두면 본문 끝줄과 겹친다. 카드마다 글 길이가 달라서 한 장을 맞추면
          다른 장이 어긋난다. 위쪽은 브랜드와 제목 첫 줄뿐이라 어느 카드든 비어 있다. */''}
  .who { position: absolute; right: 52px; top: 150px; width: 232px; }
  .who svg { width: 100%; height: auto; display: block;
             filter: drop-shadow(0 0 46px rgba(232,212,168,0.16)); }
  ${/* 사람이 서면 달을 위로 올려 머리 위에 걸리게 하고, 제목은 왼쪽으로 좁힌다. */''}
  .who ~ .rule { display: block; }
  body:has(.who) .moon { right: 132px; top: 74px; width: 92px; height: 92px; }
  body:has(.who) .mid { padding-right: 256px; }
  ${extraCss}
</style></head><body>
  <div class="moon"></div>
  <div class="brand">M ; Y 安</div>
  ${/* 브랜드와 금선 사이를 다 차지하고 그 안에서 가운데로 앉는다.
       안 그러면 글이 위로 쏠리고 아래 3분의 1이 허옇게 빈다. */''}
  <div class="mid">${body}</div>
  ${who}
  <div class="rule"></div>
  ${/* ⚠️ 가운뎃점을 쓰지 않는다. 이런 기호가 늘어날수록 사람이 쓴 글로 안 보인다.
       띄어쓰기와 굵기로 가른다. */''}
  <div class="foot"><b>오늘운빨</b>${SHARE}</div>
</body></html>`;

const CARDS = [
  {
    name: 'samjae-2026',
    html: shell(`
      <div class="eyebrow">${SAMJAE.now}년 삼재</div>
      <div class="title gold">올해 삼재인 띠,<br>셋입니다</div>
      <div class="tti">${SAMJAE.tti.join('   ')}</div>
      <div class="years">
        ${SAMJAE.years.map(([y, k]) => `
          <div class="yr${y === SAMJAE.now ? ' on' : ''}"><b>${y}</b><span>${k}</span></div>`).join('')}
      </div>`, `
      .title { font-size: 74px; font-weight: 600; line-height: 1.3; margin-top: 26px; word-break: keep-all; }
      .tti { margin-top: 54px; font-size: 76px; font-weight: 600; color: #e9e4da; letter-spacing: 6px; }
      .years { margin-top: 66px; display: flex; flex-direction: column; gap: 22px; }
      .yr { display: flex; align-items: baseline; gap: 26px; font-size: 40px; color: rgba(233,228,218,0.45); }
      .yr b { font-weight: 600; min-width: 150px; }
      .yr.on { color: #e8c98a; }`, 사람('anhalmae')),
  },
  {
    name: 'ipchun',
    html: shell(`
      <div class="eyebrow">입춘</div>
      <div class="title gold">2월 초에 태어났다면<br>사주로는<br>아직 작년생입니다</div>
      <div class="body">해가 바뀌는 자리가<br>1월 1일이 아니라 입춘이라서요.<br><br>생일이 며칠 차이인데<br>사주가 통째로 달라집니다.</div>`, `
      .title { font-size: 66px; font-weight: 600; line-height: 1.34; margin-top: 26px; word-break: keep-all; }
      .body { margin-top: 72px; font-size: 42px; line-height: 1.62; color: rgba(233,228,218,0.62); word-break: keep-all; }`, 사람('andoryeong')),
  },
  {
    // 계정에 처음 온 사람이 보는 자리. 무엇을 하는 곳인지 한 장으로 말한다.
    name: 'intro',
    html: shell(`
      <div class="eyebrow">명리학으로 보는 하루</div>
      <div class="title gold">안도령이<br>오늘의 기운을<br>풀어 드려요</div>
      <div class="li"><i>一</i><span>그날 일진과 내 사주를 함께 봅니다</span></div>
      <div class="li"><i>二</i><span>궁합, 택일, 신살, 귀인까지 스무 가지</span></div>
      <div class="li"><i>三</i><span>띠 순위와 삼재 풀이는 무료</span></div>
      <div class="note">뽑기가 아니라 계산입니다.<br>같은 날에는 누가 보든 같은 답이 나옵니다.</div>`, `
      .title { font-size: 70px; font-weight: 600; line-height: 1.32; margin-top: 26px; word-break: keep-all; }
      .li { display: flex; gap: 20px; align-items: baseline; margin-top: 26px; font-size: 36px;
            line-height: 1.5; color: rgba(233,228,218,0.82); word-break: keep-all; }
      .li i { color: #c9a96e; font-style: normal; font-size: 28px; }
      .note { margin-top: 46px; font-size: 30px; line-height: 1.66; color: rgba(233,228,218,0.5); }`, 사람('andoryeong')),
  },
  {
    // 새 풀이를 알리는 자리.
    //
    // ⚠️ "잘 맞는 사람을 찾아 준다" 로 쓰지 않는다. 그건 궁합이 하는 말이고,
    //    이 풀이는 **이미 곁에 있는 사람과 어디서 부딪히는지**를 본다. 둘을 섞어
    //    적으면 기대와 다른 답이 나가서, 돈을 낸 사람이 속았다고 느낀다.
    name: 'relation',
    html: shell(`
      <div class="eyebrow">안낭자가 봐 드립니다</div>
      <div class="title gold">왜 자꾸<br>이 사람과<br>어긋날까</div>
      <div class="lead">궁합은 둘이 맞는지를 봅니다.<br>이건 어디서 부딪히는지를 봅니다.</div>
      <div class="li"><i>年</i><span>자란 집안과 뿌리</span></div>
      <div class="li"><i>月</i><span>성향과 일하는 결</span></div>
      <div class="li"><i>日</i><span>가장 가까운 자리</span></div>
      <div class="li"><i>時</i><span>함께 갈 앞날</span></div>
      <div class="note">네 기둥을 하나씩 견주어<br>맞물리는 자리와 어긋나는 자리를 따로 짚습니다.</div>`, `
      .title { font-size: 84px; font-weight: 600; line-height: 1.28; margin-top: 24px; word-break: keep-all; }
      .lead { margin-top: 44px; font-size: 34px; line-height: 1.6;
              color: rgba(233,228,218,0.72); word-break: keep-all; }
      .li { display: flex; gap: 24px; align-items: baseline; margin-top: 22px; font-size: 36px;
            line-height: 1.5; color: rgba(233,228,218,0.82); word-break: keep-all; }
      .li i { color: #c9a96e; font-style: normal; font-size: 32px; min-width: 40px; }
      .note { margin-top: 44px; font-size: 29px; line-height: 1.66; color: rgba(233,228,218,0.5); }
      ${/* 사람이 서 있는 곳은 제목 오른쪽뿐이다. 그 아래 글은 폭을 되찾는다 —
           안 그러면 두 줄짜리가 넉 줄이 되어 카드를 넘긴다. */''}
      body:has(.who) .lead, body:has(.who) .li,
      body:has(.who) .note { margin-right: -280px; }`, 사람('annangja')),
  },
  {
    // 손 없는 날.
    //
    // ⚠️ 그 달의 날짜를 박지 않는다. 박으면 다음 달에 못 쓰는 한 장이 되고, 블로그에
    //    붙여 둔 그림이 시간이 지나면 틀린 말을 하게 된다. 규칙만 담는다.
    name: 'sonnal',
    html: shell(`
      <div class="eyebrow">안할매가 짚어 드립니다</div>
      <div class="title gold">손 없는 날은<br>음력으로 셉니다</div>
      <div class="lead">양력 9일과 10일이 아닙니다.<br>음력 끝자리가 9와 0인 날입니다.</div>
      <div class="days">음력 9 10 19 20 29 30</div>
      <div class="note">손이라는 귀신이 방위를 이틀씩 돌다가<br>
        이 이틀에는 하늘로 올라가 자리를 비운다고 보았습니다.<br><br>
        음력을 양력으로 옮기면 달마다 날짜가 흩어지고,<br>
        30일이 없는 달에는 다섯 날만 나옵니다.</div>`, `
      .title { font-size: 74px; font-weight: 600; line-height: 1.3; margin-top: 24px; word-break: keep-all; }
      .lead { margin-top: 42px; font-size: 34px; line-height: 1.62;
              color: rgba(233,228,218,0.74); word-break: keep-all; }
      .days { margin-top: 44px; font-size: 46px; font-weight: 600;
              color: #e8c98a; letter-spacing: 3px; }
      .note { margin-top: 46px; font-size: 28px; line-height: 1.72; color: rgba(233,228,218,0.5); }
      body:has(.who) .lead, body:has(.who) .days,
      body:has(.who) .note { margin-right: -250px; }`, 사람('anhalmae')),
  },
  {
    // 만세력. 사람들이 가장 자주 틀리는 자리를 짚는다.
    name: 'manseryeok',
    html: shell(`
      <div class="eyebrow">안도령이 뽑아 드립니다</div>
      <div class="title gold">사주 네 글자,<br>뽑아는 보셨나요</div>
      <div class="li"><i>年</i><span>자란 집안과 뿌리</span></div>
      <div class="li"><i>月</i><span>성향과 일하는 결</span></div>
      <div class="li"><i>日</i><span>나 자신과 배우자 자리</span></div>
      <div class="li"><i>時</i><span>앞날과 자식 자리</span></div>
      <div class="note">기둥이 넷이고 글자가 둘씩이라 여덟 글자입니다.<br>
        팔자 사납다 할 때의 그 팔자입니다.<br><br>
        해가 바뀌는 자리는 1월 1일이 아니라 입춘입니다.<br>
        2월 초에 나셨다면 사주로는 아직 작년생일 수 있습니다.</div>`, `
      .title { font-size: 70px; font-weight: 600; line-height: 1.32; margin-top: 24px; word-break: keep-all; }
      .li { display: flex; gap: 24px; align-items: baseline; margin-top: 24px; font-size: 36px;
            line-height: 1.5; color: rgba(233,228,218,0.82); word-break: keep-all; }
      .li i { color: #c9a96e; font-style: normal; font-size: 32px; min-width: 40px; }
      .note { margin-top: 46px; font-size: 28px; line-height: 1.72; color: rgba(233,228,218,0.5); }
      body:has(.who) .li, body:has(.who) .note { margin-right: -250px; }`, 사람('andoryeong')),
  },
  {
    // 오행에 맞는 음식.
    //
    // ⚠️ "이걸 먹으면 낫는다" 로 쓰지 않는다. 오행 식이는 전통이지 영양학이 검증한
    //    것이 아니다. 몸에 좋다고 단정하면 과장광고가 되고, 무엇보다 거짓이다.
    //    겹치는 부분(다섯 색을 고루 먹기)만 사실대로 적는다.
    name: 'ohaeng-food',
    html: shell(`
      <div class="eyebrow">안할매가 짚어 드립니다</div>
      <div class="title gold">오행에 맞는<br>다섯 가지 밥상</div>
      <table class="fd">
        <tr><td class="e" style="color:#7fb98a">木</td><td class="k">푸른 것, 신맛</td><td class="v">시금치 부추 매실</td></tr>
        <tr><td class="e" style="color:#e08b7a">火</td><td class="k">붉은 것, 쓴맛</td><td class="v">토마토 대추 쑥</td></tr>
        <tr><td class="e" style="color:#e8c98a">土</td><td class="k">노란 것, 단맛</td><td class="v">호박 고구마 기장</td></tr>
        <tr><td class="e" style="color:#e6e2d8">金</td><td class="k">흰 것, 매운맛</td><td class="v">무 배 도라지</td></tr>
        <tr><td class="e" style="color:#7fa3c9">水</td><td class="k">검은 것, 짠맛</td><td class="v">검은콩 미역 다시마</td></tr>
      </table>
      <div class="note">다섯 빛깔을 고루 먹으라는 말은<br>
        오늘의 영양학과도 겹칩니다.<br><br>
        다만 내게 어느 기운이 모자란지는<br>
        사주 네 기둥을 봐야 압니다.</div>`, `
      .title { font-size: 74px; font-weight: 600; line-height: 1.3; margin-top: 24px; word-break: keep-all; }
      table.fd { margin-top: 46px; border-collapse: collapse; width: 100%; }
      table.fd td { padding: 15px 0; border-bottom: 1px solid rgba(201,169,110,0.14); vertical-align: baseline; }
      td.e { width: 76px; font-size: 44px; font-weight: 600; }
      td.k { width: 250px; font-size: 29px; color: rgba(233,228,218,0.62); }
      td.v { font-size: 31px; color: #e9e4da; }
      .note { margin-top: 44px; font-size: 27px; line-height: 1.7; color: rgba(233,228,218,0.5); }
      ${/* 표가 폭을 다 써야 하므로 사람이 서 있어도 좁히지 않는다. 제목만 비켜 준다. */''}
      body:has(.who) .mid { padding-right: 0; }
      .eyebrow, .title { padding-right: 250px; }`, 사람('anhalmae')),
  },
];

// ── 오늘의 띠 순위 ──
// 하나뿐인 "날마다 새로 그리는" 카드다. 서버가 안 잡히면 이 장만 빼고 간다.
// ── 띠 궁합표 ──
//
// 이 한 장만 성격이 다르다. 나머지는 "이런 게 있습니다" 하는 안내인데, 이건 **쓸 것
// 자체**다. 사람들이 스크린샷으로 가져가는 것은 좋은 표이지 좋은 표가 있다는 안내가
// 아니다. 그래서 안내를 지우고 표를 통째로 넣었다.
if (!process.argv.includes('--offline')) {
  try {
    const g = await fetchGunghap();
    CARDS.push({
      name: 'gunghap',
      html: shell(`
        <div class="eyebrow">안낭자가 짚어 드립니다</div>
        <div class="title gold">띠 궁합표</div>
        <table class="gh">
          <tr><td class="hd"></td>${g.head.map((h) =>
            `<td class="hd"><i>${h.emoji}</i>${h.name}</td>`).join('')}</tr>
          ${g.rows.map((r) => `
            <tr><td class="hd rw"><i>${r.emoji}</i>${r.name}</td>${r.cells.map((c) =>
              `<td class="${c.cls}">${c.text.replace('같은 띠', '동')}</td>`).join('')}</tr>`).join('')}
        </table>
        <div class="key">
          <span class="k good">삼합 육합</span> 잘 맞는 짝
          <span class="k bad">충 형</span> 부딪히는 자리
          <span class="k same">동</span> 같은 띠
        </div>`, `
        ${/* 표가 카드 폭을 다 써야 하므로, 사람이 서 있어도 본문을 좁히지 않는다.
             대신 제목 줄만 비켜 준다.
             ⚠️ 머리줄에 그림이 들어가면서 표가 높아졌다. 사람을 원래 자리에 두면
                표 오른쪽 세 칸(닭·개·돼지)을 덮는다. 제목 옆으로 올리고 줄인다. */''}
        body:has(.who) .mid { padding-right: 0; }
        body:has(.who) .who { top: 84px; width: 186px; right: 58px; }
        body:has(.who) .moon { right: 118px; top: 46px; width: 74px; height: 74px; }
        .eyebrow, .title { padding-right: 230px; }
        .title { font-size: 72px; font-weight: 600; line-height: 1.24; margin: 16px 0 26px; }
        table.gh { border-collapse: collapse; width: 100%; table-layout: fixed; }
        table.gh td { border: 1px solid rgba(201,169,110,0.16); text-align: center;
                      padding: 9px 0; font-size: 22px; line-height: 1.2; }
        td.hd { color: #c9a96e; font-size: 18px; letter-spacing: -0.6px; white-space: nowrap;
               background: rgba(201,169,110,0.08); line-height: 1.25; }
        td.hd i { font-style: normal; font-size: 30px; display: block; }
        ${/* ⚠️ 첫 칸에 nowrap 과 폭을 준다. 그림이 들어가면서 좁아져 "호랑이" 가
              "호 / 랑이" 로 접혔다. 표는 칸 폭을 고르게 나누므로 첫 칸만 따로 잡아 준다. */''}
        td.hd.rw { color: #e9e4da; white-space: nowrap; text-align: left; padding-left: 12px; }
        /* table-layout:fixed 는 **첫 줄** 로 칸 폭을 나눈다. 그래서 폭은 머리줄
           첫 칸에 줘야 한다. 아래 줄에만 주면 무시되고 글자가 옆 칸을 덮는다. */
        table.gh tr > td:first-child { width: 150px; }
        td.hd.rw i { display: inline; font-size: 26px; margin-right: 5px; vertical-align: -3px; }
        td.good { color: #e8c98a; background: rgba(201,169,110,0.11); }
        td.bad  { color: #e08b7a; background: rgba(224,139,122,0.09); }
        td.same { color: #9a948a; }
        td.none { color: #3a372f; }
        .key { margin-top: 34px; font-size: 25px; color: rgba(233,228,218,0.55); line-height: 2 }
        .k { display: inline-block; padding: 2px 14px; border-radius: 99px; margin-right: 8px; }
        .k.good { color: #e8c98a; background: rgba(201,169,110,0.16); }
        .k.bad  { color: #e08b7a; background: rgba(224,139,122,0.14); margin-left: 20px; }
        .k.same { color: #9a948a; background: rgba(154,148,138,0.14); margin-left: 20px; }`,
        사람('annangja')),
    });
  } catch (e) {
    console.warn(`띠 궁합표는 건너뛴다: ${e.message}`);
  }

  try {
    const r = await fetchRanking();
    CARDS.push({
      name: `tti-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
      html: shell(`
        <div class="eyebrow">${r.month}월 ${r.day}일   일진 ${r.ji}</div>
        <div class="title gold">오늘 1위는<br>${r.rows[0].name}입니다</div>
        <table><tbody>${r.rows.map((x) => `
          <tr${x.rank <= 3 ? ' class="top"' : ''}>
            <td class="r">${x.rank}</td><td>${x.name}</td>
            <td class="w">${x.why === '무난' ? '' : x.why}</td>
          </tr>`).join('')}</tbody></table>`, `
        ${/* ⚠️ 열두 줄이 다 들어가야 한다. 줄당 몇 px 만 커져도 마지막 줄이 아래
              주소와 겹친다 — 실제로 그렇게 나갔다. 값을 키우려거든 빌드가
              "카드를 넘는다"고 하는지 보고 키울 것. */''}
        .title { font-size: 74px; font-weight: 600; line-height: 1.26; margin: 20px 0 32px; word-break: keep-all; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 7px 0; font-size: 33px; border-bottom: 1px solid rgba(201,169,110,0.13); }
        td.r { width: 84px; color: rgba(233,228,218,0.42); font-size: 28px; }
        td.w { text-align: right; color: rgba(233,228,218,0.42); font-size: 24px; }
        tr.top td { color: #e8c98a; font-weight: 600; }
        tr.top td.r { color: #c9a96e; }`),
    });
  } catch (e) {
    console.warn(`띠 순위는 건너뛴다: ${e.message}`);
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

let 넘침 = 0;

for (const c of CARDS) {
  await page.setContent(c.html, { waitUntil: 'networkidle' });
  // 웹폰트가 앉을 때까지 기다린다. 안 기다리면 기본 고딕으로 찍힌다.
  await page.evaluate(() => document.fonts.ready);

  // ⚠️ 글이 카드 밖으로 밀렸는지 **재 본다.**
  //
  //    body 가 overflow:hidden 이라 넘쳐도 잘리기만 하고 아무 말이 없다. 실제로
  //    띠 순위 카드에서 12위 줄이 아래 주소와 겹친 채로 만들어졌고, 그림을 눈으로
  //    보기 전까지 아무것도 알려 주지 않았다 — 하마터면 그대로 올릴 뻔했다.
  //
  //    날마다 새로 그리는 카드가 있는 한 이 일은 또 난다(글자 수는 날마다 다르다).
  //    그래서 사람 눈이 아니라 여기서 막는다.
  const fit = await page.evaluate(() => {
    const mid = document.querySelector('.mid');
    const rule = document.querySelector('.rule');
    if (!mid || !rule) return null;
    const last = mid.lastElementChild;
    return {
      바닥: Math.round(last ? last.getBoundingClientRect().bottom : mid.getBoundingClientRect().bottom),
      금선: Math.round(rule.getBoundingClientRect().top),
      넘친높이: Math.max(0, mid.scrollHeight - mid.clientHeight),
    };
  });
  if (fit && (fit.넘친높이 > 0 || fit.바닥 > fit.금선)) {
    넘침++;
    console.error(`  ✖ ${c.name}: 글이 카드를 넘는다 —`
      + ` 마지막 줄 ${fit.바닥}px, 금선 ${fit.금선}px`
      + (fit.넘친높이 ? ` (${fit.넘친높이}px 잘림)` : ''));
  }

  const buf = await page.screenshot({ type: 'png' });
  writeFileSync(join(OUT, `${c.name}.png`), buf);
  console.log(`insta/${c.name}.png  ${(buf.length / 1024).toFixed(0)}KB`);
}

await browser.close();
console.log(`\n${CARDS.length}장 만들었다.`);
if (넘침) {
  console.error(`\n${넘침}장이 카드를 넘는다. 글자 크기나 줄 간격을 줄이고 다시 돌릴 것.`);
  process.exit(1);
}
