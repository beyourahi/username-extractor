/**
 * Cloudflare Access JWT verification (NFR-7). Pure WebCrypto, no Node deps.
 *
 * Verification steps (must all pass for `verifyAccessJwt` to return claims):
 *   1. Token is a well-formed 3-segment JWT.
 *   2. Header `alg=RS256` and `kid` present.
 *   3. `exp` not past; `nbf` not in the future (60s clock skew allowance).
 *   4. `aud` includes ACCESS_AUDIENCE.
 *   5. `iss` matches `https://<ACCESS_TEAM_DOMAIN>` if present.
 *   6. RSA signature verifies against the JWKS entry for `kid`.
 *   7. Both `sub` and `email` claims are non-empty.
 *
 * JWKS fetch is cached in-isolate by team-domain for `JWKS_TTL_MS` (15 min).
 * Cache lives in module scope — survives across requests within the same isolate.
 */

import { eq } from "drizzle-orm";
import { schema, type Db } from "$lib/server/db";

export interface AccessClaims {
    sub: string;
    email: string;
}

interface Jwk {
    kid: string;
    kty: string;
    n: string;
    e: string;
    alg?: string;
    use?: string;
}

interface JwksDocument {
    keys: Jwk[];
}

interface JwksCacheEntry {
    keys: Map<string, CryptoKey>;
    expiresAt: number;
}

interface JwtHeader {
    alg: string;
    kid?: string;
    typ?: string;
}

interface JwtPayload {
    sub?: string;
    email?: string;
    aud?: string | string[];
    iss?: string;
    iat?: number;
    exp?: number;
    nbf?: number;
}

const JWKS_TTL_MS = 15 * 60 * 1000;
const jwksCache = new Map<string, JwksCacheEntry>();

function base64UrlToUint8Array(input: string): Uint8Array {
    // base64url → base64: re-pad and swap URL-safe chars before atob().
    const pad = input.length % 4;
    const padded = pad === 0 ? input : input + "=".repeat(4 - pad);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

function base64UrlDecodeText(input: string): string {
    const bytes = base64UrlToUint8Array(input);
    return new TextDecoder().decode(bytes);
}

async function importJwk(jwk: Jwk): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "jwk",
        {
            kty: jwk.kty,
            n: jwk.n,
            e: jwk.e,
            alg: jwk.alg ?? "RS256",
            ext: true
        } as JsonWebKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
    );
}

async function loadJwks(teamDomain: string): Promise<Map<string, CryptoKey>> {
    const cached = jwksCache.get(teamDomain);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.keys;
    }

    const url = `https://${teamDomain}/cdn-cgi/access/certs`;
    const resp = await fetch(url, { headers: { accept: "application/json" } });
    if (!resp.ok) {
        throw new Error(`failed to fetch Access JWKS from ${url}: ${resp.status}`);
    }
    const doc = (await resp.json()) as JwksDocument;
    const keys = new Map<string, CryptoKey>();
    for (const jwk of doc.keys ?? []) {
        if (jwk.kty !== "RSA" || !jwk.kid) continue;
        try {
            const k = await importJwk(jwk);
            keys.set(jwk.kid, k);
        } catch {
            // Skip keys that fail to import (unknown alg, malformed n/e).
        }
    }
    jwksCache.set(teamDomain, { keys, expiresAt: now + JWKS_TTL_MS });
    return keys;
}

export interface AccessEnv {
    ACCESS_TEAM_DOMAIN: string | undefined;
    ACCESS_AUDIENCE: string | undefined;
}

/**
 * Verifies an Access JWT. Returns `{sub, email}` on success, `null` on ANY
 * failure (missing env, malformed token, expired, aud mismatch, bad signature, …).
 * Callers MUST treat null as unauthenticated — do not log raw failure reasons.
 */
export async function verifyAccessJwt(token: string | null | undefined, env: AccessEnv): Promise<AccessClaims | null> {
    if (!token) return null;
    const teamDomain = env.ACCESS_TEAM_DOMAIN;
    const audience = env.ACCESS_AUDIENCE;
    if (!teamDomain || !audience) return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const rawHeader = parts[0];
    const rawPayload = parts[1];
    const rawSig = parts[2];
    if (!rawHeader || !rawPayload || !rawSig) return null;

    let header: JwtHeader;
    let payload: JwtPayload;
    try {
        header = JSON.parse(base64UrlDecodeText(rawHeader)) as JwtHeader;
        payload = JSON.parse(base64UrlDecodeText(rawPayload)) as JwtPayload;
    } catch {
        return null;
    }

    if (header.alg !== "RS256" || !header.kid) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && payload.exp < now) return null;
    if (typeof payload.nbf === "number" && payload.nbf > now + 60) return null;

    // `aud` in Access tokens may be string or string[].
    const aud = payload.aud;
    const audOk = Array.isArray(aud) ? aud.includes(audience) : aud === audience;
    if (!audOk) return null;

    const expectedIssuer = `https://${teamDomain}`;
    if (payload.iss && payload.iss !== expectedIssuer) return null;

    let keys: Map<string, CryptoKey>;
    try {
        keys = await loadJwks(teamDomain);
    } catch {
        return null;
    }
    const key = keys.get(header.kid);
    if (!key) return null;

    // Copy into fresh ArrayBuffers: WebCrypto wants ArrayBuffer-backed BufferSources under
    // exactOptionalPropertyTypes, not the SharedArrayBuffer-compatible Uint8Array view types.
    const signingInput = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
    const sigBytes = base64UrlToUint8Array(rawSig);
    const sigBuf = new ArrayBuffer(sigBytes.byteLength);
    new Uint8Array(sigBuf).set(sigBytes);
    const inputBuf = new ArrayBuffer(signingInput.byteLength);
    new Uint8Array(inputBuf).set(signingInput);

    let valid: boolean;
    try {
        valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, sigBuf, inputBuf);
    } catch {
        return null;
    }
    if (!valid) return null;

    if (!payload.sub || !payload.email) return null;
    return { sub: payload.sub, email: payload.email };
}

/**
 * Idempotent upsert into `users` keyed on `cf_access_subject`. Returns the
 * local `users.id` (uuid). Safe to call on every authenticated request.
 * `_email` is currently unused but kept in the signature for future audit logging.
 */
export async function ensureUserRow(db: Db, cfSub: string, _email: string): Promise<string> {
    const existing = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.cfAccessSubject, cfSub))
        .limit(1);
    if (existing.length > 0 && existing[0]?.id) {
        return existing[0].id;
    }
    const id = crypto.randomUUID();
    await db.insert(schema.users).values({ id, cfAccessSubject: cfSub, createdAt: Date.now() }).onConflictDoNothing();
    const row = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.cfAccessSubject, cfSub))
        .limit(1);
    return row[0]?.id ?? id;
}

/** TEST ONLY. Clears the in-isolate JWKS cache. Do not call from app code. */
export function __clearJwksCacheForTests(): void {
    jwksCache.clear();
}
