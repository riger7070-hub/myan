# 앱인토스 서버 API — 우리가 지켜야 하는 것

출처
- https://developers-apps-in-toss.toss.im/documentation/integration/server-api
- https://developers-apps-in-toss.toss.im/api/iap.md

토스가 정하고 우리는 따르기만 하는 규격이다. 어기면 **오류 메시지 없이 조용히 막힌다.**
그래서 `test/toss-server-api.test.mjs` 가 아래 값을 코드에 못 박아 두었다.
문서가 바뀌면 그 시험 파일부터 고친다.

우리 앱 이름(appName)은 `myan` 이다.

## 도메인 둘

| 도메인 | 쓰는 곳 | 우리가 쓰나 |
|---|---|---|
| `apps-in-toss-api.toss.im` | 간편 로그인, 메시지 발송, 토스 포인트 지급, **인앱결제 주문 조회** | 쓴다 |
| `pay-apps-in-toss-api.toss.im` | 간편 결제 | 안 쓴다 |

⚠️ 결제라고 `pay-` 도메인으로 보내면 안 된다. **인앱결제 주문 조회는 일반 도메인에 있다.**
한 번 헷갈려서 문서를 다시 확인했다.

우리가 부르는 곳은 하나뿐이다.

```
POST https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/order/get-order-status
본문: { "orderId": "..." }
```

## mTLS — 필수

앱인토스 서버 API 는 mTLS 가 필수라 **일반 fetch 로는 못 부른다.**

- 인증서: Toss appsintoss Root CA 발급, **2027-09-04 만료**
- Cloudflare 에 올려 두고 `wrangler.toml` 의 `TOSS_MTLS` 바인딩으로 받는다
- `env.TOSS_MTLS.fetch()` 만 클라이언트 인증서를 제시한다

⚠️ 바인딩이 없을 때 일반 `fetch` 로 넘어가면 안 된다. 인증 없이 통과한 것처럼 보인다.
지금 코드는 명시적으로 던진다(`_tossFetch`).

⚠️ **2027-09-04 이전에 갱신해야 한다.** 만료되면 미니앱 로그인과 결제가 전부 멈춘다.
토스는 무중단 교체를 위해 인증서 여러 장을 동시에 두는 것을 지원한다.

## CORS 허용 오리진

> 미니앱에서 서버와 통신하려면, 서버의 CORS 허용 Origin에 미니앱 Origin을 추가해야 해요.

| 쓰임 | 오리진 |
|---|---|
| 실제 서비스 | `https://myan.apps.tossmini.com` |
| 콘솔 QR 시험 | `https://myan.private-apps.tossmini.com` |

SDK 1.x ~ 3.x 가 모두 위 둘을 쓴다. 2026-08-25 이후 올린 SDK 3.x 번들도 같다
(그전 문서에 있던 `tossmini.com/web` 꼴은 없어졌다).

우리는 낱개로 적지 않고 `MINI_ORIGIN_RE` 로 `*.tossmini.com` 아래를 통째로 받는다.
토스가 서브도메인을 하나 더 늘려도 안 깨지기 때문이다. 대신 시험이 위 두 개를
이름으로 확인하고, 비슷하게 생긴 남의 도메인(`evil-tossmini.com`,
`tossmini.com.evil.kr`, `myan.apps.tossmini.com.kr`)이 막히는지도 본다.

⚠️ 오리진을 빠뜨리면 미니앱은 화면에 **"Failed to fetch"** 만 띄운다. 서버 로그에는
요청이 **아예 안 남는다** — 브라우저가 CORS 로 먼저 끊기 때문이다. 그래서
`isMiniOrigin` 이 못 알아본 오리진을 `console.warn` 으로 남긴다.

## 응답 형식

HTTP 200 이어도 본문의 `resultType` 으로 실패를 알린다.

```json
성공: { "resultType": "SUCCESS", "success": { ... } }
실패: { "resultType": "FAIL", "error": { "errorCode": "...", "reason": "..." } }
```

⚠️ 200 만 보고 성공으로 치면 **실패한 주문에 엽전이 나간다.**

## 주문 상태 여덟 가지

`get-order-status` 의 `status` 는 이 여덟 중 하나다.

| 상태 | 우리 처리 |
|---|---|
| `PURCHASED` | 지급 |
| `PAYMENT_COMPLETED` | 지급 |
| `ORDER_IN_PROGRESS` | 202 로 돌려보내고 다시 물어보게 한다 |
| `REFUNDED` | 이미 준 게 있으면 음수 행을 넣어 되돌린다 |
| `MINIAPP_MISMATCH` `NOT_FOUND` `FAILED` `ERROR` | 400 거절, 로그 남김 |

⚠️ 상태 이름에 오타가 하나 나면 **돈은 받고 엽전은 안 준다.** 사용자는 결제창에서
성공을 봤는데 잔액이 그대로다. 그래서 시험이 문서의 여덟 개 밖의 이름을 쓰는지 본다.

## 호출 한도

앱당 **분당 3,000회**. 넘기면 일시 차단될 수 있다.
우리 규모에서는 걸릴 일이 없지만, 주문 조회를 사용자 대신 반복 폴링하게 되면 닿을 수 있다.

## 방화벽 — 우리에겐 해당 없음

문서가 인바운드/아웃바운드 IP 목록을 준다. 이건 **자기 서버를 직접 운영할 때** 필요하다.
우리는 Cloudflare Workers 라 열고 닫을 방화벽이 없다. 참고로만 적어 둔다.

- 토스 → 우리 (인바운드, 443): `117.52.3.11`, `211.115.96.11`, `106.249.5.11`,
  그리고 `117.52.3.80~87`, `211.115.96.80~87`, `106.249.5.80~87`
- 우리 → 토스 (아웃바운드, 443):
  `apps-in-toss-api.toss.im` → `117.52.3.192`, `211.115.96.192`, `106.249.5.192`
  `pay-apps-in-toss-api.toss.im` → `117.52.3.195`, `211.115.96.195`, `106.249.5.195`

## 콘솔에서 받아 넣어야 하는 값

`wrangler.toml` 아래쪽에 적어 두었다. 여기 다시 적지 않는다 — 두 곳에 적으면 갈라진다.
`TOSS_DECRYPT_KEY`, `TOSS_DECRYPT_AAD`, `TOSS_UNLINK_AUTH`, `MINI_SKU_ALIAS` 넷이다.
