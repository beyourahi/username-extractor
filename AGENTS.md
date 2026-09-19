# Username Extractor

SvelteKit 5/Cloudflare Workers application that extracts usernames asynchronously through a composite Worker, with Better Auth, D1, Queues, Workflows, R2, Notion integration, and per-user Cloudflare inference. Bun is the package manager.

## Binding workflow

- Work only on `main`; use isolated worktrees for concurrent work.
- Follow workspace git gates, autonomy, deployment, frontend-design, browser verification, and mandatory Swiss Design rules.
- Pushes auto-deploy through Cloudflare Workers Builds; never run routine manual deploys.
- Tailwind v4 is CSS-first; do not create Tailwind or PostCSS config files.
- Use Svelte 5 runes and `$lib` aliases.

## Architecture and safety

- Preserve the request → D1 job → Queue/Workflow processing → durable completion flow.
- Keep authentication and ownership checks fail closed on every user-scoped job, artifact, and credential path.
- Treat Notion tokens, Cloudflare account credentials, AI keys, and user results as secrets/private data.
- Keep per-user inference isolated; never fall back to another user’s credentials or account.
- Validate inputs at every HTTP, queue, workflow, file, and third-party boundary.
- Local auth bypass requires both the gitignored flag and localhost host; never deploy it.

## Verification

Use `bun run format`, `bun run lint`, `bun run check`, and targeted tests. Run database generation/migrations and Cloudflare type generation whenever the affected boundary requires them.

## Conditional reference

Read the project skill `username-extractor-reference` before changing worker topology, jobs, auth, Notion, inference, persistence, environment, testing, or operational behavior. It preserves the detailed route/data flow, commands, bindings, and gotchas.
