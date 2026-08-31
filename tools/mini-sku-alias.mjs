// MINI_SKU_ALIAS 에 넣을 한 줄을 만든다.
//
//   node tools/mini-sku-alias.mjs <새SKU>=<상품키> [<새SKU>=<상품키> ...]
//   node tools/mini-sku-alias.mjs                      (지금 것만 확인)
//
// 예)
//   node tools/mini-sku-alias.mjs ait.0000062547.d036f250.f16a547e53.8149212396=donate
//
// ⚠️ 왜 필요한가: 이 시크릿은 **통째로 덮어쓴다.** 새 상품 하나만 넣으면 나머지
//    상품이 전부 "준비 중" 이 되고 결제가 막힌다. 그런데 시크릿은 읽을 수가 없어서
//    (wrangler 는 이름만 보여 준다) 기존 값을 손으로 기억해 두어야 했다.
//
//    다행히 /mini/api/products 가 지금 팔리는 SKU 를 그대로 내준다. 거기서 읽어
//    새 것을 얹는다. 손으로 옮겨 적을 일이 없다.
//
// ⚠️ SKU 는 비밀이 아니다. 저 주소가 로그인 없이 내주는 값이라 화면에 찍어도 된다.

const 사는곳 = process.env.MYAN_ORIGIN || 'https://myan.riger7070.workers.dev';

// 살아 있는 상품 목록에서 SKU → 상품키 를 되짚는다.
//
// ⚠️ 이름(label)으로 맞추지 않는다. 이름은 사람이 고치는 값이라 언제든 바뀐다.
//    개수와 종류로 되짚으면 콘솔에서 이름을 바꿔도 흔들리지 않는다.
const 상품키 = (p) => (p.kind === 'donate' ? 'donate' : `token_${p.tokens}`);

const res = await fetch(`${사는곳}/mini/api/products`);
if (!res.ok) {
  console.error(`상품 목록을 못 받았다 (${res.status}). 주소를 확인할 것: ${사는곳}`);
  process.exit(1);
}
const { products = [] } = await res.json();

const 표 = new Map();
for (const p of products) 표.set(p.sku, 상품키(p));

// 명령줄에서 받은 새 짝을 얹는다.
const 새것 = [];
for (const arg of process.argv.slice(2)) {
  const i = arg.lastIndexOf('=');
  if (i < 1) {
    console.error(`이렇게 적어야 한다: <SKU>=<상품키>   (받은 것: ${arg})`);
    process.exit(1);
  }
  const sku = arg.slice(0, i).trim();
  const key = arg.slice(i + 1).trim();
  if (!/^ait\.[\w.]+$/.test(sku)) {
    console.error(`SKU 모양이 아니다: ${sku}`);
    process.exit(1);
  }
  if (표.has(sku)) {
    console.error(`이미 들어 있는 SKU 다: ${sku} → ${표.get(sku)}`);
    process.exit(1);
  }
  표.set(sku, key);
  새것.push([sku, key]);
}

console.log(`지금 팔리는 것 ${products.length}개 + 새로 넣는 것 ${새것.length}개\n`);
for (const [sku, key] of 표) {
  console.log(`  ${새것.some(([s]) => s === sku) ? '새로' : '그대로'}  ${key.padEnd(10)} ${sku}`);
}

// ⚠️ 한 줄로 낸다. 줄이 나뉘면 붙여 넣을 때 앞부분만 들어가는 일이 생긴다.
const json = JSON.stringify(Object.fromEntries(표));
JSON.parse(json);                       // 낼 것을 스스로 한 번 읽어 본다

console.log(`\n아래 명령을 돌리고, 물어보면 그 아래 한 줄을 붙여 넣으세요.\n`);
console.log('  wrangler secret put MINI_SKU_ALIAS\n');
console.log(json);
console.log(`\n넣은 뒤 확인: curl -s ${사는곳}/mini/api/products`);
console.log(`상품이 ${표.size}개로 나오면 된 것입니다. 배포는 필요 없습니다.`);
