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

`npm test` runs the suite (Node's built-in runner, no framework — `node --test "test/*.test.mjs"`; the quoted glob matters, `node --test test/` fails on Node 24). `npm run check` is the full pre-push pass: syntax check + tests + `wrangler deploy --dry-run`. It does **not** build the mini app — CI does, so if you changed anything under `mini/` run `npm run check:mini` too (that's `npm ci && npm run build` in `mini/`, the same thing CI runs) rather than finding out from a red run.

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
npm run deploy           # ait deploy --profile myan  (프로필 이름 주의, 아래 참고)
```

**`ait deploy` 의 프로필 이름은 `myan` 이지 `default` 가 아니다.** 배포 키는 `~/.ait/credentials`
에 `{"myan": "..."}` 로 저장돼 있는데, CLI 는 `--profile` 이 없으면 `this.profile || this.workspace ||
"default"` 로 `default` 를 찾는다. 없으니 **키가 멀쩡히 있는데도 API 키를 다시 입력하라고 묻고**,
거기서 멈추면 업로드는 일어나지 않는다 — 콘솔에 아무것도 안 올라온 채 성공한 줄 알기 쉽다.
그래서 `package.json` 의 `deploy` 스크립트에 `--profile myan` 을 박아 뒀다. 다른 PC 에서 처음
배포한다면 `npx ait token add myan` 으로 그 이름으로 등록할 것(이름을 안 주면 `default` 로 들어간다).

**It is a separate service, not a second face of the web app.** Accounts and currency are deliberately unshared: a web user and a mini user are different people even if they're the same human, and 엽전 bought in the mini app do not exist on the web. The code states this as a contract rather than an accident (`_LEDGERS`, `test/mini-isolation.test.mjs`), so treat "the same person's balances don't add up across the two" as intended behaviour and don't "fix" it by joining them — if the separation ever should end, that's a product and payments decision, not a refactor.

- **The currency is 엽전 in the mini app.** User-facing strings there say 엽전; the web still says 토큰. Same ledger mechanics, different name — check which client a string belongs to before translating it.
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

**Within one fill level, Korean buckets go first** (`WARM_LANG_ORDER`). Only 117 of the 468 permanent slots are `ko`; the other 351 are en/zh/ja, which on a Korean store are mostly rows nobody opens — free capacity on the old key, real money on the paid one. The order is *count first, language second* on purpose: language-first would let `ko` pile up second and third variants while English never gets a first one. Note the tiebreak looks redundant, because `permanentFortuneSpecs()` happens to emit `ko` first and `Array.sort` is stable — so a behavioural test of the ordering passes even with the comparison deleted. `test/fortune-warm.test.mjs` therefore checks `_warmLangRank` directly *and* asserts the comparator still consults it. Date-scoped content (576 zodiac combos/day) is deliberately left lazy — pre-warming a day's worth would mostly generate rows nobody opens, which on a paid key means paying for them. Per-user features (대운, 이름 풀이, 궁합 시기, 택일, 배우자궁, 토정비결, 상세 풀이, 관상, 꿈해몽, 주역, 천궁도, 운세 모음) call Gemini every time; they can't be cached (the prompt contains the user's chart) and are simply what the service costs.

Gemini failures log via `geminiText` (`console.warn` with status / `finishReason` / `promptFeedback`, never the prompt). Before this, a failure left no trace anywhere in production, which is why "가끔 안 된다" was untraceable. **`geminiText` is not yet universal** — the cached features plus 택일/대운/이름 풀이/궁합 시기 go through it, but a number of handlers still inline their own `fetch` and log nothing on failure. `geminiText` also carries the `_ANDORYEONG_SI` system instruction, the `AbortSignal.timeout`, and `thinkingBudget: 0`, so an inline `fetch` has to repeat all three by hand and silently loses whichever it forgets. Prefer `geminiText` in anything new, and convert an inline site whenever you touch one — passing `maxOutputTokens` explicitly, since only `temperature`/`thinkingConfig` have defaults.

**Every paid handler must refund on exception, not just on a bad response.** The 19 AI features deduct via `accountSpend`, call Gemini, then refund when `!resp.ok || !reading` (any handler that calls `geminiText` checks `!reading` alone, since it returns `''` on a bad response). That branch never runs if `fetch` itself throws (connection reset, timeout, subrequest limit) — control jumps to the outer `catch`, which used to just return 500 with the tokens already gone. They now build a `refund` closure right after the deduction (`refund = () => accountRefund(env, acct, '<feature>', <cost>)`) and call it from both the failure branch and the `catch`. This is also what keeps the charge and the refund using one value. Adding a new paid feature means wiring both sides; `test/refund-on-failure.test.mjs` checks all 19 structurally and will fail if a new one skips it (it asserts the exact count, so adding a paid feature means bumping that number deliberately). Seven of them are also covered at runtime — the test drives the handler with `fetch` throwing, with a 500, and with a 200 carrying an empty body, and asserts the balance is untouched.

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

### i18n
Four languages (ko/en/zh/ja) driven by `js/locales.js` (frontend, ~59KB of key→string maps) and inline per-language string tables inside `worker.js` for AI system prompts / server-rendered legal pages. There's no i18n framework — adding a language means updating both places.

### D1 schema
Tables are created idempotently via `CREATE TABLE IF NOT EXISTS` in `ensureDB`/`ensureDBExt` (run once per Worker isolate) rather than migration files, plus ad-hoc `ALTER TABLE ... ADD COLUMN` `.catch(() => {})` calls for schema evolution on already-deployed tables. The mini app adds exactly two tables (`mini_users`, `mini_payment_requests`) in the same style — daily play deliberately has none of its own, storing its state as ledger rows. `schema_saju_history.sql` documents the `saju_history` table shape but is not itself executed anywhere — it's reference/backup only; the live schema lives in the `ensureDB*` functions in `worker.js`.

### Response/error conventions
All HTTP responses go through the `cors()` helper (sets CORS + security headers) — don't construct `new Response(...)` directly in a route handler. **`/mini/api/*` handlers use `miniCors(request, …)` instead**, which wraps `cors()` and relaxes the allowed origin to the calling `*.tossmini.com` — a mini handler that returns plain `cors()` will fail in the app as an opaque `Failed to fetch`. Error messages returned to clients are user-facing Korean strings; don't leak stack traces or raw D1 error text into responses.
