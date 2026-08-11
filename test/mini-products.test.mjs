// 판매 상품 목록(/mini/api/products) — 무엇을 팔 수 있는지는 서버만 안다.
//
// 앱인토스 콘솔은 상품 번호(SKU)를 자동 생성한다('ait.0000062547.…'). 예전에는 앱이
// SKU 목록을 따로 들고 콘솔 목록과 대조했는데, 같은 번호가 콘솔·앱·서버 세 곳에 살면서
// 반드시 어긋났다 — 실제로 어긋나서 충전 화면에 '서버 미등록'만 뜨고 결제가 통째로
// 막혔다. 지급할 수 있는지를 아는 것은 서버뿐이므로 서버가 답하고, 앱은 번호를 외우지
// 않는다. 여기서 그 계약을 고정한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const { handleMiniProducts, MINI_PRODUCTS } = await loadWorker([
  'handleMiniProducts', 'MINI_PRODUCTS',
]);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AIT10 = 'ait.0000062547.fc566614.108bcc23c8.6434661588';
const AIT30 = 'ait.0000062547.aaaaaaaa.bbbbbbbbbb.1111111111';

const get = (env) => handleMiniProducts(
  new Request('https://x/mini/api/products', { method: 'GET' }), env);

const bodyOf = async (env) => JSON.parse(await (await get(env)).text());

test('별칭에 등록된 콘솔 SKU 만 판매 목록에 나온다', async () => {
  const body = await bodyOf({
    MINI_SKU_ALIAS: JSON.stringify({ [AIT10]: 'token_10', [AIT30]: 'token_30' }),
  });
  assert.deepEqual(body.products.map(p => p.sku).sort(), [AIT30, AIT10].sort());
  const ten = body.products.find(p => p.sku === AIT10);
  assert.equal(ten.tokens, MINI_PRODUCTS.token_10.tokens, '지급량이 상품표와 다르다');
  assert.equal(ten.label, MINI_PRODUCTS.token_10.label);
});

test('시크릿이 없으면 빈 목록이다 (아무거나 열어 주지 않는다)', async () => {
  const body = await bodyOf({});
  assert.deepEqual(body.products, [],
    '별칭이 없는데 팔 수 있다고 답했다 — 결제 뒤 지급이 안 되는 상태로 열린다');
});

test('JSON 이 깨져도 빈 목록으로 답하고 던지지 않는다', async () => {
  const res = await get({ MINI_SKU_ALIAS: '{깨진 JSON' });
  assert.equal(res.status, 200, '충전 화면이 통째로 죽으면 안 된다');
  assert.deepEqual(JSON.parse(await res.text()).products, []);
});

test('없는 상품을 가리키는 별칭은 걸러진다', async () => {
  // 시크릿 오타. 이걸 목록에 실어 주면 앱이 타일을 열고, 결제는 되는데 지급이 안 된다.
  const body = await bodyOf({ MINI_SKU_ALIAS: JSON.stringify({ [AIT10]: 'token_11' }) });
  assert.deepEqual(body.products, []);
});

test('로그인 없이도 답한다 (가격표는 로그인 전에도 그린다)', async () => {
  const res = await get({ MINI_SKU_ALIAS: JSON.stringify({ [AIT10]: 'token_10' }) });
  assert.equal(res.status, 200);
});

test('앱은 SKU 를 스스로 판단하지 않는다', () => {
  // 앱이 다시 SKU 목록을 들고 대조하기 시작하면 원래 버그로 돌아간다.
  // PRODUCTS 는 값 표시용으로 남아 있지만, 결제 가능 여부를 정하는 데 쓰이면 안 된다.
  const src = readFileSync(join(ROOT, 'mini', 'src', 'main.js'), 'utf8');
  assert.doesNotMatch(src, /known:\s*PRODUCTS\./,
    '앱이 PRODUCTS 로 결제 가능 여부를 정하고 있다 — 서버(/mini/api/products)에 물을 것');
  assert.match(src, /\/mini\/api\/products/,
    '앱이 판매 목록을 서버에 묻지 않는다');
  // 타일 클릭이 PRODUCTS 에서 SKU 를 되찾으면, 콘솔 SKU 는 거기 없으므로 눌러도 안 된다.
  assert.doesNotMatch(src, /PRODUCTS\.find\(/,
    '타일 클릭이 PRODUCTS 에서 SKU 를 찾고 있다 — 콘솔 SKU 는 그 목록에 없다');
});
