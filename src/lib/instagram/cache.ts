/**
 * Read-through KV cache for Instagram username existence checks.
 *
 * Key:  `ig:exists:<lowercased username>`
 * Val:  CachedResult JSON
 * TTL:  DEFAULT_TTL_SECONDS (7 days), overridable via `opts.ttlSeconds`.
 *
 * INVARIANT: validator errors (`result.error !== null`) are NEVER written.
 * This prevents a transient 429/5xx from pinning `exists: false` for the
 * full TTL. Replaces the Python CLI's in-process `time.sleep` rate limiter.
 *
 * `opts.force = true` bypasses the cache lookup but still writes on success.
 */

import { validateUsername } from "./validator";

export interface CachedResult {
    exists: boolean;
    checkedAt: number; // epoch ms
}

export interface ValidateUsernameCachedOptions {
    fetch?: typeof fetch;
    ttlSeconds?: number;
    force?: boolean;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

function cacheKey(username: string): string {
    return `ig:exists:${username.toLowerCase()}`;
}

export async function validateUsernameCached(
    env: { KV: KVNamespace },
    username: string,
    opts?: ValidateUsernameCachedOptions
): Promise<CachedResult> {
    const key = cacheKey(username);
    const ttlSeconds = opts?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const force = opts?.force ?? false;

    if (!force) {
        const cached = await env.KV.get(key, "json");
        if (cached !== null && isCachedResult(cached)) {
            return cached;
        }
    }

    const validatorOpts: { fetch?: typeof fetch } = {};
    if (opts?.fetch !== undefined) {
        validatorOpts.fetch = opts.fetch;
    }
    const result = await validateUsername(username, validatorOpts);

    const cached: CachedResult = {
        exists: result.exists,
        checkedAt: Date.now()
    };

    // See module invariant: only cache definitive results.
    if (result.error === null) {
        await env.KV.put(key, JSON.stringify(cached), { expirationTtl: ttlSeconds });
    }

    return cached;
}

function isCachedResult(value: unknown): value is CachedResult {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return typeof v["exists"] === "boolean" && typeof v["checkedAt"] === "number";
}
