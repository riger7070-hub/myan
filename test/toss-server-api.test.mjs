// 앱인토스 서버 API 규격을 코드에 못 박는다.
//
// 출처: https://developers-apps-in-toss.toss.im/documentation/integration/server-api
//       https://developers-apps-in-toss.toss.im/api/iap.md
//
// ⚠️ 왜 필요한가: 이 규격들은 **토스가 정하고 우리는 따르기만 하는 것**이라, 우리 쪽에서
//    어기면 아무 오류 없이 조용히 막힌다.
//
//    오리진을 하나라도 빠뜨리면 미니앱은 화면에 "Failed to fetch" 만 띄운다. 서버 로그에는
//    요청이 아예 안 남는다 — 브라우저가 CORS 로 먼저 끊기 때문이다. 어디가 문제인지
//    알아내는 데 하루가 걸린다.
//
//    주문 상태값을 하나 빠뜨리면 **돈은 받고 엽전은 안 준다.** 사용자는 결제창에서
//    성공을 봤는데 잔액이 그대로다.
//
// 그래서 문서에 적힌 값을 여기 그대로 옮겨 적고, 코드가 그걸 지키는지 본다.
// 문서가 바뀌면 이 파일부터 고친다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadWorker } from './load-worker.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const 앱이름 = 'myan';          // 앱인토스 콘솔의 appName

const { isMiniOrigin } = await loadWorker(['isMiniOrigin']);

const 오리진요청 = (origin) => new Request('https://x/mini/api/me', { headers: { Origin: origin } });

// ── CORS 오리진 ────────────────────────────────────────────────
//
// 문서: "미니앱에서 서버와 통신하려면, 서버의 CORS 허용 Origin에 미니앱 Origin을 추가해야 해요."
//
// SDK 1.x ~ 3.x 가 모두 아래 둘을 쓴다. 2026-08-25 이후 올린 SDK 3.x 번들도 같다
// (그전에 문서에 있던 tossmini.com/web 꼴은 없어졌다).
const 허용해야할오리진 = [
  `https://${앱이름}.apps.tossmini.com`,          // 실제 서비스
  `https://${앱이름}.private-apps.tossmini.com`,  // 콘솔 QR 시험
];

test('토스가 문서에 적은 미니앱 오리진을 전부 받는다', () => {
  for (const o of 허용해야할오리진) {
    assert.equal(isMiniOrigin(오리진요청(o)), true,
      `${o} 를 막고 있다 — 미니앱이 "Failed to fetch" 만 띄우고 서버 로그에는 아무것도 안 남는다`);
  }
});

test('비슷하게 생긴 남의 도메인은 막는다', () => {
  // ⚠️ 오리진 검사는 정규식이라 느슨하게 쓰면 남의 도메인이 뚫린다.
  //    아래는 실제로 뚫리기 쉬운 모양들이다.
  const 막아야할것 = [
    'https://evil-tossmini.com',            // 앞에 붙인 것
    'https://tossmini.com.evil.kr',         // 뒤에 붙인 것
    'https://tossmini.com',                 // 서브도메인 없는 알몸
    'http://myan.apps.tossmini.com',        // http
    'https://myan.apps.tossmini.com.kr',    // 국가 코드를 덧댄 것
    'https://myan.apps.tossmini.com:8080',  // 포트를 단 것
  ];
  for (const o of 막아야할것) {
    assert.equal(isMiniOrigin(오리진요청(o)), false, `${o} 를 받아 주고 있다`);
  }
});

test('오리진이 없는 요청은 미니앱으로 치지 않는다', () => {
  assert.equal(isMiniOrigin(new Request('https://x/mini/api/me')), false);
});

// ── 주문 조회 ──────────────────────────────────────────────────
const src = readFileSync(join(ROOT, 'worker.js'), 'utf8');

test('주문 조회를 문서에 적힌 주소로 부른다', () => {
  // 문서: POST https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/order/get-order-status
  //
  // ⚠️ 결제라고 pay-apps-in-toss-api.toss.im 으로 보내면 안 된다. 그 도메인은 간편결제용이고,
  //    인앱결제 주문 조회는 일반 도메인에 있다. (한 번 헷갈려서 확인했다.)
  assert.match(src, /const TOSS_API = 'https:\/\/apps-in-toss-api\.toss\.im\/api-partner\/v1\/apps-in-toss'/,
    '앱인토스 API 도메인이 문서와 다르다');
  assert.match(src, /\$\{TOSS_API\}\/order\/get-order-status/,
    '주문 조회 경로가 문서와 다르다');
});

test('mTLS 없이는 앱인토스 API 를 부르지 않는다', () => {
  // 문서: "mTLS 인증서를 설정해야" 한다. 바인딩이 없을 때 일반 fetch 로 넘어가면
  // 인증 없이 통과한 것처럼 보인다. 그래서 명시적으로 실패해야 한다.
  assert.match(src, /if \(!env\.TOSS_MTLS\?\.fetch\) \{\s*throw new Error/,
    'mTLS 바인딩이 없을 때 조용히 넘어간다');
});

test('문서에 적힌 주문 상태를 하나도 빠뜨리지 않는다', () => {
  // 문서의 status 열거값 여덟 개. 하나라도 처리에서 빠지면 돈만 받고 안 주거나,
  // 안 된 결제를 지급한다.
  const 문서의상태 = ['MINIAPP_MISMATCH', 'NOT_FOUND', 'ORDER_IN_PROGRESS',
    'PAYMENT_COMPLETED', 'PURCHASED', 'FAILED', 'REFUNDED', 'ERROR'];

  const 지급 = /const TOSS_ORDER_PAID = new Set\(\[([^\]]*)\]\)/.exec(src);
  const 진행중 = /const TOSS_ORDER_PENDING = new Set\(\[([^\]]*)\]\)/.exec(src);
  assert.ok(지급 && 진행중, '주문 상태 목록을 못 찾았다');
  const 따옴표뗀것 = (s) => [...s.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);

  const 줄것 = 따옴표뗀것(지급[1]);
  const 기다릴것 = 따옴표뗀것(진행중[1]);

  // 지급하는 상태는 딱 이 둘이어야 한다. 늘어나면 안 된 결제에 엽전이 나간다.
  assert.deepEqual(줄것.sort(), ['PAYMENT_COMPLETED', 'PURCHASED']);
  assert.deepEqual(기다릴것, ['ORDER_IN_PROGRESS']);

  // 나머지는 코드가 이름으로 알거나(REFUNDED), 아니면 거절로 떨어진다.
  // 여기서는 **문서에 없는 상태를 쓰고 있지 않은지**를 본다. 오타 하나면 영영 지급이 안 된다.
  for (const s of [...줄것, ...기다릴것]) {
    assert.ok(문서의상태.includes(s), `문서에 없는 주문 상태를 쓴다: ${s}`);
  }
  assert.match(src, /status === 'REFUNDED'/, '환불 상태를 안 다룬다');
});

test('HTTP 200 이어도 resultType 을 확인한다', () => {
  // 문서: 모든 응답이 { resultType: "SUCCESS" | "FAIL" } 을 달고 온다.
  // 200 만 보고 성공으로 치면 실패한 주문에 엽전이 나간다.
  assert.match(src, /data\?\.resultType && data\.resultType !== 'SUCCESS'/,
    'resultType 을 안 보고 있다');
});
