import { json, redirect } from "@sveltejs/kit";
import { createAuth, type AuthEnv } from "$lib/server/auth";
import type { RequestHandler } from "./$types";

// Authoritative logout. Better Auth names its session cookie `${prefix}.session_token`; because
// `session.cookieCache` is enabled it ALSO caches a signed session snapshot in a SEPARATE cookie
// `${prefix}.session_data`, and `advanced.useSecureCookies: true` gives both a `__Secure-` prefix in
// prod. getSession trusts the `session_data` snapshot WITHOUT a DB read until its maxAge (5 min), so
// if that cookie survives logout the user stays "logged in" — the exact "logout doesn't stick" bug.
//
// CRITICAL: when the `session_data` snapshot exceeds Better Auth's ~4050-byte ceiling it is SPLIT into
// numbered chunks `${name}.0`, `${name}.1`, … (better-auth/dist/cookies/session-store.mjs), and
// getSession transparently REASSEMBLES those chunks. Deleting only the un-suffixed name leaves the
// chunks alive and getSession keeps reviving the session — logout silently fails to stick. So we
// expire (1) the token + un-suffixed data, secure + bare, AND (2) every chunked `session_data.<n>`
// variant the browser actually sent — mirroring Better Auth's own request-driven `sessionStore.clean()`.
// (Better Auth routes live at the default basePath `/api/auth`, but this custom endpoint is a normal SvelteKit route.)
const SESSION_COOKIE_NAMES = [
    "__Secure-username-extractor.session_token",
    "username-extractor.session_token",
    "__Secure-username-extractor.session_data",
    "username-extractor.session_data"
] as const;

// Bases whose chunked variants (`<base>.0`, `.1`, …) must also be expired — only the cache snapshot
// is ever chunked; the session token is small and never split.
const CHUNKABLE_BASES = SESSION_COOKIE_NAMES.filter((n) => n.endsWith(".session_data"));

const clearSessionCookies = (event: Parameters<RequestHandler>[0]) => {
    // `__Secure-`-prefixed cookies are only accepted/cleared with the Secure attribute set.
    const expire = (name: string) => event.cookies.delete(name, { path: "/", secure: name.startsWith("__Secure-") });

    // (1) Canonical names (token + un-suffixed data, secure + bare). Deleting a missing cookie is a no-op.
    for (const name of SESSION_COOKIE_NAMES) expire(name);

    // (2) Chunked `session_data.<n>` variants present in the request — without this a chunked snapshot
    //     survives the logout and revives the session for up to the 5-minute cookieCache window.
    const cookieHeader = event.request.headers.get("cookie") ?? "";
    for (const pair of cookieHeader.split(";")) {
        const name = pair.trim().split("=")[0];
        if (name && CHUNKABLE_BASES.some((base) => name.startsWith(base + "."))) expire(name);
    }
};

// Kill the server-side session row (best-effort). The cookie clearing below is what guarantees the
// browser is logged out, so any failure here is swallowed — never 500 a logout.
const killDbSession = async (event: Parameters<RequestHandler>[0]) => {
    // Secrets (BETTER_AUTH_SECRET etc.) aren't declared in wrangler.jsonc, so they're absent from the
    // generated Env type — cast to the partial AuthEnv shape, mirroring hooks.server.ts.
    const env = event.platform?.env as (Partial<AuthEnv> & { DB?: D1Database }) | undefined;
    const db = env?.DB;
    if (!db) return;
    try {
        const auth = createAuth(db, {
            BETTER_AUTH_SECRET: env?.BETTER_AUTH_SECRET ?? "",
            BETTER_AUTH_URL: env?.BETTER_AUTH_URL ?? "http://localhost:5173",
            GOOGLE_CLIENT_ID: env?.GOOGLE_CLIENT_ID ?? "",
            GOOGLE_CLIENT_SECRET: env?.GOOGLE_CLIENT_SECRET ?? ""
        });
        await auth.api.signOut({ headers: event.request.headers });
    } catch {
        // best-effort — cookie clearing is the source of truth for logout
    }
};

// POST: fetch-based sign-out (returns JSON). GET: plain-anchor navigation (303 → /login).
export const POST: RequestHandler = async (event) => {
    await killDbSession(event);
    clearSessionCookies(event);
    return json({ success: true });
};

export const GET: RequestHandler = async (event) => {
    await killDbSession(event);
    clearSessionCookies(event);
    redirect(303, "/login");
};
