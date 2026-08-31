// MINI_SKU_ALIAS 에 넣을 한 줄을 만든다. --put 을 붙이면 바로 넣는다.
//
//   npm run sku -- <새SKU>=<상품키> [...]          만들어 보여만 준다
//   npm run sku -- <새SKU>=<상품키> --put          만들어서 바로 넣는다
//   npm run sku                                    지금 것만 확인
//
// 예)
//   npm run sku -- ait.0000062547.d036f250.f16a547e53.8149212396=donate --put
//
// ⚠️ --put 은 **운영 설정을 바꾼다.** 그래서 기본값이 아니라 따로 붙여야 하는
//    깃발로 두었다. 붙이지 않으면 아무것도 건드리지 않고 보여 주기만 한다.
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
const 인자 = process.argv.slice(2);
const 바로넣기 = 인자.includes('--put');
const 새것 = [];
for (const arg of 인자.filter((a) => a !== '--put')) {
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

// ⚠️ 여기서 process.exit 을 쓰지 않는다. fetch 가 남긴 핸들 위에서 강제로 끝내면
//    윈도우 node 가 "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" 를
//    뱉는다. 할 일이 끝나면 프로그램은 알아서 끝난다.
if (!바로넣기) {
  console.log(`\n그대로 넣으시려면 --put 을 붙이세요.\n`);
  console.log(`  npm run sku -- ${새것.map(([s, k]) => `${s}=${k}`).join(' ')} --put\n`);
  console.log('손으로 넣으시려면 wrangler secret put MINI_SKU_ALIAS 를 돌리고 아래 한 줄을 붙여 넣으세요.\n');
  console.log(json);
} else {

// ── 바로 넣기 ──
// ⚠️ 값을 명령줄에 싣지 않고 **stdin 으로** 넘긴다. 명령줄에 실으면 그 값이
//    셸 기록과 프로세스 목록에 남는다. SKU 는 비밀이 아니지만, 이 자리는 시크릿을
//    넣는 자리라 습관을 그렇게 들여 둔다.
const { spawn } = await import('node:child_process');
console.log('\nMINI_SKU_ALIAS 를 넣습니다...\n');

const code = await new Promise((resolve) => {
  const p = spawn('npx.cmd', ['--yes', 'wrangler', 'secret', 'put', 'MINI_SKU_ALIAS'],
    { stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
  p.on('error', (e) => { console.error('wrangler 를 못 돌렸다:', e.message); resolve(1); });
  p.stdin.end(json + '\n');
  p.on('close', resolve);
});

if (code !== 0) {
  console.error(`\n넣지 못했습니다 (종료 코드 ${code}). 위 메시지를 보세요.`);
  process.exitCode = code;
} else {
  // 넣었다고 믿지 않고 **실제로 다시 물어본다.**
  const 확인 = await fetch(`${사는곳}/mini/api/products`).then((r) => r.json()).catch(() => null);
  const 나온것 = 확인?.products?.length ?? 0;
  console.log(`\n${사는곳}/mini/api/products 가 상품 ${나온것}개를 내줍니다.`);
  if (나온것 === 표.size) {
    console.log(`${표.size}개 그대로입니다. 됐습니다.`);
  } else {
    console.error(`${표.size}개여야 하는데 ${나온것}개입니다 — 값을 다시 확인하세요.`);
    process.exitCode = 1;
  }
}

}
