# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project overview

**Username Extractor** is the production successor to the legacy Python CLI [`extract_usernames`](https://github.com/beyourahi/extract_usernames) (now **retired & archived, read-only**). It extracts Instagram usernames from batches of profile screenshots — including dropping a whole folder of AVIF screenshots, which are normalized to JPEG client-side and streamed up as one chunked job — deduplicates them against a lifetime leads table, and syncs verified results to Notion.

**Stack:** SvelteKit 5 (Svelte 5 runes) + Bun + Tailwind v4 + Better Auth (Google OAuth + One Tap + passkey/biometric) + Cloudflare Workers (D1, R2, KV, Queues, Durable Objects, Workers AI, Analytics Engine). Per-image inference runs on each **user's own Cloudflare account** (bring-your-own, billed to them) via the Workers AI REST API.

The algorithmic core — Levenshtein near-duplicate detection, tier-based confidence scoring, Notion smart dedup, username cleaning — is a verbatim port of the Python implementation. Files in `src/lib/extract/` and `src/lib/notion/dedup.ts` cite line numbers from the original. **Do not change behavior in these modules casually** — any change invalidates the recorded Kimi K2.6 accuracy benchmark.

## Common commands

```bash
bun install
wrangler d1 migrations apply username-extractor --local   # one-time, before first dev run
bun run dev                  # vite dev (Workers bindings via Vite plugin, no full Workers runtime)
bun run preview              # full build + wrangler dev — required to test Queues / DO / AI / scheduled
bun run build                # vite build + scripts/wrap-worker.mjs (see "Composite worker" below)
bun run deploy               # build + wrangler deploy
bun run check                # svelte-kit sync + svelte-check (TS + a11y)
bun run lint                 # prettier --check . && eslint .
bun run format               # prettier --write .
bun run test                 # vitest run (unit suite)
bun run test:watch
bunx vitest run src/lib/extract/__tests__/clean.test.ts   # single test file
bunx vitest run -t "cleans handles"                       # single test by name pattern
bun run benchmark            # Kimi K2.6 accuracy run against checked-in fixtures → docs/benchmark.md (HITS PAID AI, run on demand only)
bun run cf-typegen           # regenerate worker-configuration.d.ts from wrangler.jsonc bindings
bun run db:generate          # Drizzle: emit SQL migration from schema.ts changes
bun run db:check             # Drizzle: validate migration consistency (offline)
bun run db:push              # Drizzle: push schema straight to D1 (bypasses migrations; needs the 3 CLOUDFLARE_* env vars → d1-http driver)
bun run db:migrate:local     # apply migrations to local D1
bun run db:migrate           # apply migrations to remote D1
bun run db:migrate:list      # list applied/pending migrations against local D1
bun run db:studio            # Drizzle Studio (requires the 3 CLOUDFLARE_* env vars, see drizzle.config.ts)
```

`bun run dev` does **not** run a real Workers runtime — Queues, the Durable Object, and `scheduled` only fire under `bun run preview` (which invokes `wrangler dev` against the built worker). For pipeline work, use preview.

## Architecture

### Composite worker (critical to understand)

`@sveltejs/adapter-cloudflare` only emits a `fetch` handler, but this app also needs `queue`, `scheduled`, and a `JobCoordinator` Durable Object export. The build is a two-step dance:

1. `vite build` runs the SvelteKit adapter, producing `.svelte-kit/cloudflare/_worker.js`.
2. `scripts/wrap-worker.mjs` renames that file to `_sveltekit-worker.js` and writes a new `_worker.js` that imports the SvelteKit handler **plus** `queueConsumer`, `scheduledSweep`, and re-exports `JobCoordinator` from `src/lib/server/`.

`wrangler.jsonc` points `main` at the generated `_worker.js`. The wrapper is auto-generated — never edit it. If you add a new top-level Worker handler (e.g. `email`, `tail`), wire it in **both** `src/lib/server/worker-entry.ts` and `scripts/wrap-worker.mjs`.

### Request → job → completion flow

```
POST /api/jobs            createJob() — D1 insert (jobs, job_items), R2 upload, QUEUE.send() per image
   │
   ▼
QUEUE "image-jobs"        max_batch_size 5, max_retries 3, DLQ "image-jobs-dlq"
   │
   ▼
queueConsumer             (src/lib/server/queue/consumer.ts) — one message = one image
   ├─ extractUsernameFromImage  →  runVisionViaRest on the USER's own Cloudflare account (billed to them); model per-user, default @cf/moonshotai/kimi-k2.6
   ├─ cleanUsername / scoreConfidence / classifyStatus / tierOf
   ├─ findSimilarExisting       →  exact + Levenshtein near-dup check against leads
   ├─ UPDATE job_items + INSERT leads (when verified & non-duplicate)
   ├─ syncLeadInline            →  Notion (per-user encrypted token)
   └─ broadcast(message) → JobCoordinator DO
   │
   ▼
JobCoordinator DO         per-job, idFromName(jobId); WebSocket hibernation API; replays from D1 on reconnect via ?last_event_id=
   │
   ▼
GET /api/jobs/[id]/ws     browser subscribes; renders item.started / item.completed / item.notion_updated / job.completed
```

**D1 is the source of truth.** The DO is a best-effort broadcast relay — if it crashes, the consumer keeps writing and the UI resyncs on reconnect. Never use the DO for durable state.

**Two upload modes feed this pipeline.** Single/small batches POST images inline to `/api/jobs` (`createJob` uploads + enqueues at create time). Folder drops use **chunked multi mode**: `POST /api/jobs` creates an empty job with `upload_complete=0`, the client streams images in chunks to `POST /api/jobs/[id]/items` (`appendItemsToJob`), then `POST /api/jobs/[id]/finalize` sets `upload_complete=1` to unblock `maybeFinalizeJob`. The `upload_complete` flag exists to gate finalization — without it, an early chunk whose items all finish processing during upload would mark the whole job done before later chunks land. Multi mode reserves the daily quota up front against the client-declared total. AVIF/BMP/TIFF are normalized to JPEG **client-side** via canvas (`src/lib/utils/normalizeImage.ts`) before upload, since Workers AI can't decode them.

The discriminated `Message` union in `src/lib/types/messages.ts` is the canonical WebSocket wire format. Snake_case keys are intentional (matches the PRD spec; the client renders them directly). Older `JobItemUpdate` / `JobStreamMessage` shapes are kept for in-progress UI compatibility — new code targets `Message`.

### Auth: Better Auth (Google OAuth + One Tap + passkey)

`src/hooks.server.ts` is the single auth chokepoint (replaces the former Cloudflare Access gate):

- The Better Auth instance is built **per request** in `createAuth` (`src/lib/server/auth.ts`) — Workers has no long-lived module state and the D1 binding arrives per request. **Sign-in = Google OAuth + Google One Tap (`oneTap()`) + passkey/WebAuthn platform biometrics** (`@better-auth/passkey` — Face ID / Touch ID / Windows Hello / Android fingerprint **only**; no roaming security keys); `emailAndPassword` stays disabled. The browser client is `src/lib/auth-client.ts`. Auth routes are mounted at **`/auth`** (`basePath: "/auth"`, NOT the Better Auth default `/api/auth`), so the derived OAuth callback is `https://username-extractor.dropoutstudio.co/auth/callback/google` — this MUST match the redirect URI registered in Google Console. The server `basePath` and the client `basePath` (in `auth-client.ts`) must stay in sync.
- **Passkeys (`@better-auth/passkey`) = platform device biometrics only (Face ID / Touch ID / Windows Hello / Android fingerprint; no roaming security keys).** `rpID`/origin are derived from `BETTER_AUTH_URL` (so dev/preview/prod each resolve correctly); `authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" }` gates registration to platform authenticators and forces the biometric/PIN gesture (registration-time only — existing credentials keep working, no migration); credentials persist in the `passkeys` D1 table; registration happens in `/settings`. **Google One Tap** (`oneTap()` server + `oneTapClient` browser) needs the browser-exposed `PUBLIC_GOOGLE_CLIENT_ID` — empty → One Tap stays off and the standard Google button still works.
- `handle` resolves the session → `event.locals.user/session` plus the preserved `event.locals.userId/userEmail` contract (so the protected routes are unchanged). **Auth is optional, not a wall** (like the sibling tools): central gate sends unauthenticated browser requests to _gated_ routes → `303 /login`; `/api/*` → `401`. Public surface = `/` (browsable guest homepage) + `/login` + `/auth/*` (Better Auth's own routes). The homepage shows the upload UI to guests with a "Sign in to run" prompt; `/jobs`, `/leads`, `/settings`, and every other `/api/*` route stay gated — actually running an extraction still requires sign-in + a connected Cloudflare account (`isPublicPath` in `hooks.server.ts` is the allowlist).
- Rate limiting is two-tier: Better Auth's **D1-backed** limiter (`rate_limits` table, 20/60s) on `/auth/*`, plus an app-level in-memory 5/min on `/api/notion/dedup` + `/api/import/legacy`. A defensive CSP + security-header set is stamped on **every** response (including 401/redirect short-circuits).
- Dev/preview bypass: `E2E_BYPASS_AUTH=1` (or `true`) in `.dev.vars` **only** (never `wrangler.jsonc`) synthesizes an `e2e-test-user` so local runs skip the Google round-trip.
- Production: self-serve Google login, served only at `username-extractor.dropoutstudio.co`; the public `*.workers.dev` URL is disabled (`workers_dev: false`, `preview_urls: false`).

All authenticated route handlers read `event.locals.userId` — never trust a userId from the request body.

### Notion integration

User Notion tokens are encrypted at rest using AES-GCM keyed by `NOTION_TOKEN_ENCRYPTION_KEY` (base64 32 bytes). Encryption/decryption live in `src/lib/server/crypto.ts`. Two sync paths:

- **Inline** (`src/lib/server/notion/sync-one.ts`): called by the queue consumer for each verified lead when `notion_auto_sync` is on.
- **Smart dedup** (`src/lib/notion/dedup.ts` + `/api/notion/dedup`): post-job pass that scans the user's Notion DB, groups near-duplicates, and archives losers. Same Levenshtein logic as in-pipeline dedup.

### Per-user Cloudflare inference (bring-your-own account)

Per-image extraction does **not** use the owner's bound `env.AI`. It runs on the **end user's own Cloudflare account** over the Workers AI REST API (billed to them):

- Creds + selected model live encrypted in `user_settings` (`cloudflare_token_encrypted`, `cloudflare_account_id`, `cloudflare_model`) — same AES-GCM layout/key as the Notion token. Resolved per-user via `resolveCloudflareCreds` (`src/lib/server/ai/cloudflare-config.ts`).
- `runVisionViaRest` (`src/lib/server/ai/run-rest.ts`) POSTs `/accounts/{id}/ai/run/{model}`; `listVisionModels` GETs `/ai/models/search` for the settings picker (KV-cached 24h per account). Default model: `@cf/moonshotai/kimi-k2.6` (`DEFAULT_VISION_MODEL`, benchmark-validated).
- A connected account is **mandatory** — `createJob` throws `CloudflareNotConnectedError` up front, and the consumer re-checks per item.
- Failures throw `CfInferenceError` with `kind`: `auth` / `model_unavailable` → fail the item (no retry — a retry just re-burns the rejection); `rate_limit` → revert item to `pending` and requeue with backoff; `transport` → one inline retry, then fail. User-facing strings in `src/lib/server/ai/errors.ts`.
- Default daily quota is now **0 = unlimited** (billing sits with the user); a user may still set a positive `daily_image_quota` as a self-serve kill-switch.

The legacy `env.AI` + AI-Gateway path (`src/lib/server/ai/gateway.ts#runVisionWithGateway`) is retained but **no longer used per-item**; only its `extractResponseText` output-normalizer still runs.

### Persistence layout

- **D1 (`username-extractor`)** — Better Auth tables (`users`, `sessions`, `accounts`, `verifications`, `passkeys`, `rate_limits` — snake_case + plural, `usePlural: true`) plus app tables (`user_settings`, `jobs`, `job_items`, `leads`). Schema in `src/lib/server/schema.ts` (Drizzle). All timestamps are Unix epoch ms in `INTEGER` columns (SQLite has no native datetime). Migrations live in `migrations/`: baseline `0000_elite_mandarin.sql` + `0001_tough_maggott.sql` (adds the `passkeys` table). Non-obvious columns: `jobs.upload_complete` (gates chunked-upload finalization), `user_settings.dedup_keep_strategy` (`best`/`oldest`/`newest`), and `user_settings.cloudflare_token_encrypted`/`cloudflare_account_id`/`cloudflare_model` (the BYO Cloudflare creds).
- **R2 (`username-extractor-uploads`)** — raw screenshot bytes. Keys are namespaced per job. A nightly cron (`0 3 * * *`) in `src/lib/server/cron/sweep.ts` reaps stale objects.
- **KV (`username_extractor_kv`)** — short-lived caches (Instagram URL validator + per-account `cf-models:<accountId>` vision-model lists, 24h TTL).
- **Workers AI** — per-item inference runs on the **user's own** Cloudflare account via REST (see "Per-user Cloudflare inference" above), default model `@cf/moonshotai/kimi-k2.6`. The bound `env.AI` binding remains declared but is no longer used per-item.
- **Analytics Engine (`username_extractor_job_metrics`)** — per-item / per-job metrics emitted from `src/lib/server/analytics.ts`.

### Route map

| Path                                     | Purpose                                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/`                                      | Upload + start new job (public — guests can browse; running requires sign-in)                                    |
| `/login`                                 | Google sign-in + One Tap + passkey/biometric (Better Auth); "Back to homepage" link to `/`                       |
| `/jobs`                                  | Job history                                                                                                      |
| `/jobs/[id]`                             | Live job progress (WebSocket via `/api/jobs/[id]/ws`)                                                            |
| `/leads`                                 | Lifetime verified leads                                                                                          |
| `/settings`                              | Notion config + Cloudflare account/model picker + passkey registration + diagnostics defaults                    |
| `/api/jobs` (`POST` create / `GET` list) | Job CRUD; `POST` `multi` mode creates an empty job for chunked folder upload                                     |
| `/api/jobs/[id]/items` (`POST` / `GET`)  | `POST` append an upload chunk (`appendItemsToJob`); `GET` list items                                             |
| `/api/jobs/[id]/items/[item_id]/retry`   | Per-item retry                                                                                                   |
| `/api/jobs/[id]/finalize`                | Mark chunked upload done (`upload_complete=1`) → unblocks finalization                                           |
| `/api/jobs/[id]/cancel`                  | Cancel a running job (broadcasts `job.cancelled`)                                                                |
| `/api/jobs/[id]/ws`                      | WebSocket upgrade → JobCoordinator DO                                                                            |
| `/api/leads` (`GET`)                     | CSV export of the filtered leads view (text/csv attachment)                                                      |
| `/api/leads/[id]/{archive,notion-sync}`  | Manual lead actions                                                                                              |
| `/api/notion/dedup`                      | Smart dedup vs Notion DB; honors `keep_strategy` + `dry_run` from JSON body                                      |
| `/api/import/legacy`                     | One-shot import from CLI `verified_usernames.md` or existing Notion DB                                           |
| `/api/r2/[...key]`                       | Authenticated R2 byte access (debug/preview)                                                                     |
| `/api/debug/[job_id]/[stem]`             | Diagnostic raw model response, gated by `diagnostics` flag on the job                                            |
| `/auth/*`                                | Better Auth handler — Google sign-in/out + OAuth callback (`basePath: "/auth"`; dispatched in `hooks.server.ts`) |
| `/api/cf/models` (`GET`)                 | Vision models on the user's connected CF account; KV-cached 24h, `?refresh=1` forces re-fetch                    |

## Code style

- **Indentation:** 4 spaces (Prettier `tabWidth: 4, useTabs: false`).
- **Quotes:** double. **Trailing commas:** none. **Print width:** 120.
- **Svelte 5 runes only** — `$state`, `$derived`, `$props()`, `$bindable`, `$effect`. Do not use legacy reactivity (`$:`, stores in components).
- **Imports:** use `$lib/...` aliases inside `src/`. Never use deep relative paths (`../../../`) from routes.
- **Server-only code** lives under `src/lib/server/` (enforced by SvelteKit). Client imports of anything in this tree will fail at build.
- **Snake_case** is intentional on the WebSocket wire format and Notion sync payloads — they match the PRD and the legacy CLI's output. Do not rename these to camelCase.
- Tests are co-located in `__tests__/` subdirectories next to the module under test (e.g. `src/lib/extract/__tests__/clean.test.ts`). Vitest is configured with `environment: "node"`.
- **Follow the Dropout DS guidelines.** This project vendors `@dropout/ds` at `src/lib/ds/`. The followable law for all UI — tokens, typography, layout shells, the shadcn-svelte primitive layer (pinned `components.json` preset + blessed kit), overlay/glass tokens, motion, a11y — is **`~/Desktop/projects/dropout-design-system/GUIDELINES.md`**. Theme via tokens; never recolor a component; components before custom markup.
- **Design system:** the UI runs on the **vendored Dropout DS** at `src/lib/ds/` (imported via `$lib/ds`: `Cta`, `Heading`, `Eyebrow`, `Input`, `Tile`, `cn`, + base-class consts `inputBase`/`labelBase`/`tileBase`/`pillBase`). **Never hand-edit `src/lib/ds/`** — edit upstream and re-vendor with `bun run sync-ds` (or the global `dropout-ds-sync`); `.prettierignore` excludes `src/lib/ds` so `bun run format` leaves it byte-identical to upstream (eslint does **not** ignore it). App is **dark-only** via `app.html`'s `class="dark"` (no `<ModeWatcher>` — the DS `:root` is light, so the class pins dark). DS tokens (ink ramp, `signal`, `hair`, type scale, Google Sans fonts, `--ease`, shell vars) come from `ds/styles/tokens.css`; `src/app.css` only adds the **tool layer** — the mint `--brand` accent + the functional `--status-*`/`--tier-*` colors (OKLCH) — and the bespoke keyframe utilities (`scan-line`/`shimmer`/`spin`/`status-dot-pulse`/`slide-in`/`fade-in`). Read colors from these tokens; never hardcode hex/hsl/oklch in markup.
- **Design primitives in `src/lib/components/`** — `Button`, `TextInput`, `Field`, `Switch`, `Spinner`, `Badge`, `TierBadge`, `NotionBadge`, `Eyebrow`, `HeroHeading`, `PageHeader`, `SectionTabs`, `Footer`, `User`, etc. — are DS-styled wrappers/compositions. Reuse them before authoring bespoke styled elements. **App chrome matches the sibling tools** (day-zero / invoice-generator / order-processor): there is **no top nav bar** — `User` is a **fixed floating top-right** cluster (avatar hover-pill + Settings + Sign-out; collapses to a dialog on mobile), and `+layout.svelte` renders a **shared wordmark `HeroHeading` + `SectionTabs`** at the top of the three primary routes (`/`, `/jobs`, `/leads`) with the active tab's content below. `SectionTabs` is the route-based section switcher (anchor links + an animated sliding pill, ported from the dropout-studio pricing tabs); active state derives from `page.url.pathname`. Drill-downs (`/jobs/[id]`), `/settings`, and `/changelog` are focused views with their own back affordance (no hero/tabs).

## Required env / bindings

Local (create `.dev.vars` — there is no `.example` template in the repo):

| Key                           | Notes                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`          | Session signing secret — `openssl rand -base64 32`                                                                 |
| `BETTER_AUTH_URL`             | Base URL — `http://localhost:5173` locally (prod value is a public var in `wrangler.jsonc`)                        |
| `GOOGLE_CLIENT_ID`            | Google OAuth client id                                                                                             |
| `GOOGLE_CLIENT_SECRET`        | Google OAuth client secret                                                                                         |
| `E2E_BYPASS_AUTH`             | `1`/`true` → synthesize an `e2e-test-user` and skip Google (local/preview only)                                    |
| `NOTION_TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` — encrypts BOTH the Notion token and the BYO Cloudflare token                            |
| `PUBLIC_GOOGLE_CLIENT_ID`     | _Optional, public_ — browser Google client id that enables One Tap; empty → One Tap off, Google button still works |

Production secrets (`wrangler secret put`):

- `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (required — Better Auth Google OAuth)
- `NOTION_TOKEN_ENCRYPTION_KEY` (required — encrypts the Notion and Cloudflare tokens in D1)
- `BETTER_AUTH_URL` is set as a public `vars` entry in `wrangler.jsonc` (`https://username-extractor.dropoutstudio.co`), not a secret
- `PUBLIC_GOOGLE_CLIENT_ID` is a public `vars` entry in `wrangler.jsonc` (empty by default; set it per-deploy to enable One Tap), not a secret
- `AI_GATEWAY_SLUG`, `AI_GATEWAY_TOKEN` (optional — legacy `env.AI` gateway path; unused by per-item REST inference)

Bindings (declared in `wrangler.jsonc`): `DB` (D1), `R2`, `KV`, `AI` (declared but unused per-item — inference is BYO over REST), `QUEUE` (producer for `image-jobs`, consumer batch 5, retries 3, DLQ `image-jobs-dlq`), `JOB_COORDINATOR` (DO), `ANALYTICS`, `ASSETS`.

## Gotchas

- **Never create branches.** Workspace-wide rule from `~/Desktop/projects/CLAUDE.md`: parallel work uses `git worktree add ../username-extractor-<feature>` and commits land on `main`.
- **`bun run dev` ≠ Workers runtime.** Use `bun run preview` whenever you touch the queue consumer, the DO, the cron sweep, or the BYO-Cloudflare REST inference path.
- **Auth tables are Better Auth's.** `users`/`sessions`/`accounts`/`verifications`/`passkeys`/`rate_limits` must stay snake_case + plural (`usePlural: true` in `auth.ts`) — renaming silently breaks the Drizzle adapter. Auth is built per-request in `hooks.server.ts`; set `E2E_BYPASS_AUTH=1` in `.dev.vars` to skip the Google round-trip locally.
- **Inference is BYO-Cloudflare, not `env.AI`.** Per-item extraction calls the user's own account over REST (`run-rest.ts`), billed to them; a job won't start unless an account is connected (`createJob` throws `CloudflareNotConnectedError`). `CfInferenceError.kind` drives ack-vs-retry in the consumer (auth/model_unavailable → fail item, rate_limit → requeue, transport → one inline retry).
- **`wrap-worker.mjs` is silent if it works.** If `_worker.js` post-build looks like the SvelteKit-generated file (no `import { queueConsumer }`), the wrap step didn't run — check `bun run build` output for `[wrap-worker]`.
- **Schema changes need two steps:** edit `src/lib/server/schema.ts`, then `bun run db:generate` to emit a migration, then `bun run db:migrate:local` (and `db:migrate` for prod). Don't hand-edit files in `migrations/`.
- **D1 caps bound parameters at ~100/query.** `job_items` rows bind ~8 params each, so inserts are sub-batched at 10 rows/insert (`INSERT_BATCH` in `src/lib/server/jobs/create.ts`) — a single INSERT of a large chunk overflows the limit. Respect this for any new bulk insert.
- **Image normalization is client-side.** AVIF/BMP/TIFF are converted to JPEG via canvas in `src/lib/utils/normalizeImage.ts` before upload because Workers AI can't decode AVIF; web-safe formats pass through. The server trusts already-decodable bytes — don't re-add server-side decode.
- **`worker-configuration.d.ts` is generated.** After changing `wrangler.jsonc` bindings, run `bun run cf-typegen` to refresh the ambient types.
- **CSRF trustedOrigins** in `svelte.config.js` includes the dev ports and the production hostname `username-extractor.dropoutstudio.co`. Add new hostnames here when binding additional routes.
- **WebSocket reconnect contract:** the client passes `?last_event_id=<n>` to `/api/jobs/[id]/ws`; the DO replays missed completed items from D1. Don't bypass this for "snapshot" loads — it's the resync path.
- **CPU limit raised to 300s** (`limits.cpu_ms` in `wrangler.jsonc`) for the queue consumer's worst-case batch. Keep an eye on this if you add expensive per-item work.
- **Default Workers AI model is `@cf/moonshotai/kimi-k2.6`** (`DEFAULT_VISION_MODEL`) — now user-selectable per account via the settings picker. The PRD spec's `@cf/moonshot/...` (no `ai`) is a typo; don't copy it.
- **Benchmark is paid and manual.** `bun run benchmark` invokes Workers AI per fixture and writes `docs/benchmark.md`. Intentionally not in CI. Any change to `src/lib/extract/` or `src/lib/notion/dedup.ts` should be followed by a manual re-run + commit of the updated report.

For Cloudflare work, prefer the installed Cloudflare skills and Code Mode MCP over your own knowledge.
