/**
 * Drizzle Kit config for the D1 database.
 *
 * Adapts based on env: when all three of CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_DATABASE_ID, CLOUDFLARE_D1_TOKEN are set, switches to the
 * `d1-http` driver so `db:push` / `db:studio` can talk to remote D1.
 * Without them, only schema-introspection commands (`db:generate`) work.
 *
 * Commands:
 *   bun run db:generate       offline; emits SQL into ./migrations
 *   bun run db:migrate:local  applies via wrangler against local D1
 *   bun run db:migrate        applies via wrangler against remote D1
 *   bun run db:studio         needs all 3 CLOUDFLARE_* env vars
 *   bun run db:push           needs all 3 CLOUDFLARE_* env vars
 */
import { defineConfig } from "drizzle-kit";

const hasD1Credentials =
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_DATABASE_ID && process.env.CLOUDFLARE_D1_TOKEN;

const baseConfig = {
    out: "./migrations",
    schema: "./src/lib/server/schema.ts",
    dialect: "sqlite" as const,
    verbose: true,
    strict: true,
    breakpoints: true
};

export default defineConfig(
    hasD1Credentials
        ? {
              ...baseConfig,
              driver: "d1-http",
              dbCredentials: {
                  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
                  databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
                  token: process.env.CLOUDFLARE_D1_TOKEN!
              }
          }
        : baseConfig
);
