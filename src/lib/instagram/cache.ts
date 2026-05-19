/**
 * KV-backed read-through cache for Instagram validation results.
 *
 * The Python version (see `instagram_validator.py:_enforce_rate_limit`) handled
 * rate limiting in-process with `time.sleep`. On Workers we instead amortize
 * cost with KV — a hit returns the cached `{exists, checkedAt}` shape without
 * touching Instagram.
 *
 * Transient validator failures (`error !== null`) are intentionally NOT cached
 * to avoid pinning a false negative for the full TTL window.
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

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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

    // Skip writes when the validator surfaced an error — transient failures
    // should not poison the cache for the full TTL.
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
