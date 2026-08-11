# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

M;Y 安 (마이안) — an AI-powered Saju (四柱, Korean/Chinese fortune-telling) reading web service, single-operator (1인 운영). Cloudflare Workers backend, vanilla JS frontend, plus a separate Expo/React Native mobile client. Production: https://myan.riger7070.workers.dev

## Git workflow: push directly to `main`, with one carve-out

This is a solo-owner repo (`riger7070-hub/myan`) with no staging environment. `.github/workflows/deploy-worker.yml` deploys straight to production on every push to `main`, so a pushed change ships live within minutes. CI gates it with a syntax check → `npm test` → `wrangler deploy --dry-run` before deploying, which catches a broken parse or a failing contract — but nothing exercises the live D1, Gemini, or Toss, so a green run is not proof the change behaves correctly in production.

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

`npm test` runs the suite (Node's built-in runner, no framework — `node --test "test/*.test.mjs"`; the quoted glob matters, `node --test test/` fails on Node 24). `npm run check` is the full pre-push pass: syntax check + tests + `wrangler deploy --dry-run`.

Tests import internals through `test/load-worker.mjs`, which copies `worker.js` to `test/.tmp/*.mjs` and appends an `export {}` — **never leave test-only exports in the deployed `worker.js`**. `test/d1-sqlite.mjs` gives a handler a real D1-shaped database: it runs the actual DDL from `worker.js` under `node:sqlite` and yields a macrotask tick per query. That tick is the whole point — D1 is a network hop, and wrapping synchronous SQLite in `async` alone lets one request run to completion before another resumes, so concurrency bugs quietly pass. Use it whenever you touch a handler where two simultaneous requests would matter.

The suite does not cover Gemini, Toss, or push delivery. For those, and after anything touching Saju math, still verify by hand: run a reading for a fixed birth date before and after and confirm the four pillars (年/月/日/時) are identical (the golden-value test covers 10 dates but not your specific case), check the token balance display, and exercise the Toss flow with test keys.

When adding a regression guard, break the code on purpose first and confirm the test actually fails. A guard that only ever passes is worse than none — it reads as coverage.

### Native app (`myan-native/`)
Expo/Expo Router app that is **a WebView shell around the deployed site**, not a second client. `app/index.jsx` loads `https://myan.riger7070.workers.dev` in a `WebView` and adds only what a browser can't do: native Google Sign-In (bridged through `window.__nativeGoogleToken`), Android back-button handling, and opening external links. **A new web feature therefore needs no porting — it ships to the app the moment it ships to the web.**

The whole app is `app/_layout.jsx` + `app/index.jsx`. There is no second copy of the reading logic to keep in sync — `myan-native/src/*.js` (an unused `api.js`/`locales.js`/`saju.js` set left over from the first commit, imported by nothing) was deleted for that reason. If you find yourself editing a Saju or i18n file under `myan-native/`, you are in the wrong place. `dist/` and `.expo/` there are local build output and are gitignored, not part of the repo.

Not part of the web deploy pipeline — the app only changes when you rebuild it with EAS.
```bash
cd myan-native
npm install
npx expo start
```

## Architecture

### Backend: one Worker, one file
`worker.js` is a single Cloudflare Worker with a manual `fetch(request, env)` route table (no framework) covering auth, chat/AI, payments, admin, push, and several side-quest features (promo QR, referrals, streaks, pudding fortune QR). Static assets (the entire repo root except `worker.js`) are served through the `SITE_ASSETS` binding (`[assets]` in `wrangler.toml`, `run_worker_first = true` — the Worker runs *before* asset serving so it can inject security headers and `window.ENV` into `index.html`). Because assets are Worker-first, don't assume any static file bypasses `worker.js`.

### Data model: `payment_requests` is an append-only token ledger, not a balance column
There is no `tokens` balance field anywhere. Balance = `SUM(tokens) WHERE status='approved'` over `payment_requests`, where a purchase/grant is a positive row and a spend is a negative row. **Always grant or deduct by inserting a new row — never `UPDATE ... SET tokens = tokens + N`.** An `UPDATE` matches *every* row for that `user_email`, so it multiplies the grant by however many payment rows the user already has. Conditional/atomic spends use a single `INSERT ... SELECT ... WHERE (SELECT SUM(tokens) ...) >= cost` so concurrent requests can't double-spend (see the `/chat` and `/chat-detail` handlers for the pattern). `handleStreakCheckin`, `handleReferralClaim`, and `handleUngiGiveTokens` used to violate this (`UPDATE payment_requests SET tokens = tokens + N WHERE user_email = ?`, reproducing a token-inflation bug) — this was fixed to the INSERT-row pattern; if you ever see that `UPDATE` shape reappear anywhere in the file, it's a regression.

**A `SELECT`-then-`INSERT` guard is not a guard.** Spends are atomic, but *grants* were all written as "SELECT whether they already got it → `await` → INSERT". D1 is a network round trip, so two requests that arrive together both pass the check and both get paid (double-tap, retry on a slow connection, two tabs, an offline queue replaying). This was live in five places at once — signup grant, local-token migration, the 7-day streak bonus, promo claim, and the one-time dynamic promo code (where *two different accounts* could each redeem the same code). The rule now: **a once-per-account or once-per-day grant must derive its `payment_requests.id` from what makes it unique** (`signup_${email}`, `streak_${email}${'_'}${today}`, `promo_${email}_${CODE}`) **and insert with `INSERT OR IGNORE`**, so the PRIMARY KEY — not a prior read — is what enforces "once". Consuming a single-use code uses a conditional `UPDATE ... WHERE used_at IS NULL` and checks `meta.changes`, the same shape `handleReferralClaim` uses. `test/grant-idempotency.test.mjs` and `test/streak-bonus.test.mjs` fire each handler twice concurrently and will fail if this regresses.

### The Gemini rate limit is the binding constraint — cache anything that isn't per-user
Measured against production (2026-08-09): 12 sequential readings all succeeded, but **5 concurrent requests all failed** (~6.4s each, 422 with the token correctly refunded), and rapid retries were rejected in 0.7s. All 19 AI features share one `gemini-2.5-flash` key at roughly 10 RPM, so the app fails under exactly the traffic an app-store listing would bring. This is not a per-feature bug — it looks like "some features don't work" because it depends on timing.

Some prompts contain **no user data at all**. Those go through `cachedFortune(env, bucket, generate)` (D1 table `fortune_cache`, `id = bucket#variant`):

| feature | bucket | count |
|---|---|---|
| 타로 / 룬 / 유형궁합 | no date — permanent | 624 / 192 / 100 |
| 띠·별자리 / 럭키 / 라이프패스 | includes `_kstYmd()` | 576 / 4 / 48 per day |

Four rules hold this together:
- **A date-scoped bucket and the date inside its prompt must roll over at the same instant.** Those three prompts embed `ilchin()`'s 오늘의 오행, so if the two disagree, one bucket spans two different 일간 and whichever request lands first pins its day's text for everyone else. That happened: `ilchin()` used the runtime's local midnight (UTC in the Worker, i.e. 09:00 KST) while the bucket used KST midnight, so a request between 00:00 and 09:00 KST cached text built on *yesterday's* element and served it for the rest of the KST day. Everything is on one KST axis now — `_kstYmd()` for both — so just don't build a date out of runtime-local time (`new Date().setHours(...)`, `getFullYear()`, …); in the Worker that silently means UTC. `test/fortune-bucket-date.test.mjs` asserts `ilchin()` is constant within a bucket, under a shim that forces UTC-local semantics, because on a KST dev machine the plain test cannot see the difference.
- **The token deduction still happens per request.** The cache skips the Gemini call, not the charge. A cache hit has no failure path, so no refund.
- **A D1 lookup alone is not enough.** D1 is a network hop, so five concurrent cold requests all miss and all call Gemini — the original bug, reproduced behind a cache. `_fortuneInflight` (in-isolate `Map` of in-flight promises) coalesces them; `test/fortune-cache.test.mjs` fires 5 at once and fails if the count isn't 1.
- **The cron pre-warm and the handler must build the identical bucket and prompt.** Both call `tarotSpec`/`runeSpec`/`typeCompatSpec` — never inline a bucket string in one of those three handlers, or the cron fills rows nobody reads while users keep paying the Gemini call, and nothing on screen looks wrong. `test/fortune-warm.test.mjs` checks this structurally.

`warmFortuneCache` runs from the existing daily cron at a deliberately slow 30 entries × 7s (well under the rate limit — pre-warming must never crowd out live requests), filling the emptiest buckets first; `purgeStaleFortunes` drops only the date-scoped buckets. Date-scoped content (576 zodiac combos/day) is left lazy — pre-warming it is not feasible under this quota. Per-user features (대운, 이름 풀이, 궁합 시기, 택일, 토정비결, 상세 풀이, 관상, 꿈해몽, 주역, 천궁도, 운세 모음) still call Gemini every time and remain exposed to the limit.

Gemini failures log via `geminiText` (`console.warn` with status / `finishReason` / `promptFeedback`, never the prompt). Before this, a failure left no trace anywhere in production, which is why "가끔 안 된다" was untraceable. **`geminiText` is not yet universal** — the cached features plus 택일/대운/이름 풀이/궁합 시기 go through it, but a number of handlers still inline their own `fetch` and log nothing on failure. `geminiText` also carries the `_ANDORYEONG_SI` system instruction, the `AbortSignal.timeout`, and `thinkingBudget: 0`, so an inline `fetch` has to repeat all three by hand and silently loses whichever it forgets. Prefer `geminiText` in anything new, and convert an inline site whenever you touch one — passing `maxOutputTokens` explicitly, since only `temperature`/`thinkingConfig` have defaults.

**Every paid handler must refund on exception, not just on a bad response.** The 19 AI features deduct via `accountSpend`, call Gemini, then refund when `!resp.ok || !reading` (any handler that calls `geminiText` checks `!reading` alone, since it returns `''` on a bad response). That branch never runs if `fetch` itself throws (connection reset, timeout, subrequest limit) — control jumps to the outer `catch`, which used to just return 500 with the tokens already gone. They now build a `refund` closure right after the deduction (`refund = () => accountRefund(env, acct, '<feature>', <cost>)`) and call it from both the failure branch and the `catch`. This is also what keeps the charge and the refund using one value. Adding a new paid feature means wiring both sides; `test/refund-on-failure.test.mjs` checks all 19 structurally and will fail if a new one skips it (it asserts the exact count, so adding a paid feature means bumping that number deliberately). Seven of them are also covered at runtime — the test drives the handler with `fetch` throwing, with a 500, and with a 200 carrying an empty body, and asserts the balance is untouched.

### Auth: two token types flow through one verifier — every authenticated handler must use it
- Google ID tokens (from Google Sign-In) are verified against `oauth2.googleapis.com/tokeninfo`.
- The app's own session tokens are `HS256` JWTs signed/verified with `hmacSign`/`hmacVerify` (`createSessionToken` / `verifySessionToken`), keyed off `SESSION_SECRET`.
- `getEmailFromToken(idToken, env)` transparently dispatches to whichever of the two a given bearer token is, and is the **only** sanctioned way to turn a request into a trusted email. `handlePromoClaim` used to decode the JWT payload itself (`JSON.parse(atob(token.split('.')[1]))`) with no signature check — anyone could forge an arbitrary `email` and claim promo tokens as that user. It's now routed through `getEmailFromToken`. If you ever see raw `atob(token.split('.')[1]))`-style decoding on an Authorization header anywhere, that's the same bug — replace it with `getEmailFromToken`.

### Admin auth is `email === ADMIN_EMAIL`; kiosk/counter features use PIN secrets, not constant-time comparison
`isAdmin(request, env)` checks the verified email against `ADMIN_EMAIL`. Separately, several kiosk/counter features (`/api/admin/ungi/give-tokens`, `/api/promo/generate`, `/promo-display`, `/pudding-qr-batch` flows) gate on a short numeric PIN compared with plain `===`/`!==` (not constant-time — acceptable here since these are low-value, rate-limited/IP-gated flows, but don't reuse this pattern for anything higher-stakes). `UNGI_PIN`, `CAFE_STAFF_PIN`, and `PROMO_ADMIN_PIN` are read from `env.*` (set via `wrangler secret put <NAME>`, see `wrangler.toml`'s comment block) with **no hardcoded fallback** — if a secret isn't set, that PIN route always rejects. They used to be hardcoded literals (`'5984'`/`'7777'`/`'9999'`) committed to this (public) repo; if you ever see a bare string literal compared against `pin`/`adminPin` again, move it back to an `env.*` secret.

`env.MASTER_IP` follows the same rule for a different kind of bypass: it is the one IP that skips the guest trial's once-per-day limit in `handleGuestChat`. It was a hardcoded literal too — the owner's real address, in a public repo — and now has no fallback, so an unset secret just means nobody gets the exemption. `test/guest-limit.test.mjs` fails on any dotted-quad literal left in `worker.js`.

### Saju calculation exists in two independent places — keep them in sync deliberately
- **Backend** (`worker.js`, `computeSaju()`, built on the `lunar-javascript` package): the authoritative calculation, solar-term (절기) aware, used for the actual AI-authored reading and for `saju_history`.
- **Frontend** (`js/saju-engine.js` `calcSajuElements()`, and `ilchin()` duplicated in both `js/constants.js` and `worker.js`): a simplified client-side approximation used only for the instant gauge/preview UI before the real reading loads, explicitly documented in-code as "절기 미반영 간략화" (solar terms not applied). It is expected to occasionally disagree with the backend by a day/pillar near solar-term boundaries.
- `ilchin()` (today's day-pillar/five-element "energy of the day") is copy-pasted verbatim in `worker.js` and `js/constants.js`. If you change one, change the other, or the daily-energy text shown on the client will contradict what the backend used to generate the reading. `test/ilchin-kst.test.mjs` now enforces this instead of trusting the note: it strips comments and whitespace from both copies and fails if the calculation differs.
- **`ilchin()` rolls the day over at KST midnight, and must not read runtime-local time.** It used `new Date().setHours(0,0,0,0)`, which made "today" depend on where the code ran — 09:00 KST in the Worker (local = UTC), the user's own midnight in the browser. A Korean user between 00:00 and 09:00 KST saw the client's element gauge and the paid AI text naming different elements; a user abroad disagreed with both. It's now computed from `Date.now()` on a KST axis, anchored so 2023-01-01 (KST) = 44 — the value a Korean browser already showed, which `test/ilchin-kst.test.mjs` pins with a golden table for 10 dates. Note this makes the boundary agree with `_kstYmd()`, which is why the cache bucket can share it. If you ever touch this function, run that test under both `TZ=Asia/Seoul` and `TZ=UTC`: several of its guards can only fail in one of the two.

### Token economy quick reference
Solo reading = 1 token, Duo (compatibility) = 2 tokens, detail/상세 풀이 = 2 tokens, 택일 = 2 tokens, 대운 = 3 tokens, 이름 풀이 = 2 tokens, 궁합 시기 = 3 tokens; most of the side features are 1. Token cost variables are read once and reused for both the deduction and any refund path (Gemini call failure ⇒ automatic refund insert) — when adding a new paid feature, keep the same variable for both sides so a refund never mismatches the original charge.

### i18n
Four languages (ko/en/zh/ja) driven by `js/locales.js` (frontend, ~59KB of key→string maps) and inline per-language string tables inside `worker.js` for AI system prompts / server-rendered legal pages. There's no i18n framework — adding a language means updating both places.

### D1 schema
Tables are created idempotently via `CREATE TABLE IF NOT EXISTS` in `ensureDB`/`ensureDBExt` (run once per Worker isolate) rather than migration files, plus ad-hoc `ALTER TABLE ... ADD COLUMN` `.catch(() => {})` calls for schema evolution on already-deployed tables. `schema_saju_history.sql` documents the `saju_history` table shape but is not itself executed anywhere — it's reference/backup only; the live schema lives in the `ensureDB*` functions in `worker.js`.

### Response/error conventions
All HTTP responses go through the `cors()` helper (sets CORS + security headers) — don't construct `new Response(...)` directly in a route handler. Error messages returned to clients are user-facing Korean strings; don't leak stack traces or raw D1 error text into responses.
