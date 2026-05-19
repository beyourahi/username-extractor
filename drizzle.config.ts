/**
 * Drizzle Kit configuration for Cloudflare D1.
 *
 * - `bun run db:generate` — produce SQL migration from schema changes (no credentials needed)
 * - `bun run db:migrate:local` — apply migrations to local D1 via wrangler
 * - `bun run db:migrate` — apply migrations to remote D1 via wrangler
 * - `bun run db:studio` / `bun run db:push` — require D1 HTTP credentials in env
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
