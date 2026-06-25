/**
 * Better Auth factory — instantiated PER REQUEST in hooks.server.ts (Workers has no
 * long-lived module state; the D1 binding arrives per request).
 *
 * INVARIANT: Google OAuth is the ONLY sign-in method — `emailAndPassword` is intentionally
 * disabled. `usePlural: true` maps the Better Auth models onto the snake_case plural tables
 * in schema.ts (users/sessions/accounts/verifications). Rate-limit state lives in the
 * `rate_limits` D1 table (Workers isolates don't share in-process state).
 *
 * Replaces the previous Cloudflare Access gate — the app is now a public, self-serve
 * Google-login app served only at username-extractor.dropoutstudio.co.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oneTap } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export interface AuthEnv {
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
}

export const createAuth = (d1: D1Database, env: AuthEnv) => {
    const db = drizzle(d1, { schema });

    // Passkeys (incl. Face ID / Touch ID / Android biometrics — platform authenticators)
    // are bound to the rpID (registrable domain) and the request origin must match exactly.
    // Both are derived from BETTER_AUTH_URL so dev (localhost), preview, and prod all work.
    const authUrl = new URL(env.BETTER_AUTH_URL);
    const isLocal = authUrl.hostname === "localhost" || authUrl.hostname === "127.0.0.1";
    const rpID = authUrl.hostname;
    const passkeyOrigin = isLocal ? ["http://localhost:5173", "http://localhost:8787"] : authUrl.origin;

    return betterAuth({
        database: drizzleAdapter(db, {
            provider: "sqlite",
            usePlural: true,
            schema
        }),
        baseURL: env.BETTER_AUTH_URL,
        // Auth routes use Better Auth's DEFAULT basePath (/api/auth) — identical to the sibling
        // tools (day-zero / invoice-generator / order-processor). The derived OAuth callback is
        // therefore {baseURL}/api/auth/callback/google, which MUST be registered as an Authorized
        // redirect URI in Google Console (https://username-extractor.dropoutstudio.co/api/auth/callback/google,
        // plus the localhost variants). No explicit basePath here ⇒ the browser client
        // (auth-client.ts) also omits it; server and client stay in sync at the default.
        secret: env.BETTER_AUTH_SECRET,
        emailAndPassword: {
            enabled: false
        },
        socialProviders: {
            google: {
                clientId: env.GOOGLE_CLIENT_ID,
                clientSecret: env.GOOGLE_CLIENT_SECRET
            }
        },
        plugins: [
            // Google One Tap — frictionless overlay on the existing Google OAuth (no new
            // provider, no new table). Reuses the configured Google client; the browser
            // client (auth-client.ts) supplies the public client id.
            oneTap(),
            // Passkey / WebAuthn = device biometrics (Face ID / Touch ID / fingerprint).
            // `userVerification: "required"` forces the biometric/PIN gesture.
            // `authenticatorAttachment: "platform"` restricts registration to the device's
            // built-in biometric (Face ID / Touch ID / Windows Hello / Android fingerprint) —
            // roaming security keys cannot register. Registration-time only, so existing
            // passkeys keep working.
            passkey({
                rpID,
                rpName: "Username Extractor",
                origin: passkeyOrigin,
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    residentKey: "required",
                    userVerification: "required"
                }
            })
        ],
        session: {
            expiresIn: 60 * 60 * 24 * 7, // 7 days
            updateAge: 60 * 60 * 24, // refresh once per day
            // 5-minute signed cookie cache avoids a D1 read on every request. `version` is a
            // global session kill-switch (bump to invalidate every cached snapshot at once) —
            // matches the sibling tools.
            cookieCache: { enabled: true, maxAge: 60 * 5, version: "1" }
        },
        // D1-backed so the limit holds across edge isolates (in-memory wouldn't).
        rateLimit: { enabled: true, window: 60, max: 20, storage: "database" },
        advanced: {
            cookiePrefix: "username-extractor",
            useSecureCookies: true,
            // On Cloudflare Workers the client IP is NOT in `request.ip` — Better Auth's rate
            // limiter then can't identify the caller and lumps EVERY user's /api/auth/* calls into
            // ONE shared per-path bucket. With a 20/60s limit that bucket exhausts under normal
            // use, so sign-in (OAuth `state_not_found`/401) and sign-out (400) start failing for
            // everyone — and a non-2xx sign-out is exactly what used to hang logout. Cloudflare
            // exposes the real client IP via the `CF-Connecting-IP` header; point the limiter at it
            // so buckets are per-IP. (Without this the limiter logs the "could not determine a
            // client IP — single shared per-path bucket" warning on every auth request.)
            ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] }
        },
        trustedOrigins: [
            "http://localhost:5173",
            "http://localhost:8787",
            "https://username-extractor.dropoutstudio.co"
        ]
    });
};

export type Auth = ReturnType<typeof createAuth>;
