import type { Handle } from "@sveltejs/kit";
import { getDb } from "$lib/server/db";
import { users } from "$lib/server/schema";
import { verifyAccessJwt, ensureUserRow } from "$lib/server/access";

/**
 * Auth + hardening middleware. Every request to a SvelteKit route passes through `handle`.
 *
 * Pipeline:
 *  1. `verifyAccessJwt` against the Cf-Access-Jwt-Assertion header (NFR-7).
 *  2. `ensureUserRow` upserts a `users` row keyed on `claims.sub`; populates `event.locals.userId/userEmail`.
 *  3. In-memory token bucket rate limits (5/min/user) on RATE_LIMIT_PATHS only.
 *  4. SECURITY_HEADERS applied to every response (including the 401 short-circuit).
 *
 * Dev escape hatch: when ALLOW_DEV_AUTH=1 *and* no Access header is present,
 * a synthetic "dev-user" row is upserted so FK constraints from job/lead
 * inserts hold. Production must never set this flag.
 *
 * Rate-limit state is per-isolate; multiple isolates ⇒ users can exceed the
 * declared cap. Acceptable for a soft anti-abuse measure, not a hard quota.
 */

interface RateBucket {
    count: number;
    resetAt: number;
}

const RATE_LIMIT_PATHS = ["/api/notion/dedup", "/api/import/legacy"] as const;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateBuckets = new Map<string, RateBucket>();

function takeRateToken(userId: string, path: string): boolean {
    const now = Date.now();
    const key = `${userId}:${path}`;
    const cur = rateBuckets.get(key);
    if (!cur || cur.resetAt <= now) {
        rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (cur.count >= RATE_LIMIT_MAX) return false;
    cur.count += 1;
    return true;
}

function isRateLimitedPath(pathname: string): boolean {
    return RATE_LIMIT_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const SECURITY_HEADERS: Record<string, string> = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https: wss:; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

function applySecurityHeaders(response: Response): Response {
    // Workers can return responses with immutable headers (e.g. from `fetch()` proxies); clone before mutating.
    try {
        const headers = new Headers(response.headers);
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    } catch {
        return response;
    }
}

export const handle: Handle = async ({ event, resolve }) => {
    const env = event.platform?.env as
        | {
              ALLOW_DEV_AUTH?: string;
              ACCESS_TEAM_DOMAIN?: string;
              ACCESS_AUDIENCE?: string;
              DB?: D1Database;
          }
        | undefined;

    const allowDev = env?.ALLOW_DEV_AUTH === "1";
    const token = event.request.headers.get("Cf-Access-Jwt-Assertion");

    let userId: string | null;
    let userEmail: string | null;

    const claims = await verifyAccessJwt(token, {
        ACCESS_TEAM_DOMAIN: env?.ACCESS_TEAM_DOMAIN,
        ACCESS_AUDIENCE: env?.ACCESS_AUDIENCE
    });

    if (claims) {
        userEmail = claims.email;
        if (event.platform && env?.DB) {
            try {
                const db = getDb(event.platform);
                userId = await ensureUserRow(db, claims.sub, claims.email);
            } catch {
                // DB upsert failed (binding missing / migrations not applied). Continue with a
                // synthetic `cf:<sub>` id so downstream handlers can surface their own error.
                userId = `cf:${claims.sub}`;
            }
        } else {
            userId = `cf:${claims.sub}`;
        }
    } else if (!token && allowDev) {
        userId = "dev-user";
        userEmail = "dev@local";
        // Upsert the dev-user row so FK targets exist for `jobs.user_id`, `leads.user_id`, etc.
        if (event.platform && env?.DB) {
            try {
                const db = getDb(event.platform);
                await db
                    .insert(users)
                    .values({ id: "dev-user", cfAccessSubject: "dev-user", createdAt: Date.now() })
                    .onConflictDoNothing();
            } catch {
                // `users` table may not be migrated yet; let downstream queries error explicitly.
            }
        }
    } else {
        // No JWT and no dev escape ⇒ 401. Static assets bypass `handle` via the ASSETS binding,
        // so this branch only fires on dynamic routes.
        return applySecurityHeaders(
            new Response("Unauthorized", {
                status: 401,
                headers: { "content-type": "text/plain" }
            })
        );
    }

    event.locals.userId = userId;
    event.locals.userEmail = userEmail;

    if (userId && isRateLimitedPath(event.url.pathname)) {
        const bucketPath = RATE_LIMIT_PATHS.find(
            (p) => event.url.pathname === p || event.url.pathname.startsWith(p + "/")
        );
        if (bucketPath && !takeRateToken(userId, bucketPath)) {
            return applySecurityHeaders(
                new Response(
                    JSON.stringify({
                        error: "rate_limited",
                        message: `Too many requests; limit is ${RATE_LIMIT_MAX}/min`
                    }),
                    {
                        status: 429,
                        headers: { "content-type": "application/json" }
                    }
                )
            );
        }
    }

    const response = await resolve(event);
    return applySecurityHeaders(response);
};
