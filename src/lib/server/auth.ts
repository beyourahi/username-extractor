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
        // Mount auth routes under /auth (not the default /api/auth) so the derived OAuth
        // callback is {baseURL}/auth/callback/google — matching the redirect URI registered
        // in Google Console (https://username-extractor.dropoutstudio.co/auth/callback/google).
        // The browser client (auth-client.ts) sets the SAME basePath; they must stay in sync.
        basePath: "/auth",
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
            // 5-minute signed cookie cache avoids a D1 read on every request.
            cookieCache: { enabled: true, maxAge: 60 * 5 }
        },
        // D1-backed so the limit holds across edge isolates (in-memory wouldn't).
        rateLimit: { enabled: true, window: 60, max: 20, storage: "database" },
        advanced: { cookiePrefix: "username-extractor", useSecureCookies: true },
        trustedOrigins: [
            "http://localhost:5173",
            "http://localhost:8787",
            "https://username-extractor.dropoutstudio.co"
        ]
    });
};

export type Auth = ReturnType<typeof createAuth>;
