# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project overview

**Username Extractor** is the production successor to the legacy Python CLI [`extract_usernames`](https://github.com/beyourahi/extract_usernames) (now **retired & archived, read-only**). It extracts Instagram usernames from batches of profile screenshots — including dropping a whole folder of AVIF screenshots, which are normalized to JPEG client-side and streamed up as one chunked job — deduplicates them against a lifetime leads table, and syncs verified results to Notion.

**Stack:** SvelteKit 5 (Svelte 5 runes) + Bun + Tailwind v4 + Cloudflare Workers (D1, R2, KV, Queues, Durable Objects, Workers AI, Analytics Engine).

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
bun run db:push              # Drizzle: push schema directly to D1 (dev shortcut, bypasses migrations)
bun run db:migrate:local     # apply migrations to local D1
bun run db:migrate           # apply migrations to remote D1
bun run db:studio            # Drizzle Studio (requires CLOUDFLARE_* env vars, see drizzle.config.ts)
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
   ├─ extractUsernameFromImage  →  env.AI.run('@cf/moonshotai/kimi-k2.6') via AI Gateway when configured
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

The discriminated `Message` union in `src/lib/types/messages.ts` is the canonical WebSocket wire format. Snake_case keys are intentional (matches the PRD spec; the client renders them directly). Older `JobItemUpdate` / `JobStreamMessage` shapes are kept for in-progress UI compatibility — new code targets `Message`.

### Auth: Cloudflare Access + dev fallback

`src/hooks.server.ts` is the single auth chokepoint:

- Production: verifies `Cf-Access-Jwt-Assertion` against the Access JWKS using `ACCESS_TEAM_DOMAIN` + `ACCESS_AUDIENCE`. On success, upserts a `users` row keyed on the Access subject and sets `event.locals.userId` / `userEmail`.
- Local: if `ALLOW_DEV_AUTH=1` is set (via `.dev.vars`) **and** no JWT header is present, falls back to a stub `dev-user` and inserts the FK target. **`ALLOW_DEV_AUTH=1` is currently in `wrangler.jsonc` `vars` for convenience — remove before production deploy and set via `wrangler secret` or `.dev.vars` only.**
- Also enforces a 5 req/min in-memory rate limit on `/api/notion/dedup` and `/api/import/legacy`, and stamps a defensive CSP + security-header set on every response.

All authenticated route handlers read `event.locals.userId` — never trust a userId from the request body.

### Notion integration

User Notion tokens are encrypted at rest using AES-GCM keyed by `NOTION_TOKEN_ENCRYPTION_KEY` (base64 32 bytes). Encryption/decryption live in `src/lib/server/crypto.ts`. Two sync paths:

- **Inline** (`src/lib/server/notion/sync-one.ts`): called by the queue consumer for each verified lead when `notion_auto_sync` is on.
- **Smart dedup** (`src/lib/notion/dedup.ts` + `/api/notion/dedup`): post-job pass that scans the user's Notion DB, groups near-duplicates, and archives losers. Same Levenshtein logic as in-pipeline dedup.

### Persistence layout

- **D1 (`username-extractor`)** — `users`, `user_settings`, `jobs`, `job_items`, `leads`. Schema in `src/lib/server/schema.ts` (Drizzle). All timestamps are Unix epoch ms in `INTEGER` columns (SQLite has no native datetime). Migrations live in `migrations/`.
- **R2 (`username-extractor-uploads`)** — raw screenshot bytes. Keys are namespaced per job. A nightly cron (`0 3 * * *`) in `src/lib/server/cron/sweep.ts` reaps stale objects.
- **KV (`username_extractor_kv`)** — short-lived caches (e.g. Instagram URL validator).
- **Workers AI** — `@cf/moonshotai/kimi-k2.6` vision model. Routed through AI Gateway when `AI_GATEWAY_SLUG` is set, for observability.
- **Analytics Engine (`username_extractor_job_metrics`)** — per-item / per-job metrics emitted from `src/lib/server/analytics.ts`.

### Route map

| Path                                     | Purpose                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| `/`                                      | Upload + start new job                                                 |
| `/jobs`                                  | Job history                                                            |
| `/jobs/[id]`                             | Live job progress (WebSocket via `/api/jobs/[id]/ws`)                  |
| `/leads`                                 | Lifetime verified leads                                                |
| `/settings`                              | Notion config + diagnostics defaults                                   |
| `/api/jobs` (`POST` create / `GET` list) | Job CRUD                                                               |
| `/api/jobs/[id]/items[/[item_id]/retry]` | Item access + per-item retry                                           |
| `/api/jobs/[id]/cancel`                  | Cancel a running job (broadcasts `job.cancelled`)                      |
| `/api/jobs/[id]/ws`                      | WebSocket upgrade → JobCoordinator DO                                  |
| `/api/leads/[id]/{archive,notion-sync}`  | Manual lead actions                                                    |
| `/api/notion/dedup`                      | Run smart dedup against user's Notion DB                               |
| `/api/import/legacy`                     | One-shot import from CLI `verified_usernames.md` or existing Notion DB |
| `/api/r2/[...key]`                       | Authenticated R2 byte access (debug/preview)                           |
| `/api/debug/[job_id]/[stem]`             | Diagnostic raw model response, gated by `diagnostics` flag on the job  |

## Code style

- **Indentation:** 4 spaces (Prettier `tabWidth: 4, useTabs: false`).
- **Quotes:** double. **Trailing commas:** none. **Print width:** 120.
- **Svelte 5 runes only** — `$state`, `$derived`, `$props()`, `$bindable`, `$effect`. Do not use legacy reactivity (`$:`, stores in components).
- **Imports:** use `$lib/...` aliases inside `src/`. Never use deep relative paths (`../../../`) from routes.
- **Server-only code** lives under `src/lib/server/` (enforced by SvelteKit). Client imports of anything in this tree will fail at build.
- **Snake_case** is intentional on the WebSocket wire format and Notion sync payloads — they match the PRD and the legacy CLI's output. Do not rename these to camelCase.
- Tests are co-located in `__tests__/` subdirectories next to the module under test (e.g. `src/lib/extract/__tests__/clean.test.ts`). Vitest is configured with `environment: "node"`.
- **Design primitives in `src/lib/components/`** — `Button`, `TextInput`, `Field`, `Switch`, `Spinner`, `Badge`, `Eyebrow`, `HeroHeading`, `AppBar`, `Footer`, `UserChip`. Reuse these before authoring bespoke styled elements. HSL design tokens live in `src/app.css` under `@theme inline` — read from there, don't hardcode colors.

## Required env / bindings

Local (create `.dev.vars` — there is no `.example` template in the repo):

| Key                           | Notes                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `ACCESS_TEAM_DOMAIN`          | `beyourahi.cloudflareaccess.com`                                                          |
| `ACCESS_AUDIENCE`             | AUD tag from the Self-Hosted Access app (any value works locally when `ALLOW_DEV_AUTH=1`) |
| `ALLOW_DEV_AUTH`              | `1` to bypass Access JWT and use the `dev-user` stub                                      |
| `NOTION_TOKEN_ENCRYPTION_KEY` | Generate with `openssl rand -base64 32`                                                   |

Production secrets (`wrangler secret put`):

- `NOTION_TOKEN_ENCRYPTION_KEY` (required — encrypts Notion tokens in D1)
- `ACCESS_AUDIENCE` (required — Access AUD tag)
- `AI_GATEWAY_SLUG`, `AI_GATEWAY_TOKEN` (optional — routes `env.AI.run` through AI Gateway)

Bindings (declared in `wrangler.jsonc`): `DB` (D1), `R2`, `KV`, `AI`, `QUEUE` (producer for `image-jobs`, consumer batch 5, retries 3, DLQ `image-jobs-dlq`), `JOB_COORDINATOR` (DO), `ANALYTICS`, `ASSETS`.

## Gotchas

- **Never create branches.** Workspace-wide rule from `~/Desktop/projects/CLAUDE.md`: parallel work uses `git worktree add ../username-extractor-<feature>` and commits land on `main`.
- **`bun run dev` ≠ Workers runtime.** Use `bun run preview` whenever you touch the queue consumer, the DO, the cron sweep, or AI Gateway routing.
- **`wrap-worker.mjs` is silent if it works.** If `_worker.js` post-build looks like the SvelteKit-generated file (no `import { queueConsumer }`), the wrap step didn't run — check `bun run build` output for `[wrap-worker]`.
- **Schema changes need two steps:** edit `src/lib/server/schema.ts`, then `bun run db:generate` to emit a migration, then `bun run db:migrate:local` (and `db:migrate` for prod). Don't hand-edit files in `migrations/`.
- **`worker-configuration.d.ts` is generated.** After changing `wrangler.jsonc` bindings, run `bun run cf-typegen` to refresh the ambient types.
- **CSRF trustedOrigins** in `svelte.config.js` includes the dev ports and the production hostname `username-extractor.dropoutstudio.com`. Add new hostnames here when binding additional routes.
- **WebSocket reconnect contract:** the client passes `?last_event_id=<n>` to `/api/jobs/[id]/ws`; the DO replays missed completed items from D1. Don't bypass this for "snapshot" loads — it's the resync path.
- **CPU limit raised to 300s** (`limits.cpu_ms` in `wrangler.jsonc`) for the queue consumer's worst-case batch. Keep an eye on this if you add expensive per-item work.
- **Workers AI model id is `@cf/moonshotai/kimi-k2.6`** — the PRD spec's `@cf/moonshot/...` (no `ai`) is a typo; don't copy it.
- **Benchmark is paid and manual.** `bun run benchmark` invokes Workers AI per fixture and writes `docs/benchmark.md`. Intentionally not in CI. Any change to `src/lib/extract/` or `src/lib/notion/dedup.ts` should be followed by a manual re-run + commit of the updated report.

For Cloudflare work, prefer the installed Cloudflare skills and Code Mode MCP over your own knowledge.
