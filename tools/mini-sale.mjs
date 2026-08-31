// MINI_SALE(할인) 에 넣을 한 줄을 만든다. --put 을 붙이면 바로 넣는다.
//
//   npm run sale                                  지금 걸린 할인 확인
//   npm run sale -- donate=550@2026-09-30         만들어 보여만 준다
//   npm run sale -- donate=550@2026-09-30 --put   만들어서 바로 넣는다
//   npm run sale -- --drop donate --put           그 상품 할인만 걷는다
//
// ⚠️ MINI_SKU_ALIAS 와 같은 문제를 안고 있다. 이 시크릿도 **통째로 덮어쓰는데**
//    읽을 수가 없다. 하나만 넣으면 나머지 할인이 전부 사라진다.
//    /mini/api/products 가 지금 걸린 할인(saleAmount, saleUntil)을 내주므로
//    거기서 읽어 새 것을 얹는다.
//
// ⚠️ 만료일은 **반드시** 받는다. 날짜 없는 할인은 서버가 무시한다 — 끝나는 날을
//    안 정하면 영영 할인가로 팔린다.

const 사는곳 = process.env.MYAN_ORIGIN || 'https://myan.riger7070.workers.dev';
const 상품키 = (p) => (p.kind === 'donate' ? 'donate' : `token_${p.tokens}`);

const res = await fetch(`${사는곳}/mini/api/products`);
if (!res.ok) { console.error(`상품 목록을 못 받았다 (${res.status})`); process.exit(1); }
const { products = [] } = await res.json();

// 지금 걸린 할인을 되짚는다. 같은 상품이 SKU 여럿일 수 있으므로 상품키로 모은다.
const 표 = new Map();
const 정가 = new Map();
for (const p of products) {
  정가.set(상품키(p), p.amount);
  if (p.saleAmount) 표.set(상품키(p), { amount: p.saleAmount, until: p.saleUntil });
}

const 인자 = process.argv.slice(2);
const 바로넣기 = 인자.includes('--put');
const 뺄것 = [];
const 넣을것 = [];
for (let i = 0; i < 인자.length; i++) {
  if (인자[i] === '--put') continue;
  if (인자[i] === '--drop') { 뺄것.push(인자[++i]); continue; }
  const m = /^(\w+)=(\d+)@(\d{4}-\d{2}-\d{2})$/.exec(인자[i]);
  if (!m) {
    console.error(`이렇게 적어야 한다: <상품키>=<할인가>@<만료일>   (받은 것: ${인자[i]})`);
    console.error('  예) donate=550@2026-09-30');
    process.exit(1);
  }
  넣을것.push([m[1], Number(m[2]), m[3]]);
}

for (const 키 of 뺄것) {
  if (!표.delete(키)) { console.error(`할인이 걸려 있지 않다: ${키}`); process.exit(1); }
}
for (const [키, 값, 날짜] of 넣을것) {
  const 원값 = 정가.get(키);
  if (!원값) { console.error(`파는 상품이 아니다: ${키}`); process.exit(1); }
  // 정가보다 비싼 "할인" 은 할인이 아니다. 서버도 무시하지만 여기서 먼저 막는다.
  if (값 >= 원값) { console.error(`${키}: 할인가 ${값}원이 정가 ${원값}원보다 싸지 않다`); process.exit(1); }
  // 콘솔은 공급가를 받고 판매가 = 공급가 × 1.1 이다. 11 로 안 나뉘면 만들 수 없는 값이다.
  if ((값 * 10) % 11 !== 0) {
    console.error(`${키}: ${값}원은 공급가가 정수로 안 떨어진다(판매가는 11의 배수여야 한다)`);
    process.exit(1);
  }
  표.set(키, { amount: 값, until: 날짜 });
}

console.log('할인 상태\n');
for (const 키 of 정가.keys()) {
  const s = 표.get(키);
  const 바뀜 = 넣을것.some(([k]) => k === 키) ? '새로' : 뺄것.includes(키) ? '걷음' : '그대로';
  console.log(`  ${바뀜}  ${키.padEnd(10)} 정가 ${String(정가.get(키)).padStart(6)}`
    + (s ? `  →  ${String(s.amount).padStart(6)}원 (${s.until} 까지)` : '  →  할인 없음'));
}

const json = JSON.stringify(Object.fromEntries(표));
JSON.parse(json);

if (!바로넣기) {
  console.log('\n그대로 넣으시려면 --put 을 붙이세요.\n');
  console.log(json);
} else {
  const { spawn } = await import('node:child_process');
  console.log('\nMINI_SALE 을 넣습니다...\n');
  const code = await new Promise((resolve) => {
    const p = spawn('npx.cmd', ['--yes', 'wrangler', 'secret', 'put', 'MINI_SALE'],
      { stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32' });
    p.on('error', (e) => { console.error('wrangler 를 못 돌렸다:', e.message); resolve(1); });
    p.stdin.end(json + '\n');
    p.on('close', resolve);
  });
  if (code !== 0) {
    console.error(`\n넣지 못했습니다 (종료 코드 ${code}).`);
    process.exitCode = code;
  } else {
    // 넣었다고 믿지 않고 다시 물어본다.
    //
    // ⚠️ 바로 물으면 아직 옛 값이 온다. 시크릿이 퍼지는 데 한두 숨 걸린다 —
    //    처음엔 곧바로 물어 "동냥 할인이 안 걸렸다" 고 헛경보를 냈다. 몇 번 다시 묻는다.
    let 걸린것 = [];
    for (let 회 = 0; 회 < 6; 회++) {
      if (회) await new Promise((r) => setTimeout(r, 1500));
      const 확인 = await fetch(`${사는곳}/mini/api/products`).then((r) => r.json()).catch(() => null);
      걸린것 = (확인?.products || []).filter((p) => p.saleAmount);
      // ⚠️ SKU 가 아니라 **상품키**로 센다. 같은 상품에 SKU 가 둘 붙어 있을 수 있어
      //    (엽전 10개가 그렇다) SKU 로 세면 숫자가 우연히 맞아떨어진다.
      if (new Set(걸린것.map(상품키)).size === 표.size) break;
    }
    const 걸린키 = new Set(걸린것.map(상품키));
    console.log(`\n할인이 걸린 상품 ${걸린키.size}종:`);
    for (const 키 of 걸린키) {
      const p = 걸린것.find((x) => 상품키(x) === 키);
      console.log(`  ${키.padEnd(10)} ${p.saleAmount}원 (${p.saleUntil} 까지)`);
    }
    if (걸린키.size !== 표.size) {
      console.error(`\n${표.size}종이어야 하는데 ${걸린키.size}종입니다 — 다시 확인하세요.`);
      console.error('(워커를 아직 배포 안 했으면 새 상품은 목록에 안 나옵니다.)');
      process.exitCode = 1;
    }
  }
}
