# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

M;Y 安 (마이안) — an AI-powered Saju (四柱, Korean/Chinese fortune-telling) reading service, single-operator (1인 운영). Cloudflare Workers backend, vanilla JS frontend. Production: https://myan.riger7070.workers.dev

There are **three clients over one Worker**: the web app (repo root), an Expo WebView shell (`myan-native/`), and an Apps-in-Toss mini app (`mini/`, shipped as 오늘운빨 1.0.0 on 2026-08-11). Only the first two are the same service — the mini app is a **separate service with its own accounts and its own currency ledger**, and its in-app currency is called 엽전, not 토큰. See "The Apps-in-Toss mini app" below before touching anything under `mini/` or any `/mini/api/*` handler.

## Git workflow: push directly to `main`, with one carve-out

This is a solo-owner repo (`riger7070-hub/myan`) with no staging environment. `.github/workflows/deploy-worker.yml` deploys straight to production on every push to `main`, so a pushed change ships live within minutes. CI gates it with a syntax check → `npm test` → `wrangler deploy --dry-run` → the mini app's own build before deploying, which catches a broken parse or a failing contract — but nothing exercises the live D1, Gemini, or Toss, so a green run is not proof the change behaves correctly in production. Note the gate is shared: a failing mini-app test or a broken `mini/` build stops the Worker deploy too. That's deliberate, but it means "I only touched the Worker" isn't a reason to skip reading a red run.

- **Default: commit and push routine changes without asking first.** Self-verify first (re-read the diff, check brace/paren balance if you can't run `node`/`wrangler` locally, confirm the change does what was asked) — but once you're confident, push. Don't make the user approve every commit.
- **Exception: changes touching auth, payments, or tokens need an explicit go-ahead before pushing.** This covers anything in `getEmailFromToken`/`verifySessionToken`/`createSessionToken`, the `payment_requests` ledger (grants/deductions/refunds), Toss payment verification (`handlePaymentVerify`), or any PIN/admin-auth check. Summarize the change and ask before pushing — this class of bug is the one most likely to cost real money or leak user data, and there's no automated test to catch a mistake before it's live.
- There is no separate "deploy" step to run — pushing to `main` *is* the deploy. Don't run `wrangler deploy` manually unless asked (it would deploy uncommitted local state, bypassing the CI history).

## ⚠️ Read before editing: `worker.js` is plain source, not a bundle

`worker.js` (repo root, ~2950 lines) is ordinary, human-written ES module source — it does `import LunarPkg from 'lunar-javascript'` like any normal dependency. There is **no separate `src/`/`dist/` split and no committed build step**: `package.json` has no `build` script, `wrangler.toml` points `main` straight at `worker.js`, and `.github/workflows/deploy-worker.yml` just runs `npm install && wrangler deploy`. `wrangler deploy` bundles `worker.js` (and its `import`s, via its own internal esbuild) at deploy time — that bundled artifact is never committed, only what Cloudflare runs. **Edit `worker.js` directly**; don't try to hand-bundle or inline dependencies into it.

⚠️ If you ever see a copy of this file that starts with `var __create = Object.create(...)` and `__commonJS(...)` wrappers instead of `import LunarPkg from 'lunar-javascript'` at the top, that is the **post-bundle deployed output** (e.g. copied from the Cloudflare dashboard's Quick Edit view), not this repo's source — don't edit or commit that shape.

### Never hand-edit `lunar-javascript`'s internals
`computeSaju()` delegates the actual pillar/solar-term (절기) math to the `lunar-javascript` npm package (`node_modules/lunar-javascript`, pinned in `package.json`). That package's internal constant tables (`XL0`, `XL1`, `DAY_YI_JI`, `SB`, `QB`, `QI_KB`, `SHUO_KB`, ...) are astronomical data — never patch them in place or vendor a hand-edited copy into this repo. If a Saju looks wrong, suspect a bug in `computeSaju()`'s own logic (in `worker.js`) before suspecting the library. After any change touching Saju calculation, **run a reading for a known birth date and confirm the four pillars (年/月/日/時) match the pre-change output.**

## Commands

```bash
# Local frontend/backend preview
npx wrangler dev

# Validate before every deploy (catches syntax errors without deploying)
npx wrangler deploy --dry-run

# Deploy (also happens automatically via GitHub Actions on push to main)
npx wrangler deploy

# Regenerate WebP variants of the PNG icons (only script in package.json)
npm run convert-webp
```

`npm test` runs the suite (Node's built-in runner, no framework — `node --test "test/*.test.mjs"`; the quoted glob matters, `node --test test/` fails on Node 24; a `pretest` step empties `test/.tmp`, where the loader's `worker.js` copies used to pile up). `npm run check` is the full pre-push pass: syntax check + tests + `wrangler deploy --dry-run`. Two more that are not part of `check` because they answer questions a green run can't: `npm run dead` / `npm run dead:mini` list top-level declarations nothing references (deliberately blunt — a name seen in a string or comment counts as used, since missing one beats deleting a live one), and `npm run smoke` hits **production** and prints what the server currently knows, including the 엽전 sale prices to read side by side with the Toss console. It does **not** build the mini app — CI does, so if you changed anything under `mini/` run `npm run check:mini` too (that's `npm ci && npm run build` in `mini/`, the same thing CI runs) rather than finding out from a red run.

Tests import internals through `test/load-worker.mjs`, which copies `worker.js` to `test/.tmp/*.mjs` and appends an `export {}` — **never leave test-only exports in the deployed `worker.js`**. `test/d1-sqlite.mjs` gives a handler a real D1-shaped database: it runs the actual DDL from `worker.js` under `node:sqlite` and yields a macrotask tick per query. That tick is the whole point — D1 is a network hop, and wrapping synchronous SQLite in `async` alone lets one request run to completion before another resumes, so concurrency bugs quietly pass. Use it whenever you touch a handler where two simultaneous requests would matter.

The suite does not cover Gemini, Toss, or push delivery. For those, and after anything touching Saju math, still verify by hand: run a reading for a fixed birth date before and after and confirm the four pillars (年/月/日/時) are identical (the golden-value test covers 10 dates but not your specific case), check the token balance display, and exercise the Toss flow with test keys.

When adding a regression guard, break the code on purpose first and confirm the test actually fails. A guard that only ever passes is worse than none — it reads as coverage.

### Native app (`myan-native/`)
Expo/Expo Router app that is **a WebView shell around the deployed site**, not a second client. `app/index.jsx` loads `https://myan.riger7070.workers.dev` in a `WebView` and adds only what a browser can't do: native Google Sign-In (bridged through `window.__nativeGoogleToken`), Android back-button handling, and opening external links. **A new web feature therefore needs no porting — it ships to the app the moment it ships to the web.**

The whole app is `app/_layout.jsx` + `app/index.jsx`. There is no second copy of the reading logic to keep in sync — `myan-native/src/*.js` (an unused `api.js`/`locales.js`/`saju.js` set left over from the first commit, imported by nothing) was deleted for that reason. If you find yourself editing a Saju or i18n file under `myan-native/`, you are in the wrong place. `dist/` and `.expo/` there are local build output and are gitignored, not part of the repo.

Not part of the web deploy pipeline — the app only changes when you rebuild it with EAS.

**All of GitHub's Dependabot alerts on this repo are here, and the decision is to leave the remaining ones.** Two advisories remain (`image-size` via `metro`, `uuid` via `xcode` — three alerts, since `image-size` counts twice); the root and `mini/` audit clean. They are reached only when your own assets are processed on your own build machine. A third, `nanoid` via `expo-router`/`postcss`, **was** fixed — not because it was reachable (the fix's only code change is a guard in `async/index.native.js`, a file nothing here imports and which cannot even load, since its `expo-random` dependency isn't installed; both real call sites use `nanoid/non-secure`, which cannot loop at any size) but because unlike the other two it was a patch bump, so `"overrides": { "nanoid": "^3.3.18" }` in `myan-native/package.json` clears the banner without touching Expo. **That override pins a transitive dep — if a future Expo upgrade wants `nanoid@4`+, delete it rather than fighting it; it buys no security.** Don't add overrides for `image-size`/`uuid`: those are major API changes and would break the build. Do **not** run `npm audit fix --force` — npm's "fix" is a downgrade to `expo@53` / `react-native@0.72` that would undo the verified Expo 57 upgrade. The reasoning is written out in `myan-native/SETUP.md` §7 so it doesn't get re-investigated each time the banner appears.
```bash
cd myan-native
npm install
npx expo start
```

### The Apps-in-Toss mini app (`mini/`) — a second client, and a separate service
Unlike `myan-native/`, this is **not** a WebView shell: it is a real second client (`mini/src/main.js`, ~1500 lines of vanilla JS + Vite) talking to the same Worker through `/mini/api/*`. Shipped as 오늘운빨 1.0.0 on 2026-08-11; `mini/RELEASE-NOTES.md` is the running changelog and the source of the console's "업데이트 내용" text.

```bash
cd mini
npm install
npm run dev              # vite dev
npm run build            # vite build && ait build
npm run deploy           # ait deploy  (프로필 이름 주의, 아래 참고)
```

**`ait deploy` 는 `~/.ait/credentials` 의 `default` 프로필을 쓴다 — PC 마다 다르니 확인할 것.**
CLI 는 `--profile` 이 없으면 `this.profile || this.workspace || "default"` 로 `default` 를 찾고,
그 이름이 없으면 조용히 넘어가지 않고 **키가 멀쩡히 있어도 API 키를 다시 입력하라고 되묻는다.**
거기서 멈추면 업로드는 일어나지 않는다 — 콘솔에 아무것도 안 올라온 채 성공한 줄 알기 쉽다.

한동안 `deploy` 스크립트에 `--profile myan` 이 박혀 있었는데(그 PC 에는 그 이름으로 등록돼 있었다),
그쪽이 없는 PC 에서는 같은 이유로 되물었다. 2026-08-26 에 `default` 로 통일했다. 새 PC 에서
처음 배포하거나 키를 재발급했다면 `cd mini && npx ait token add`(이름을 주지 말 것 — 그래야
`default` 로 들어간다)로 넣는다. 이름을 준 프로필을 쓰고 싶다면 `npx ait token add <이름>` 뒤에
스크립트에도 `--profile <이름>` 을 함께 붙여야 하며, **그 PC 에서만 되는 조합이라는 것을 기억할 것.**
지금 어떤 이름이 들어 있는지는 `~/.ait/credentials` 의 키 이름으로 알 수 있다(값은 열지 말 것).

**It is a separate service, not a second face of the web app.** Accounts and currency are deliberately unshared: a web user and a mini user are different people even if they're the same human, and 엽전 bought in the mini app do not exist on the web. The code states this as a contract rather than an accident (`_LEDGERS`, `test/mini-isolation.test.mjs`), so treat "the same person's balances don't add up across the two" as intended behaviour and don't "fix" it by joining them — if the separation ever should end, that's a product and payments decision, not a refactor.

- **Both clients now call the currency 엽전.** The mini app always did; the web was migrated too, so `js/locales.js` (ko) and `index.html` say 엽전 and never 토큰. The 74 remaining `토큰` in `worker.js` all mean *auth* token (`인증 토큰`) — a different word that happens to collide, so don't bulk-rename them. Same ledger mechanics on both sides; what still differs is the account and the ledger table, not the name.
- **Two clients, two deploys, one Worker.** Pushing to `main` deploys the Worker — which is the mini app's backend — but *not* `mini/`, which only ships when you run `npm run deploy` (`ait deploy`) yourself. Publishing to a store surface is a decision about timing, not something to fire on every push, so CI deliberately stops at building. So a Worker change can go live while the mini client is still the old bundle: when you change a `/mini/api/*` contract, either keep it backward compatible or deploy the client in the same sitting. CI helps two ways — it **builds** `mini/` on every push (a broken client can't slip in unnoticed), and when a push touched `mini/` it writes a reminder into the run's summary with the deploy command. `mini/dist/` and `mini/*.ait` are build output and gitignored.
- **`ait build` is a real check, not a repackaging step.** It validates `apps-in-toss.config.ts` against what Vite actually emitted — e.g. if `webBundleDir` and Vite's `outDir` drift apart, `vite build` still succeeds and only `ait build` fails. It needs no Toss credentials (only `ait deploy` does), which is why CI can run it.

#### The account layer is how one handler serves both services
`resolveAccount(request, env)` returns `{ kind: 'web' | 'mini', key }` and is the only thing a paid handler needs to know about who is asking. `accountBalance` / `accountSpend` / `accountRefund` then pick the ledger from the fixed `_LEDGERS` table — `payment_requests(user_email)` for web, `mini_payment_requests(user_key)` for mini. The table and column names come only from that table, never from request data.

- **Order matters in `resolveAccount`.** It checks the mini session *first*, then falls back to `getEmailFromToken`. Reversed, a loosening of the web verifier would silently put mini users on the web ledger.
- **Mini sessions are the same HS256 JWTs, with a `mini:` subject prefix.** `getMiniUserKeyFromRequest` accepts a token only if the verified subject starts with `mini:`, and `getEmailFromToken` rejects those subjects — so neither side's token works on the other's routes. `test/mini-isolation.test.mjs` (16 tests) pins both directions, including that an email merely *shaped* like `mini:…` isn't accepted.
- **History is namespaced, not split.** `accountHistoryKey` prefixes mini users with `mini:` and both services share `feature_history`. That's intentional — history isn't money, so nothing can be mis-accounted, and one query serves both. The ledgers stay physically separate because they *are* money.
- **`userKey` must be stringified.** Toss sends it as a JSON *number*. Binding it raw makes SQLite store `'307515147.0'` in a TEXT column while the session subject holds `'307515147'`, so login writes one row and every later request reads another — one human, two accounts. That actually happened: Toss-supplied name/birthday landed only on the login row and never appeared in the app.

#### Toss integration facts that are easy to get wrong
- **The partner API requires mTLS**, so it is unreachable from plain `fetch`. Only `env.TOSS_MTLS.fetch` presents the client certificate (`[[mtls_certificates]]` in `wrangler.toml`). If the binding is missing, the helper throws rather than falling through to an unauthenticated call. **The certificate expires 2027-09-04** — when it does, mini-app login and payment both stop. The private key is never in this repo; the committed `certificate_id` is only a reference to what Cloudflare holds.
- **Name, birthday and gender arrive AES-256-GCM encrypted**, needing `TOSS_DECRYPT_KEY` / `TOSS_DECRYPT_AAD` from the console. Without them decryption yields `null` and the user simply types their birth date — login still works, so a missing secret degrades quietly instead of breaking. Gender comes as `MALE`/`FEMALE` and must be normalized to `M`/`F`: 대운 direction is decided by gender, so a mismatch silently reverses the reading. Unknown values become `null` rather than a guess.
- **The unlink callback is fail-closed.** `/mini/api/auth/unlink` compares the whole `Authorization` header against `TOSS_UNLINK_AUTH` with `_timingSafeEqual`; with the secret unset it rejects everything, deliberately — knowing a `userKey` would otherwise be enough to unlink someone else's account. It accepts both GET query and POST JSON because the console decides which. It **clears personal fields but keeps the row**: deleting it would make a re-linking user look new while the purchase ledger still keyed off their `userKey`.
- **CORS is per-origin.** Mini responses go through `miniCors`, which replaces the default single allowed origin with the request's own when it matches `MINI_ORIGIN_RE` (any `*.tossmini.com` subdomain over https) and sets `Vary: Origin`. Unrecognized origins are logged, because on the client this failure looks like nothing but `Failed to fetch`.

#### Daily play stores its state in the ledger, on purpose
There are only two `mini_*` tables (`mini_users`, `mini_payment_requests`). 출석 도장 / 퀴즈 / 부풀리기 / 광고 보상 don't get tables of their own — a check-in is a `tokens = 0` row whose id *is* the fact (`checkin:<userKey>:<KST date>`), inserted with `ON CONFLICT DO NOTHING`, and the streak is counted by reading recent ids back. This is the same rule as the web grants: **once-per-day is enforced by the PRIMARY KEY, never by a prior `SELECT`.** The mini signup grant follows it too, as `signup:<userKey>` (the web equivalent is `signup_${email}` — same idea, different id shape, so don't expect one pattern to match both). Reward amounts and the ad-reward daily cap live in `MINI_*` constants; `test/mini-checkin.test.mjs`, `mini-quiz.test.mjs`, and `mini-pop.test.mjs` cover them.

Rewards attach to *actions*, not luck — 산가지 뽑기 is free entertainment that pays nothing, because paying out on a random draw invites a 사행성 (gambling) objection in review. Everything that does pay (출석, 퀴즈, 부풀리기, 광고) pays for something the user did.

부풀리기 is the one reward a client could otherwise just claim by POSTing, so it isn't taken on trust: `/mini/api/pop` issues an HMAC-signed challenge (`pop:<userKey>:<taps>:<issuedAt>`) that the claim must return, and the claim is rejected if the elapsed time is below `MINI_POP_MIN_MS` (automation) or above `MINI_POP_MAX_MS` (replaying an old issue). Likewise the ad bonus that raises a day's cap is counted from **rows actually granted that day**, never from what the client claims it watched.

#### IAP
`MINI_PRODUCTS` maps SKU → `{ tokens, amount }` (`token_10` 4,290원 / `token_30` 9,900원 / `token_100` 27,500원 — 콘솔 공급가에 맞춘 값이라 코드가 아니라 콘솔이 기준이다). **`orderId` is the primary key of the grant**, so a client retry or a `getPendingOrders` recovery grants once. `PURCHASED` and `PAYMENT_COMPLETED` both count as paid; `ORDER_IN_PROGRESS` means ask again later, not failure. An SKU present in the Toss console but missing from `MINI_PRODUCTS` reaches a branch that **logs loudly and returns 500** — the money already arrived, so that case must never pass silently. `test/mini-price-parity.test.mjs` checks the app's displayed prices against what the server records, and that the amounts are values the console actually permits.

**할인가는 코드에 없다 — `MINI_SALE` 시크릿에 있고, 진짜 주인은 앱인토스 콘솔이다.** 토스 SDK 는
소모품 상품에 **할인 전 가격**만 준다(`offers` 는 구독 상품에만 붙는다). 그래서 화면에 할인가를
적으려면 서버가 그 값을 따로 들고 있어야 하는데, 서버에서 콘솔 값을 읽을 길이 없다. 콘솔에서
가격을 바꾸고 시크릿을 안 고치면 **화면과 결제창이 어긋난 채 아무 데서도 티가 나지 않는다** —
이미 세 번 겪었다. 형식은 `{"token_30":{"amount":5940,"until":"2026-09-30"}}` 이고, `until`
없거나 형식이 아니거나 지난 것, 정가보다 비싼 값은 **아예 없는 것으로 본다**(할인 끝난 뒤 시크릿
지우는 것을 잊어도 표시가 저절로 사라진다). 검사로 만들지 않은 이유는 진짜 값이 콘솔에 있어
여기서 읽을 수 없기 때문이다 — 대신 `npm run smoke` 가 서버가 아는 할인을 정가·할인율·만료일과
함께 찍어 주니 콘솔 「인앱 상품」 화면과 나란히 놓고 보면 된다. 원장에 남는 `amount` 는 정가
그대로라, 나중에 매출을 합산하는 화면을 만든다면 할인 기간이 부풀어 보인다는 것도 기억할 것.


##### 결제가 됐는데 지급이 안 됐을 때 (2026-08-30 에 실제로 겪음)
증상은 앱의 "제휴사에서 상품 지급에 실패했습니다" 하나뿐이고, **그때까지는 서버 어디에도
흔적이 남지 않았다** — 사용자의 화면 갈무리가 유일한 증거였다. 원인은 결제된 주문의 SKU 가
`MINI_SKU_ALIAS` 에 없던 것이었다. 콘솔에는 「엽전 10개」 상품이 **하나뿐인데도** 주문이
돌려준 번호가 상품 목록의 번호와 달랐다(콘솔에서 상품을 고치면 번호가 새로 생기는 것으로
보인다). 결제·주문조회·상태판정은 전부 정상이었고 **마지막 한 칸에서만 막혀 있었다.**

세 자리를 보면 된다. 전부 `ADMIN_SECRET` 으로 잠겨 있다(상수 시간 비교, 미설정이면 항상 거절).

    GET  /admin/mini-failures                 지급이 막힌 주문 목록. pkg 에 그 SKU 가 그대로 적혀 있다
    GET  /admin/mini-order?orderId=...        그 주문을 토스에 다시 물어본다(읽기 전용, 돈 안 듦)
    POST /admin/mini-grant {"orderId":"..."}  손으로 지급한다

**`/admin/mini-order` 는 결제를 새로 하지 않고 원인을 짚으려고 있는 자리다.** 주문 조회는
몇 번을 해도 돈이 들지 않으므로, 원인을 보자고 결제를 반복하지 말 것. 지급 핸들러와 똑같은
자리에서 읽고 아무것도 쓰지 않는다.

`/admin/mini-grant` 는 **토스에 먼저 물어 결제된 주문만** 지급하고, 지급 행의 id 가 `orderId`
라 몇 번을 눌러도 한 번만 나간다. 수량은 요청이 정하지 못한다(`MINI_PRODUCTS` 에서만 온다).
받을 사람은 실패 흔적에서 찾으므로 대개 `userKey` 를 적을 필요가 없다.

⚠️ **콘솔에서 가격을 바꾼 날에는 `/admin/mini-failures` 를 한 번 열어 볼 것.** SKU 가 새로
생기면 그 상품은 앱에서 "준비 중" 으로 뜰 뿐이라(결제는 막히지만) 조용히 지나가기 쉽다.
목록에 찍힌 번호를 `MINI_SKU_ALIAS` 에 넣으면 복구된다. 알림으로 바꾸려면
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` 를 넣어야 한다 — 지금은 둘 다 비어 있다.

⚠️ **정가는 콘솔이 주인이고, 할인가는 시크릿이 주인이다.** 앱은 SDK 의 `displayAmount`
(콘솔의 할인 전 가격)를 먼저 쓰므로 **콘솔에서 정가를 바꾸면 배포 없이 화면이 따라온다.**
할인가는 토스가 주지 않으니 `MINI_SALE` 을 함께 고쳐야 한다. 할인가가 정가보다 싸지 않으면
할인으로 치지 않는다 — 화면이 결제창보다 비싸게 말하는 일은 만들지 않는다.

##### 안스님 동냥 (1,100원, 엽전 1~10개 무작위)
후원하는 자리다. 파는 것은 **덕담**이고 엽전은 거스름돈이다.

⚠️ **기댓값을 엽전 칸보다 비싸게 유지할 것.** 1~10 을 고르게 주면 평균 5.5개가 되어
200원/개인데, 가장 싼 엽전 칸이 429원/개다. 그러면 동냥이 엽전을 싸게 사는 노름판이
된다. 지금은 아래로 몰아 두어 평균 2.249개, 489원/개다.
**엽전 칸 값을 내리는 날에는 `ALMS_ODDS` 도 함께 볼 것** — `mini-price-parity` 가 잡아 준다.

⚠️ **확률은 밝힌다.** 무작위로 주면서 확률을 안 적으면 안 된다. 화면의 「엽전 확률 보기」에
표로 나가는데, 그 숫자는 **굴리는 표(`ALMS_ODDS`)를 그대로 내려보낸 것**이다. 앱에 손으로
적어 두지 말 것 — 광고한 확률과 실제 확률이 어긋나면 그건 거짓말이다.

⚠️ 엽전 수는 **주문번호로 굴린다.** 무작위로 굴리면 10개가 나올 때까지 재시도하는 길이
열린다. 덕담과는 소금을 달리해서, 덕담을 보고 개수를 짐작할 수 없게 했다.

##### 결제를 **돈 안 내고** 시험하는 법 — 샌드박스 앱
출처: https://developers-apps-in-toss.toss.im/development/test/sandbox.md

토스에는 **샌드박스 앱**이 따로 있다. 거기서는 **실제 돈이 나가지 않고**, 인앱결제와
토스 로그인이 그대로 돌아간다. 원인을 보자고 진짜 결제를 되풀이하지 말 것 —
수수료만 나가고, 샌드박스로 볼 수 있는 것을 못 보는 것도 아니다.

    1. 샌드박스 앱을 받는다 (안드로이드 APK 는 `adb install`, iOS 는 시뮬레이터에 끌어다 놓기)
    2. **개인 토스 비즈니스 계정**으로 로그인한다 (공용 계정은 세션이 끊긴다)
    3. 작업공간에서 우리 앱을 고르고, 등록된 토스 폰으로 푸시 인증을 받는다
    4. 스킴을 넣어 미니앱을 띄운다 — 우리 것은 `intoss://myan`

되는 것: 토스 로그인, 사용자 식별(가짜 값), 토스페이, **인앱결제**, 게임 프로필, 리더보드
안 되는 것: 애널리틱스, 공유 리워드, **인앱 광고**, 가로 게임, 내비게이션 바 공유

⚠️ 샌드박스에서는 http 도 통하지만 **실서비스는 https 만** 된다. 샌드박스에서 됐다고
   주소를 http 로 두면 실서비스에서만 막힌다.

⚠️ 샌드박스 주문을 `get-order-status` 로 물어볼 수 있는지는 **문서에 안 적혀 있다.**
   지급까지 확인하려면 그 자리를 실제로 눌러 보고 확인할 것. 안 되면 서버 쪽 지급
   경로는 `test/mini-iap.test.mjs` 와 `/admin/mini-order` 로만 볼 수 있다.

⚠️ 샌드박스는 **그날의 콘솔 상태**를 시험한다. 나중에 콘솔에서 상품을 고쳐 SKU 가
   새로 생기면 샌드박스에서 잘 되던 것이 실서비스에서 막힌다. 그건 위의
   `/admin/mini-failures` 로 잡는다.

## Architecture

### Backend: one Worker, one file
`worker.js` is a single Cloudflare Worker with a manual `fetch(request, env)` route table (no framework) covering auth, chat/AI, payments, admin, push, several side-quest features (promo QR, referrals, streaks, pudding fortune QR), and the mini app's own `/mini/api/*` surface (login, profile, currency, daily play, IAP grant, unlink — see the mini-app section above). Static assets (the entire repo root except `worker.js`) are served through the `SITE_ASSETS` binding (`[assets]` in `wrangler.toml`, `run_worker_first = true` — the Worker runs *before* asset serving so it can inject security headers and `window.ENV` into `index.html`). Because assets are Worker-first, don't assume any static file bypasses `worker.js`.

### Data model: `payment_requests` is an append-only token ledger, not a balance column
Everything in this section applies identically to the mini app's `mini_payment_requests` (keyed by `user_key` instead of `user_email`) — same append-only rules, separate table. Go through `accountSpend`/`accountRefund` rather than naming a table directly, and see the mini-app section for why the two ledgers must never be joined.

There is no `tokens` balance field anywhere. Balance = `SUM(tokens) WHERE status='approved'` over `payment_requests`, where a purchase/grant is a positive row and a spend is a negative row. **Always grant or deduct by inserting a new row — never `UPDATE ... SET tokens = tokens + N`.** An `UPDATE` matches *every* row for that `user_email`, so it multiplies the grant by however many payment rows the user already has. Conditional/atomic spends use a single `INSERT ... SELECT ... WHERE (SELECT SUM(tokens) ...) >= cost` so concurrent requests can't double-spend (see the `/chat` and `/chat-detail` handlers for the pattern). `handleStreakCheckin`, `handleReferralClaim`, and `handleUngiGiveTokens` used to violate this (`UPDATE payment_requests SET tokens = tokens + N WHERE user_email = ?`, reproducing a token-inflation bug) — this was fixed to the INSERT-row pattern; if you ever see that `UPDATE` shape reappear anywhere in the file, it's a regression.

**A `SELECT`-then-`INSERT` guard is not a guard.** Spends are atomic, but *grants* were all written as "SELECT whether they already got it → `await` → INSERT". D1 is a network round trip, so two requests that arrive together both pass the check and both get paid (double-tap, retry on a slow connection, two tabs, an offline queue replaying). This was live in five places at once — signup grant, local-token migration, the 7-day streak bonus, promo claim, and the one-time dynamic promo code (where *two different accounts* could each redeem the same code). The rule now: **a once-per-account or once-per-day grant must derive its `payment_requests.id` from what makes it unique** (`signup_${email}`, `streak_${email}${'_'}${today}`, `promo_${email}_${CODE}`) **and insert with `INSERT OR IGNORE`**, so the PRIMARY KEY — not a prior read — is what enforces "once". Consuming a single-use code uses a conditional `UPDATE ... WHERE used_at IS NULL` and checks `meta.changes`, the same shape `handleReferralClaim` uses. `test/grant-idempotency.test.mjs` and `test/streak-bonus.test.mjs` fire each handler twice concurrently and will fail if this regresses.

### Gemini is now a paid key — the constraint changed from throughput to cost
**Since 2026-08-11 the Gemini key is on the paid tier.** Before that it was free-tier at roughly 10 RPM, and that limit was the binding constraint on the whole product: measured against production on 2026-08-09, 12 sequential readings all succeeded but **5 concurrent requests all failed** (~6.4s each, 422 with the token correctly refunded). That is the reason `cachedFortune` exists at all — read the cache section below with that history in mind, not as a description of today's limit.

What changed matters more than it sounds, because **the failure direction inverted**:

| | free tier (before) | paid tier (now) |
|---|---|---|
| over the limit | request fails → token auto-refunded → no money lost | no limit → every call bills |
| worst case | "the app doesn't work sometimes" | a surprise invoice |

So the caches are no longer a throughput workaround; they are a **cost** control, and that changes what's worth caching (frequency × price, not concurrency). Blast radius is bounded but not zero: paid features need 엽전, guest trial is 1/IP/day, and the cron pre-warm is capped — but 엽전 are also given away free (signup, 출석, 퀴즈, 부풀리기, 광고), so free 엽전 are now free spend. **Keep a budget alert on the Google Cloud project**; that is the cheapest insurance and it is not something the code can enforce.

Do not re-measure concurrency and re-tune around a number without checking the current tier first — the 10 RPM figure above is history, and several constants used to be derived from it.

Some prompts contain **no user data at all**. Those go through `cachedFortune(env, bucket, generate)` (D1 table `fortune_cache`, `id = bucket#variant`):

| feature | bucket | count |
|---|---|---|
| 타로 / 룬 / 유형궁합 | no date — permanent | 176 / 192 / 100 |
| 띠·별자리 / 럭키 / 라이프패스 | includes `_kstYmd()` | 576 / 4 / 48 per day |

Four rules hold this together:
- **A date-scoped bucket and the date inside its prompt must roll over at the same instant.** Those three prompts embed `ilchin()`'s 오늘의 오행, so if the two disagree, one bucket spans two different 일간 and whichever request lands first pins its day's text for everyone else. That happened: `ilchin()` used the runtime's local midnight (UTC in the Worker, i.e. 09:00 KST) while the bucket used KST midnight, so a request between 00:00 and 09:00 KST cached text built on *yesterday's* element and served it for the rest of the KST day. Everything is on one KST axis now — `_kstYmd()` for both — so just don't build a date out of runtime-local time (`new Date().setHours(...)`, `getFullYear()`, …); in the Worker that silently means UTC. `test/fortune-bucket-date.test.mjs` asserts `ilchin()` is constant within a bucket, under a shim that forces UTC-local semantics, because on a KST dev machine the plain test cannot see the difference.
- **The token deduction still happens per request.** The cache skips the Gemini call, not the charge. A cache hit has no failure path, so no refund.
- **A D1 lookup alone is not enough.** D1 is a network hop, so five concurrent cold requests all miss and all call Gemini — the original bug, reproduced behind a cache. `_fortuneInflight` (in-isolate `Map` of in-flight promises) coalesces them; `test/fortune-cache.test.mjs` fires 5 at once and fails if the count isn't 1. This mattered for throughput on the free key and now matters for the bill — same code, different reason to keep it.
- **The cron pre-warm and the handler must build the identical bucket and prompt.** Both call `tarotSpec`/`runeSpec`/`typeCompatSpec` — never inline a bucket string in one of those three handlers, or the cron fills rows nobody reads while users keep paying the Gemini call, and nothing on screen looks wrong. `test/fortune-warm.test.mjs` checks this structurally.

`warmFortuneCache` runs from a dedicated 04:00 KST cron, filling the emptiest buckets first; `purgeStaleFortunes` drops only the date-scoped buckets. Its pacing (`WARM_BUDGET` × `WARM_GAP_MS`) was originally set to stay under the free-tier RPM; on the paid key the limit is now **the Worker's subrequest cap per invocation**, since each entry costs one Gemini call plus two D1 queries (120 entries ≈ 362 subrequests, well under the paid plan's 1000). A run that gets cut short costs nothing — it fills empty slots first and skips filled ones, so the next night resumes.

**Within one fill level, Korean buckets go first** (`WARM_LANG_ORDER`). Only 117 of the 468 permanent slots are `ko`; the other 351 are en/zh/ja, which on a Korean store are mostly rows nobody opens — free capacity on the old key, real money on the paid one. The order is *count first, language second* on purpose: language-first would let `ko` pile up second and third variants while English never gets a first one. Note the tiebreak looks redundant, because `permanentFortuneSpecs()` happens to emit `ko` first and `Array.sort` is stable — so a behavioural test of the ordering passes even with the comparison deleted. `test/fortune-warm.test.mjs` therefore checks `_warmLangRank` directly *and* asserts the comparator still consults it. Date-scoped content (576 zodiac combos/day) is deliberately left lazy — pre-warming a day's worth would mostly generate rows nobody opens, which on a paid key means paying for them. Per-user features (대운, 이름 풀이, 궁합 시기, 택일, 배우자궁, 상세 풀이, 관상, 꿈해몽, 주역, 천궁도 …) can't use `cachedFortune`, since its bucket is a fixed list of variants and the prompt here contains the user's own chart. Several now go through `cachedReading(env, key, ttl, produce)` instead, which shares one D1 row (`fortune_cache`) between requests that would produce the identical text. Two key shapes are in use, and picking the wrong one is how this feature hands one person another person's reading:

- `_promptKey(prompt)` — a hash of the **whole** prompt (택일, 이름 짓기, 속궁합, 관계, 올해 운세, 방위, 재물운 …). Safe by construction: anything that changes the answer changes the key.
- `_sajuKey(saju, gender)` — the four pillars plus gender, for features whose prompt contains **nothing else** that varies (신살, 귀인, 전생 …). Cheaper to reason about, but only correct while that stays true — if you add the user's name, question, or locale to one of those prompts, move it to `_promptKey` in the same edit.

Same rule as `cachedFortune`: the deduction still happens per request, and a cache hit has no failure path so nothing is refunded.

Gemini failures log via `geminiText` (`console.warn` with status / `finishReason` / `promptFeedback`, never the prompt). Before this, a failure left no trace anywhere in production, which is why "가끔 안 된다" was untraceable. **`geminiText` is not yet universal** — the cached features plus 택일/대운/이름 풀이/궁합 시기 go through it, but a number of handlers still inline their own `fetch` and log nothing on failure. `geminiText` also carries the `_ANDORYEONG_SI` system instruction, the `AbortSignal.timeout`, and `thinkingBudget: 0`, so an inline `fetch` has to repeat all three by hand and silently loses whichever it forgets. Prefer `geminiText` in anything new, and convert an inline site whenever you touch one — passing `maxOutputTokens` explicitly, since only `temperature`/`thinkingConfig` have defaults.

**Every paid handler must refund on exception, not just on a bad response.** The 30 paid features deduct via `accountSpend`, call Gemini, then refund when `!resp.ok || !reading` (any handler that calls `geminiText` checks `!reading` alone, since it returns `''` on a bad response). That branch never runs if `fetch` itself throws (connection reset, timeout, subrequest limit) — control jumps to the outer `catch`, which used to just return 500 with the tokens already gone. They now build a `refund` closure right after the deduction (`refund = () => accountRefund(env, acct, '<feature>', <cost>)`) and call it from both the failure branch and the `catch`. This is also what keeps the charge and the refund using one value. Adding a new paid feature means wiring both sides; `test/refund-on-failure.test.mjs` checks all 30 structurally and will fail if a new one skips it (it asserts the exact count, so adding a paid feature means bumping that number deliberately). Seven of them are also covered at runtime — the test drives the handler with `fetch` throwing, with a 500, and with a 200 carrying an empty body, and asserts the balance is untouched.

### Auth: two token types flow through one verifier — every authenticated handler must use it
- Google ID tokens (from Google Sign-In) are verified against `oauth2.googleapis.com/tokeninfo`.
- The app's own session tokens are `HS256` JWTs signed/verified with `hmacSign`/`hmacVerify` (`createSessionToken` / `verifySessionToken`), keyed off `SESSION_SECRET`.
- `getEmailFromToken(idToken, env)` transparently dispatches to whichever of the two a given bearer token is, and is the **only** sanctioned way to turn a request into a trusted email. `handlePromoClaim` used to decode the JWT payload itself (`JSON.parse(atob(token.split('.')[1]))`) with no signature check — anyone could forge an arbitrary `email` and claim promo tokens as that user. It's now routed through `getEmailFromToken`. If you ever see raw `atob(token.split('.')[1]))`-style decoding on an Authorization header anywhere, that's the same bug — replace it with `getEmailFromToken`.

### Admin auth is `email === ADMIN_EMAIL`; kiosk/counter features use PIN secrets, not constant-time comparison
`isAdmin(request, env)` checks the verified email against `ADMIN_EMAIL`. Separately, several kiosk/counter features (`/api/admin/ungi/give-tokens`, `/api/promo/generate`, `/promo-display`, `/pudding-qr-batch` flows) gate on a short numeric PIN compared with plain `===`/`!==` (not constant-time — acceptable here since these are low-value, rate-limited/IP-gated flows, but don't reuse this pattern for anything higher-stakes). `UNGI_PIN`, `CAFE_STAFF_PIN`, and `PROMO_ADMIN_PIN` are read from `env.*` (set via `wrangler secret put <NAME>`, see `wrangler.toml`'s comment block) with **no hardcoded fallback** — if a secret isn't set, that PIN route always rejects. They used to be hardcoded literals (`'5984'`/`'7777'`/`'9999'`) committed to this (public) repo; if you ever see a bare string literal compared against `pin`/`adminPin` again, move it back to an `env.*` secret.

`env.MASTER_IP` follows the same rule for a different kind of bypass: it is the one IP that skips the guest trial's once-per-day limit in `handleGuestChat`. It was a hardcoded literal too — the owner's real address, in a public repo — and now has no fallback, so an unset secret just means nobody gets the exemption. `test/guest-limit.test.mjs` fails on any dotted-quad literal left in `worker.js`.

That trial's "once per day" is a **KST** day, like everything else here (`_kstYmd()` for the `used_date` key, and `resetAt` computed as the next KST midnight via `Date.UTC`). It used the UTC date, which in the Worker meant the window actually reset at 09:00 KST — a guest could take a second free reading by trying at 08:00 and again at 10:00, and someone who used it at 23:00 was still refused after Korean midnight. Same test file pins the boundary, the rollover months, and that none of it depends on the runtime's local zone.

### Saju calculation exists in two independent places — keep them in sync deliberately
- **Backend** (`worker.js`, `computeSaju()`, built on the `lunar-javascript` package): the authoritative calculation, solar-term (절기) aware, used for the actual AI-authored reading and for `saju_history`.
- **Frontend** (`js/saju-engine.js` `calcSajuElements()`, and `ilchin()` duplicated in both `js/constants.js` and `worker.js`): a simplified client-side approximation used only for the instant gauge/preview UI before the real reading loads, explicitly documented in-code as "절기 미반영 간략화" (solar terms not applied). It is expected to occasionally disagree with the backend by a day/pillar near solar-term boundaries.
- `ilchin()` (today's day-pillar/five-element "energy of the day") is copy-pasted verbatim in `worker.js` and `js/constants.js`. If you change one, change the other, or the daily-energy text shown on the client will contradict what the backend used to generate the reading. `test/ilchin-kst.test.mjs` now enforces this instead of trusting the note: it strips comments and whitespace from both copies and fails if the calculation differs.
- **`ilchin()` rolls the day over at KST midnight, and must not read runtime-local time.** It used `new Date().setHours(0,0,0,0)`, which made "today" depend on where the code ran — 09:00 KST in the Worker (local = UTC), the user's own midnight in the browser. A Korean user between 00:00 and 09:00 KST saw the client's element gauge and the paid AI text naming different elements; a user abroad disagreed with both. It's now computed from `Date.now()` on a KST axis, anchored so 2023-01-01 (KST) = 44 — the value a Korean browser already showed, which `test/ilchin-kst.test.mjs` pins with a golden table for 10 dates. Note this makes the boundary agree with `_kstYmd()`, which is why the cache bucket can share it. If you ever touch this function, run that test under both `TZ=Asia/Seoul` and `TZ=UTC`: several of its guards can only fail in one of the two.

### Token economy quick reference
Solo reading = 1, Duo (compatibility) = 2, detail/상세 풀이 = 2, 택일 = 2, 라이프패스/유형궁합 = 2, 이름 풀이 = 4, 토정비결 = 4, 관상·손금 = 4, 대운 = 6, 궁합 시기 = 6; most of the side features (타로·룬·주역·꿈해몽·띠운세·럭키·천궁도·주제별·로또) are 1. **Read the number off the handler's `const COST`, not off this list** — this table has drifted before. Token cost variables are read once and reused for both the deduction and any refund path (Gemini call failure ⇒ automatic refund insert) — when adding a new paid feature, keep the same variable for both sides so a refund never mismatches the original charge.

**The mini app calls the currency 엽전, but the prices are no longer different.** They used to be (the web was cheaper); the web was later raised to match, so today a single `const COST` in each handler serves both clients and nothing branches on `acct.kind` for price. The rule the numbers encode is that a reading you look at once costs more, while one you come back to daily stays cheap — 대운 6, 궁합 시기 6, 이름 풀이 4, 관상 4, 토정비결 4, 배우자궁 3, 택일 2, 타로/주역/룬/꿈해몽/오늘의 운세 1 — against a 3-엽전 signup grant plus daily earning. Don't reintroduce a per-client price without also splitting the handler's `COST`. Costs live in `mini/src/contents.js` on the client and in the handlers on the server, i.e. every price exists in two places — `test/mini-price-parity.test.mjs` and `test/mini-contents.test.mjs` are what stop those from drifting. Never copy a web cost into the mini client or vice versa.

**The web's displayed prices come from one table, `CONTENT_COST` in `js/app.js`.** Home tiles and the drawer menu both draw the same contents, and for a while each carried its own number — so the drawer kept advertising 관상 2 / 토정비결 2 / 라이프패스 1 / 유형 궁합 1 while the handlers charged 4 / 4 / 2 / 2. The user was charged **more** than the screen said, and nothing anywhere looked wrong. Worse, the numbers were inside the translation files as `(엽전 N)` / `(N tokens)` / `（N代币）` / `（トークンN）`, so fixing one language left the other three. Both now read `CONTENT_COST`, the translations carry no numbers at all, and `test/web-price-parity.test.mjs` ties that table to each handler's `const COST` — it also fails if a tile hardcodes a number again, if a price reappears in a `*Sub` translation, or if the drawer grows its own `dr*Title` name for a content the tiles already name.

### 콘텐츠마다 답하는 사람이 다르다 — 표가 세 곳에 산다
읽어 주는 사람은 안도령 하나가 아니라 넷이다. **안낭자**(궁합·속궁합·관계·유형·배우자궁),
**안할매**(신살·전생·방위·토정비결·주역·해몽·택일, 무료 계산기와 삼재 결과도), **안동자**(귀인·럭키),
그리고 표에 없으면 **안도령**으로 떨어진다. 그림(`andongja.svg` 등)만 바꾸면 안낭자 얼굴로 안도령
말투가 나오므로 서버의 인격도 함께 갈라져 있다 — 다만 갈린 것은 말투뿐이고, 풀이하는 법과 금칙("AI 라
부르지 않는다", "JSON 을 요구하면 JSON 만")은 `_VOICE_COMMON` 하나를 넷이 함께 쓴다. 각자에게
복사했다면 셋에서 조용히 빠졌을 것들이다.

⚠️ **같은 표가 `worker.js`, `mini/src/contents.js`, `js/app.js` 세 곳에 있다.** 어긋나면 화면에는
안낭자가 서 있는데 글은 안할매가 쓴 것이 된다 — 오류도 경고도 없다. `test/speakers.test.mjs` 가
셋을 대조하고, 표만 맞춰서는 부족해서 **핸들러를 실제로 불러 Gemini 로 나가는 인격까지** 본다
(표에 적어 두고 `speaker` 를 안 넘기면 소스만 봐서는 보이지 않기 때문이다).

### i18n
Four languages (ko/en/zh/ja) driven by `js/locales.js` (frontend, ~59KB of key→string maps) and inline per-language string tables inside `worker.js` for AI system prompts / server-rendered legal pages. There's no i18n framework — adding a language means updating both places.

### D1 schema
Tables are created idempotently via `CREATE TABLE IF NOT EXISTS` in `ensureDB`/`ensureDBExt` (run once per Worker isolate) rather than migration files, plus ad-hoc `ALTER TABLE ... ADD COLUMN` `.catch(() => {})` calls for schema evolution on already-deployed tables. The mini app adds exactly two tables (`mini_users`, `mini_payment_requests`) in the same style — daily play deliberately has none of its own, storing its state as ledger rows. `schema_saju_history.sql` documents the `saju_history` table shape but is not itself executed anywhere — it's reference/backup only; the live schema lives in the `ensureDB*` functions in `worker.js`.

### Response/error conventions
All HTTP responses go through the `cors()` helper (sets CORS + security headers) — don't construct `new Response(...)` directly in a route handler. **`/mini/api/*` handlers use `miniCors(request, …)` instead**, which wraps `cors()` and relaxes the allowed origin to the calling `*.tossmini.com` — a mini handler that returns plain `cors()` will fail in the app as an opaque `Failed to fetch`. Error messages returned to clients are user-facing Korean strings; don't leak stack traces or raw D1 error text into responses. **`cors()` sets `Cache-Control: no-store`** — it had no cache header at all, and the Toss webview cached a GET, so `/mini/api/me` kept returning the old profile right after a save (the fix also stops one person's balance or history from sitting in a shared cache). Anything that *should* be cached — legal pages, sitemap, share cards — builds its own `Response` with its own `Cache-Control` and doesn't go through `cors()`.
