# Username Extractor

Screenshots in, usernames out.

A web tool for extracting Instagram usernames from batches of profile screenshots. Uploads land on Cloudflare R2, get processed by Workers AI (`@cf/moonshot/kimi-k2.6`), and verified handles sync to a Notion database with smart deduplication.

This is the SvelteKit web port of the legacy Python CLI at [`extract_usernames`](https://github.com/beyourahi/extract_usernames). The pipeline preserves the same algorithmic core (Levenshtein near-dup detection, confidence scoring, Notion smart dedup) while moving from PyTorch + EasyOCR + local Ollama to a single Workers AI call.

## Stack

- **Framework**: SvelteKit + Svelte 5 runes
- **Styling**: Tailwind CSS v4 (CSS-first, no config file)
- **Runtime**: Cloudflare Workers via `@sveltejs/adapter-cloudflare`
- **State**: D1 (relational), R2 (uploads), KV (IG validation cache), Durable Objects (per-job WebSocket coordinator)
- **Async**: Cloudflare Queues for per-image fan-out
- **AI**: Workers AI + AI Gateway
- **Auth**: Cloudflare Access

## Status

**Phase 0** — Scaffolding complete. Pipeline (Phase 3) and UI (Phase 4) pending.

See `/Users/beyourahi/.claude/plans/docs-web-port-prd-md-spicy-key.md` for the execution plan and `docs/web-port-prd.md` in the legacy repo for the PRD.

## Local dev

```bash
bun install
bun run db:migrate:local
bun run dev
```

## Phase 0 bindings (placeholders until `wrangler` provisions them)

| Binding | Type |
|---|---|
| `DB` | D1 (`username-extractor`) |
| `R2` | R2 bucket (`username-extractor-uploads`) |
| `KV` | KV namespace (`IG_VALIDATION_CACHE`) |
| `AI` | Workers AI |
| `QUEUE` | Queue (`image-jobs`) |
| `JOB_COORDINATOR` | Durable Object class |
| `ANALYTICS` | Analytics Engine dataset |
