import type { Handle } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { drizzle } from "drizzle-orm/d1";
import { createAuth, type AuthEnv } from "$lib/server/auth";
import { users } from "$lib/server/schema";

/**
 * Auth + hardening middleware. Every dynamic request passes through `handle`.
 *
 * Pipeline:
 *  1. Resolve the Better Auth session → `event.locals.user/session` and the preserved
 *     contract `event.locals.userId/userEmail` (so the ~18 protected routes are unchanged).
 *  2. Central gate: unauthenticated browser requests to gated routes → 303 /login; /api/* → 401.
 *     Auth is optional — public surface = `/` (browsable guest homepage) + `/login` +
 *     `/api/auth/*` (Better Auth's own routes; default basePath). Extraction still requires
 *     sign-in (the `/api/*` mutations stay gated). Static assets are served by ASSETS first.
 *  3. In-memory 5/min rate limit on RATE_LIMIT_PATHS (app-level, distinct from Better Auth's
 *     D1 limiter on the auth endpoints).
 *  4. SECURITY_HEADERS stamped on EVERY response (including the 401/redirect short-circuits).
 *
 * Dev escape hatch: `E2E_BYPASS_AUTH=1`/`true` (via `.dev.vars` ONLY — never wrangler.jsonc)
 * synthesizes a user so local/preview runs skip the Google round-trip. DOUBLE-GATED — the flag
 * AND a localhost/127.0.0.1 request host — so it stays inert on the prod domain even if the flag leaks.
 *
 * Rate-limit state is per-isolate; acceptable as a soft anti-abuse measure, not a hard quota.
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
    // `identity-credentials-get` is required for the modern FedCM-based Google One Tap prompt.
    "Permissions-Policy":
        'camera=(), microphone=(), geolocation=(), interest-cohort=(), identity-credentials-get=(self "https://accounts.google.com")',
    // Google One Tap loads the GSI script + renders a FedCM iframe from accounts.google.com,
    // so script-src/style-src/frame-src must allow it. Passkey/WebAuthn needs no CSP change.
    "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com/gsi/client; connect-src 'self' https: wss:; frame-src https://accounts.google.com/gsi/; font-src 'self' data: https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

/**
 * Stamps SECURITY_HEADERS on the response. Mutates in place when possible (preserves
 * multiple Set-Cookie headers from the auth handler); clones only when the headers are
 * immutable (e.g. proxied fetch responses).
 */
function applySecurityHeaders(response: Response): Response {
    try {
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
        return response;
    } catch {
        const headers = new Headers(response.headers);
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    }
}

function isPublicPath(pathname: string): boolean {
    // Auth is optional, not a wall: the homepage + changelog are browsable signed-out
    // (sign-in is an invitation, surfaced in the AppBar + on the upload form). /jobs, /leads,
    // /settings and every other /api/* route stay gated — extraction needs a session. Better
    // Auth mounts its own routes under /api/auth/* (the DEFAULT basePath), which must stay
    // reachable signed-out (sign-in/social, the OAuth callback, get-session, sign-out).
    // /api/logout is the other /api route that must stay public: logout fires after signOut()
    // has already cleared the session token, so the gate would otherwise 401 it and strand the
    // user on a JSON error with the cookieCache `session_data` cookie un-cleared.
    return (
        pathname === "/" ||
        pathname === "/login" ||
        pathname === "/changelog" ||
        pathname === "/api/logout" ||
        pathname.startsWith("/api/auth/")
    );
}

function nullAuthLocals(event: Parameters<Handle>[0]["event"]): void {
    event.locals.userId = null;
    event.locals.userEmail = null;
    event.locals.user = null;
    event.locals.session = null;
}

export const handle: Handle = async ({ event, resolve }) => {
    if (building) return resolve(event);

    const env = event.platform?.env as (Partial<AuthEnv> & { DB?: D1Database; E2E_BYPASS_AUTH?: string }) | undefined;
    const db = env?.DB;

    // No DB binding ⇒ auth can't run; treat as unauthenticated (gate still applies).
    if (!db) {
        nullAuthLocals(event);
        if (!isPublicPath(event.url.pathname)) {
            return applySecurityHeaders(gateResponse(event));
        }
        return applySecurityHeaders(await resolve(event));
    }

    // Dev/preview bypass — DOUBLE-GATED (defense in depth); synthesizes an e2e-test-user so
    // local/preview runs skip the Google round-trip:
    //   (1) flag: E2E_BYPASS_AUTH=1|true — lives in `.dev.vars` (gitignored) ONLY; MUST NOT
    //       appear in wrangler.jsonc `[vars]`/secrets. Cloudflare never uploads `.dev.vars`, so
    //       it can't reach prod — this is the PRIMARY safety.
    //   (2) host: request is localhost/127.0.0.1 — a SECOND factor, so even if the flag ever
    //       leaked into a deployed env the bypass stays inert on the prod domain.
    // NOT query-param-gated (a param is attacker-controlled; a bound env var + the request host are not).
    const isLocalDev = event.url.hostname === "localhost" || event.url.hostname === "127.0.0.1";
    if (isLocalDev && (env?.E2E_BYPASS_AUTH === "1" || env?.E2E_BYPASS_AUTH === "true")) {
        const now = new Date();
        const userId = "e2e-test-user";
        try {
            await drizzle(db)
                .insert(users)
                .values({
                    id: userId,
                    email: "e2e@test.local",
                    emailVerified: true,
                    name: "E2E Test User",
                    image: null,
                    createdAt: now,
                    updatedAt: now
                })
                .onConflictDoNothing();
        } catch {
            // users table may not be migrated yet; downstream queries surface their own error
        }
        event.locals.userId = userId;
        event.locals.userEmail = "e2e@test.local";
        event.locals.user = {
            id: userId,
            email: "e2e@test.local",
            emailVerified: true,
            name: "E2E Test User",
            image: null,
            createdAt: now,
            updatedAt: now
        } as App.Locals["user"];
        event.locals.session = null;
        return applySecurityHeaders(await resolve(event));
    }

    const authEnv: AuthEnv = {
        BETTER_AUTH_SECRET: env?.BETTER_AUTH_SECRET ?? "",
        BETTER_AUTH_URL: env?.BETTER_AUTH_URL ?? "http://localhost:5173",
        GOOGLE_CLIENT_ID: env?.GOOGLE_CLIENT_ID ?? "",
        GOOGLE_CLIENT_SECRET: env?.GOOGLE_CLIENT_SECRET ?? ""
    };
    const auth = createAuth(db, authEnv);

    // A getSession failure must not 500 the app — treat as unauthenticated.
    try {
        const session = await auth.api.getSession({ headers: event.request.headers });
        if (session) {
            event.locals.session = session.session;
            event.locals.user = session.user;
            event.locals.userId = session.user.id;
            event.locals.userEmail = session.user.email;
        } else {
            nullAuthLocals(event);
        }
    } catch {
        nullAuthLocals(event);
    }

    // Central gate — runs before Better Auth dispatch so unauth users can still reach /login + /api/auth/*.
    if (!event.locals.userId && !isPublicPath(event.url.pathname)) {
        return applySecurityHeaders(gateResponse(event));
    }

    // App-level rate limit (kept). Better Auth has its own D1 limiter on /api/auth/*.
    if (event.locals.userId && isRateLimitedPath(event.url.pathname)) {
        const bucketPath = RATE_LIMIT_PATHS.find(
            (p) => event.url.pathname === p || event.url.pathname.startsWith(p + "/")
        );
        if (bucketPath && !takeRateToken(event.locals.userId, bucketPath)) {
            return applySecurityHeaders(
                new Response(
                    JSON.stringify({
                        error: "rate_limited",
                        message: `Too many requests; limit is ${RATE_LIMIT_MAX}/min`
                    }),
                    { status: 429, headers: { "content-type": "application/json" } }
                )
            );
        }
    }

    // Better Auth dispatches /api/auth/*; everything else falls through to `resolve`.
    const response = await svelteKitHandler({ event, resolve, auth, building });
    return applySecurityHeaders(response);
};

/** Browser navigation → 303 to /login (with return path); API request → 401 JSON. */
function gateResponse(event: Parameters<Handle>[0]["event"]): Response {
    if (event.url.pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" }
        });
    }
    const to = encodeURIComponent(event.url.pathname + event.url.search);
    return new Response(null, { status: 303, headers: { location: `/login?redirect=${to}` } });
}
