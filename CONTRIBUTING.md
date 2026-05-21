# Contributing to Username Extractor

Thanks for your interest in improving this project. This guide covers how to set up the project, the conventions to follow, and how to get a change merged.

## Code of conduct

Be respectful and constructive. Assume good intent, keep discussion focused on the work, and help newcomers. Harassment or dismissive behavior is not tolerated. Maintainers may remove comments, commits, or contributions that violate this spirit.

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce, what you expected, and what happened.
- **Suggest a feature** — open an issue describing the problem before the solution, so the design can be discussed first.
- **Improve docs** — fixes to the README, this guide, or inline comments are always welcome.
- **Submit code** — see the workflow below.

For anything beyond a small fix, open an issue first so the approach can be agreed on before you spend time on it.

## Development setup

See the [Getting started](./README.md#getting-started) section of the README for the full setup. In short:

```bash
bun install
cp .dev.vars.example .dev.vars        # then fill in the values
wrangler d1 migrations apply username-extractor --local
bun run dev
```

Use `bun run preview` instead of `bun run dev` when your change touches the queue consumer, the Durable Object, the cron sweep, or AI routing — `dev` does not run a real Workers runtime.

## Development workflow

This repository uses a fork-and-pull-request model for external contributors:

1. **Fork** the repository and clone your fork.
2. **Create a branch** off `main` for your change — e.g. `fix/notion-token-refresh` or `feat/csv-export`.
3. **Make focused commits** — one logical change per commit.
4. **Run the checks** (see below) and make sure they pass.
5. **Open a pull request** against `main` with a clear description of what changed and why.

Keep pull requests small and single-purpose. A reviewer can evaluate a 50-line PR quickly; a 1,000-line PR stalls.

## Before you submit

Every pull request must pass:

```bash
bun run lint     # Prettier formatting + ESLint
bun run check    # TypeScript types + Svelte accessibility
bun run test     # Vitest unit suite
```

Run `bun run format` to auto-fix formatting. If you change behavior, add or update tests — they live in `__tests__/` directories next to the module under test.

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add CSV export for verified leads
fix: correct Levenshtein threshold for short usernames
docs: clarify Notion token setup
refactor: extract tier logic into its own module
test: cover the consensus tie-breaker
chore: bump wrangler to 4.92
```

- Write the subject in the imperative mood, under ~70 characters.
- Use the body to explain _why_, not _what_ — the diff already shows what.
- Keep commits atomic.
- Do **not** add AI-agent co-author trailers (`Co-Authored-By:` lines referencing Claude, Copilot, ChatGPT, or similar).

## Code style

- **Indentation:** 4 spaces. **Quotes:** double. **No trailing commas.** **Print width:** 120. Prettier enforces all of this.
- **Svelte 5 runes only** — `$state`, `$derived`, `$props()`, `$bindable`, `$effect`. Do not use legacy reactivity (`$:`, stores in components).
- **Imports:** use the `$lib/...` alias inside `src/`. Never use deep relative paths (`../../../`) from route files.
- **Server-only code** belongs under `src/lib/server/` — SvelteKit will fail the build if a client module imports from there.
- **Snake_case keys** on the WebSocket wire format and Notion payloads are intentional. They match the spec and the legacy CLI's output — do not rename them to camelCase.

## Project-specific guidance

A few things in this codebase need care:

- **The extraction core is a verbatim port.** Files in `src/lib/extract/` and `src/lib/notion/dedup.ts` reproduce the original Python CLI's algorithms — Levenshtein near-duplicate detection, confidence scoring, username cleaning, smart dedup. Do **not** change their behavior casually: any behavioral change invalidates the recorded model accuracy benchmark. Bug fixes are fine, but call them out explicitly in the PR and back them with tests.

- **The composite worker wrapper is generated.** `scripts/wrap-worker.mjs` produces `_worker.js` after the build. Never edit the generated file. If you add a new top-level Worker handler (e.g. `email`, `tail`), wire it into **both** `src/lib/server/worker-entry.ts` and `scripts/wrap-worker.mjs`.

- **Schema changes are two steps.** Edit `src/lib/server/schema.ts`, then run `bun run db:generate` to emit a migration, then `bun run db:migrate:local`. Do not hand-edit files in `migrations/`.

- **Binding changes need a type regen.** After editing `wrangler.jsonc` bindings, run `bun run cf-typegen` to refresh `worker-configuration.d.ts`.

## Pull request review

- A maintainer will review your PR and may request changes. Push follow-up commits to the same branch — no need to open a new PR.
- CI checks (lint, type-check, tests) must be green before merge.
- Once approved, a maintainer merges it. Thanks for contributing.

## Reporting security issues

Do **not** open a public issue for security vulnerabilities. This app handles encrypted Notion tokens and Cloudflare Access identities. Email the maintainer at **beyourahi@gmail.com** with details and a way to reproduce, and allow reasonable time for a fix before any public disclosure.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE) that covers this project.
