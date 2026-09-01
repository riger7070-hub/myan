// promo/기록.md 와 docs/홍보.md 를 읽는 자리.
//
// 왜 따로 뺐는가: 대장을 짓는 쪽(build-promo-page.mjs)은 첫 줄부터 살아 있는
// `/tti` 를 부른다. 그래서 그 파일째로는 시험에 걸 수 없다 — 인터넷이 없으면
// 시험이 통째로 빨개지고, 있으면 날마다 다른 값이 들어온다. **읽는 규칙만**
// 여기 두면 인터넷 없이도 시험할 수 있다.

/**
 * promo/기록.md 를 읽는다.
 *
 * 모양이 어긋난 줄은 조용히 버리지 않고 돌려준다. 조용히 버리면 오타 하나로
 * 한 곳을 통째로 잃고도 모른다.
 *
 * @param {string} text
 * @returns {{한번:object[], 날마다:object[], 이상한줄:string[]}}
 */
export function 기록읽기(text) {
  const 묶음 = { 한번: [], 날마다: [] };
  const 이상한줄 = [];
  let 지금 = null;

  for (const 줄 of text.split(/\r?\n/)) {
    const h = /^##\s+(.+)$/.exec(줄);
    if (h) {
      지금 = h[1].includes('한 번만') ? '한번' : h[1].includes('날마다') ? '날마다' : null;
      continue;
    }
    if (!지금 || !/^\s*-\s*\[/.test(줄)) continue;

    const m = /^\s*-\s*\[([ x])\]\s*(?:(\d{4}-\d{2}-\d{2})\s+)?([^|]+?)\s*\|\s*([^|]+?)\s*(?:\|\s*(.*))?$/.exec(줄);
    if (!m) { 이상한줄.push(줄.trim()); continue; }

    // 올렸다고 표시했는데 날짜가 없으면 언제 올렸는지 영영 알 수 없다.
    const 올림 = m[1] === 'x';
    if (올림 && !m[2]) { 이상한줄.push(`${줄.trim()}   ← 올린 날짜가 없다`); continue; }

    묶음[지금].push({
      올림, 날: m[2] || '', 이름: m[3].trim(), 주소: m[4].trim(), 말: (m[5] || '').trim(),
    });
  }
  return { ...묶음, 이상한줄 };
}

/**
 * docs/홍보.md 를 `### ` 대목으로 자른다.
 *
 * ⚠️ 정규식 하나로 「제목부터 다음 제목 전까지」를 잡으려다 틀렸다. `$` 는 m
 *    플래그에서 줄마다 맞고, `\Z` 는 자바스크립트에 없어서 그냥 글자 Z 다 —
 *    오류가 안 나고 **마지막 대목만 조용히 사라진다.** 줄 단위로 자른다.
 *
 * @param {string} md
 * @returns {Map<string,string>}
 */
export function 대목나누기(md) {
  const 대목 = new Map();
  let 제목 = null;
  let 몸 = [];
  const 담기 = () => { if (제목) 대목.set(제목, 몸.join('\n').trim()); };

  for (const 줄 of md.split(/\r?\n/)) {
    const h3 = /^### (.+)$/.exec(줄);
    if (h3 || /^#{1,2} /.test(줄)) { 담기(); 제목 = h3 ? h3[1].trim() : null; 몸 = []; continue; }
    if (제목) 몸.push(줄);
  }
  담기();
  return 대목;
}

/**
 * 기록의 이름으로 홍보.md 의 대목을 찾는다. 못 찾으면 null.
 *
 * ⚠️ **먼저 시작하는 것부터 찾는다.** 그냥 includes 로 훑으면 「긱뉴스」가
 *    「디스콰이엇 · 긱뉴스」에 먼저 걸려서, 긱뉴스 자리에 디스콰이엇 원고가
 *    붙는다. 오류는 안 나고 올릴 때가 되어서야 보인다.
 *
 * @param {Map<string,string>} 대목
 * @param {string} 이름
 */
export function 대목찾기(대목, 이름) {
  for (const [제목, 몸] of 대목) if (제목.startsWith(이름)) return { 제목, 몸 };
  for (const [제목, 몸] of 대목) if (제목.includes(이름)) return { 제목, 몸 };
  return null;
}
