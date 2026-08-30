// 오늘의 띠 순위를 **살아 있는 페이지에서 그대로** 읽어 온다.
//
// 왜 한 벌로 모았는가: 이 파싱이 카드 그리는 쪽(build-insta-cards.mjs)과 원고
// 뽑는 쪽(build-post.mjs) 두 군데에 필요하다. 두 벌을 두면 /tti 의 표 모양이
// 바뀐 날 한쪽만 고치고 다른 쪽은 어제 숫자를 계속 뱉는다 — 그림과 글이 서로
// 다른 1위를 말하게 된다. 페이지가 원본이고 여기는 읽는 자리 하나뿐이다.
//
// ⚠️ 여기서 순위를 다시 계산하지 않는다. 앱이 보여 주는 숫자와 한 글자도
//    달라서는 안 되므로, 계산은 서버에만 있고 이쪽은 받아 적기만 한다.

export const SITE = 'https://myan.riger7070.workers.dev';

/**
 * @returns {Promise<{rows:{rank:number,name:string,why:string}[],month:string,day:string,ji:string}>}
 */
export async function fetchRanking(site = SITE) {
  const html = await (await fetch(`${site}/tti`)).text();
  const rows = [...html.matchAll(/<td class="r">(\d+)<\/td><td>([^<]+)<\/td>\s*<td class="s">([^<]*)<\/td>/g)]
    .map((m) => ({ rank: +m[1], name: m[2], why: m[3].trim() }));
  // 열둘이 아니면 표 모양이 바뀐 것이다. 조용히 반쪽짜리를 내보내면 카드와
  // 원고가 둘 다 틀린 채로 나간다 — 여기서 멈추는 편이 낫다.
  if (rows.length !== 12) throw new Error(`순위를 ${rows.length}개만 받았다 — /tti 가 바뀌었는지 볼 것`);
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
  const date = title.match(/\((\d+)월 (\d+)일\)/);
  const ji = html.match(/일진\(([^)]+)\)/)?.[1] || '';
  return { rows, month: date?.[1], day: date?.[2], ji };
}
