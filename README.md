# Username Extractor

> Pulls valid Instagram usernames off screenshots into one list.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![SvelteKit 5](https://img.shields.io/badge/SvelteKit-5-ff3e00.svg)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg)

A self-hostable web tool that extracts Instagram usernames from batches of profile screenshots, deduplicates them against a lifetime leads table, and syncs verified results to Notion. It runs end to end on the Cloudflare developer platform.

This is the production web port of the legacy Python CLI [`extract_usernames`](https://github.com/beyourahi/extract_usernames). The algorithmic core — Levenshtein near-duplicate detection, tier-based confidence scoring, Notion smart dedup, username cleaning — is preserved verbatim. The heavy local ML stack (PyTorch + EasyOCR + Ollama) is replaced by a single Workers AI vision call per image (`@cf/moonshotai/kimi-k2.6`).

## Features

- **Batch extraction** — drop in a folder of profile screenshots; each image is read by a Workers AI vision model.
- **Confidence scoring** — every result is cleaned, scored, classified, and assigned a tier so you can trust or triage it.
- **Near-duplicate detection** — Levenshtein distance catches typo-variants of usernames already in your leads table, not just exact matches.
- **Live progress** — per-image updates stream to the browser over WebSockets; the connection resyncs from the database on reconnect.
- **Notion sync** — verified leads sync to a Notion database inline as they are found, plus a post-job smart dedup pass that archives near-duplicate rows.
- **Encrypted secrets** — each user's Notion token is encrypted at rest with AES-GCM.
- **Access-gated** — protected by Cloudflare Access in production, with a local dev bypass for fast iteration.
- **Legacy import** — one-shot import from the original Python CLI's `verified_usernames.md` or an existing Notion database.

## How it works

```
Upload screenshots
      │
      ▼
POST /api/jobs ──► D1 (job + items)  +  R2 (image bytes)  +  Queue (one message per image)
      │
      ▼
Queue consumer  (processes one image per message)
   · Workers AI vision model reads the username from the screenshot
   · clean → score confidence → classify status → assign tier
   · check for exact and near-duplicate (Levenshtein) leads
   · write verified, non-duplicate leads to D1
   · sync each lead to Notion (when auto-sync is enabled)
   · broadcast progress to the job's Durable Object
      │
      ▼
Browser WebSocket ◄── live per-item updates; resyncs from D1 on reconnect
```

**D1 is the source of truth.** The Durable Object is a best-effort broadcast relay — if it restarts, the consumer keeps writing and the UI resyncs on reconnect. Durable Object state is never treated as durable.

## Tech stack

| Layer     | Choice                                                                        |
| --------- | ----------------------------------------------------------------------------- |
| Framework | SvelteKit 5 (Svelte 5 runes)                                                  |
| Runtime   | Cloudflare Workers                                                            |
| Styling   | Tailwind CSS v4, `bits-ui`                                                    |
| Storage   | D1 (SQLite) · R2 (object storage) · KV (cache)                                |
| Async     | Queues + a `JobCoordinator` Durable Object                                    |
| AI        | Workers AI vision model `@cf/moonshotai/kimi-k2.6`, optionally via AI Gateway |
| Auth      | Cloudflare Access (JWT)                                                       |
| Tooling   | Bun · Vite · Drizzle ORM · Vitest · ESLint · Prettier                         |

## Getting started

### Prerequisites

- [Bun](https://bun.sh)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) with Workers, D1, R2, KV, Queues, and Workers AI available
- The Wrangler CLI is installed as a dev dependency — no global install needed

### Install

```bash
git clone https://github.com/beyourahi/username-extractor.git
cd username-extractor
bun install
```

### Configure environment

Copy the example file and fill in the values:

```bash
cp .dev.vars.example .dev.vars
```

| Key                           | Notes                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `ACCESS_TEAM_DOMAIN`          | Your Cloudflare Access team domain, e.g. `your-team.cloudflareaccess.com`.               |
| `ACCESS_AUDIENCE`             | The AUD tag of your Self-Hosted Access app. Any value works locally with the dev bypass. |
| `ALLOW_DEV_AUTH`              | `1` bypasses Access JWT verification with a stub `dev-user`. **Local only.**             |
| `NOTION_TOKEN_ENCRYPTION_KEY` | A base64-encoded 32-byte AES-GCM key. Generate with `openssl rand -base64 32`.           |

### Run

```bash
wrangler d1 migrations apply username-extractor --local   # one-time, before first run
bun run dev                                               # Vite dev server
```

`bun run dev` does **not** run a real Workers runtime. Queues, the Durable Object, the cron sweep, and AI Gateway routing only fire under `bun run preview`, which builds the worker and runs `wrangler dev` against it. Use `preview` whenever you touch the pipeline.

## Provisioning Cloudflare resources

Before the first deploy, create the bound resources (one-time):

```bash
wrangler d1 create username-extractor
wrangler r2 bucket create username-extractor-uploads
wrangler kv namespace create username_extractor_kv
wrangler queues create image-jobs
wrangler queues create image-jobs-dlq
```

Copy the generated IDs into `wrangler.jsonc` where indicated, then apply migrations to the remote database:

```bash
bun run db:migrate
```

## Deploying

```bash
bun run deploy
```

This builds the SvelteKit app, wraps the worker entry (see [Composite worker](#composite-worker) below), and runs `wrangler deploy`.

Set production secrets with Wrangler — never commit them:

```bash
wrangler secret put NOTION_TOKEN_ENCRYPTION_KEY
wrangler secret put ACCESS_AUDIENCE
# optional, for AI Gateway observability:
wrangler secret put AI_GATEWAY_SLUG
wrangler secret put AI_GATEWAY_TOKEN
```

> **Before going to production**, remove `ALLOW_DEV_AUTH` from the `vars` block in `wrangler.jsonc`. Leaving it on disables authentication.

## Authentication

In production the app sits behind a Cloudflare Access Self-Hosted application:

1. Create a **Self-Hosted** Access application for your deployment hostname.
2. Add a policy that includes the emails allowed to use the tool.
3. Copy the **Application Audience (AUD) tag** into the `ACCESS_AUDIENCE` secret.

`src/hooks.server.ts` verifies the `Cf-Access-Jwt-Assertion` header against the Access JWKS on every request.

## Notion setup

Notion is configured per user from the in-app **Settings** page — paste a Notion integration token and target database. The token is encrypted with `NOTION_TOKEN_ENCRYPTION_KEY` before it is stored in D1.

To migrate from the legacy Python CLI, paste your `verified_usernames.md` or supply a Notion token + database ID under **Settings → Import legacy data**.

## Benchmarking

A pre-launch benchmark script lives at `scripts/benchmark.ts` and runs via `bun run benchmark`. It reads checked-in fixtures from `src/lib/extract/__tests__/fixtures/` (58 screenshots with an `expected.json` ground truth lifted from the legacy `needs_review.md`), invokes the Workers AI vision model against each one, and writes a per-image accuracy summary to `docs/benchmark.md`. The benchmark is **not** wired to CI — Workers AI invocations cost real money — and is intended for manual pre-launch verification per the PRD §Final verification step.

## Project structure

```
src/
├── hooks.server.ts        Auth chokepoint (Cloudflare Access + dev fallback)
├── routes/                Pages and API endpoints
│   └── api/               Job, lead, Notion, import, and WebSocket endpoints
└── lib/
    ├── extract/           Username cleaning, confidence, classification, distance
    ├── notion/            Notion client + smart dedup
    ├── instagram/         URL validation + cache
    ├── import/            Legacy CLI markdown import
    ├── components/        Svelte UI components
    ├── types/             WebSocket message wire format
    └── server/            Server-only code — DB, crypto, queue, cron, AI, DO
```

### Composite worker

`@sveltejs/adapter-cloudflare` only emits a `fetch` handler, but this app also needs `queue`, `scheduled`, and a Durable Object export. `bun run build` runs the SvelteKit build, then `scripts/wrap-worker.mjs` generates a `_worker.js` that combines the SvelteKit handler with the queue consumer, cron sweep, and `JobCoordinator`. The wrapper is auto-generated — never edit it by hand.

## Testing

```bash
bun run test     # Vitest unit suite
bun run check    # svelte-check (types + accessibility)
bun run lint     # Prettier + ESLint
```

Tests are co-located in `__tests__/` directories next to the module under test.

## Scripts

| Command                    | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `bun run dev`              | Vite dev server (no Workers runtime)          |
| `bun run preview`          | Build + `wrangler dev` — full Workers runtime |
| `bun run build`            | Build + wrap the composite worker             |
| `bun run deploy`           | Build + deploy to Cloudflare                  |
| `bun run check`            | Type and accessibility checks                 |
| `bun run lint`             | Prettier check + ESLint                       |
| `bun run format`           | Prettier auto-format                          |
| `bun run test`             | Run the unit suite                            |
| `bun run db:generate`      | Emit a Drizzle migration from schema changes  |
| `bun run db:migrate:local` | Apply migrations to the local D1 database     |
| `bun run db:migrate`       | Apply migrations to the remote D1 database    |
| `bun run cf-typegen`       | Regenerate Worker binding types               |

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or pull request.

## License

[MIT](./LICENSE) © Rahi Khan

## Acknowledgements

Built on the algorithmic foundation of [`extract_usernames`](https://github.com/beyourahi/extract_usernames), the original Python CLI.
