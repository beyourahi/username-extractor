# Username Extractor — Screenshots in, usernames out.

A web tool for extracting Instagram usernames from batches of profile screenshots, with smart Notion sync.

**Stack:** SvelteKit 5 + Bun + Tailwind v4 + Cloudflare Workers + D1 / R2 / KV / Queues / Durable Objects / AI / Analytics.

This is the production web port of the legacy Python CLI at [`extract_usernames`](https://github.com/beyourahi/extract_usernames). The pipeline preserves the algorithmic core (Levenshtein near-duplicate detection, tier-based confidence, Notion smart dedup) while moving from PyTorch + EasyOCR + local Ollama to a single Workers AI call per image (`@cf/moonshot/kimi-k2.6`).

## Local development

```bash
bun install
wrangler d1 migrations apply username-extractor --local
bun run dev
```

For a full Workers-runtime test (Queues, DO, AI bindings):

```bash
bun run preview   # builds and runs `wrangler dev` against the bundled worker
```

Copy `.dev.vars.example` → `.dev.vars` and fill in `ACCESS_AUDIENCE` and a fresh `NOTION_TOKEN_ENCRYPTION_KEY` before running. Keep `ALLOW_DEV_AUTH=1` only locally — it bypasses Cloudflare Access JWT verification with a stub `dev-user` so you can iterate without the Access tunnel in front.

## Deploy

```bash
bun run deploy
```

This script builds the SvelteKit app, wraps the worker entry, then runs `wrangler deploy`.

## Required secrets (set with `wrangler secret put`)

| Secret                        | Purpose                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NOTION_TOKEN_ENCRYPTION_KEY` | base64-encoded 32-byte AES-GCM key. Generate via `openssl rand -base64 32`. Used to encrypt the user's Notion token at rest in D1. |
| `ACCESS_AUDIENCE`             | Cloudflare Access AUD tag from your Self-Hosted application.                                                                       |

## Required vars in `wrangler.jsonc`

| Var                             | Value                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ACCESS_TEAM_DOMAIN`            | `beyourahi.cloudflareaccess.com` (your Access team domain)                                                                                                               |
| `AI_GATEWAY_SLUG` _(optional)_  | AI Gateway slug for `env.AI.run` observability                                                                                                                           |
| `ALLOW_DEV_AUTH` _(local only)_ | `1` enables the dev-user fallback when no `Cf-Access-Jwt-Assertion` header is present. **Remove from `vars` before production deploy** — set it via `.dev.vars` instead. |

## One-time provisioning

```bash
wrangler d1 create username-extractor             # already done; ID in wrangler.jsonc
wrangler r2 bucket create username-extractor-uploads
wrangler kv namespace create username_extractor_kv
wrangler queues create image-jobs
wrangler queues create image-jobs-dlq
```

Then bind the deployed Worker to `username-extractor.beyourahi.com` (DNS + Worker route in the Cloudflare dashboard).

## Cloudflare Access policy

- **Application type:** Self-Hosted
- **Application domain:** `username-extractor.beyourahi.com`
- **Policy:** include emails (allowlist)
- Copy the **Application Audience (AUD) Tag** into the `ACCESS_AUDIENCE` secret.

## Route map

| Path                 | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `/`                  | Upload + new job                                                       |
| `/jobs`              | Job history                                                            |
| `/jobs/[id]`         | Live job progress (WebSocket)                                          |
| `/leads`             | Lifetime verified leads                                                |
| `/settings`          | Notion config, diagnostics defaults                                    |
| `/api/import/legacy` | One-shot import from CLI `verified_usernames.md` or existing Notion DB |
| `/api/notion/dedup`  | Run smart deduplication against the Notion DB                          |

## Testing

```bash
bun run test    # Vitest unit suite
bun run check   # svelte-check (type + a11y)
```

## License

MIT
