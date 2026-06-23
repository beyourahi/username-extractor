/**
 * Platform-aware read-through KV cache for profile existence checks. Generalizes
 * `$lib/instagram/cache` to key by platform.
 *
 * Key:  `<platform>:exists:<lowercased username>`   (e.g. `tiktok:exists:mrbeast`)
 * Val:  CachedResult JSON
 * TTL:  DEFAULT_TTL_SECONDS (7 days), overridable via `opts.ttlSeconds`.
 *
 * INVARIANT: validator errors (`result.error !== null`) are NEVER written — a
 * transient 429/5xx/anti-bot block must not pin a result for the full TTL.
 *
 * Note: the Instagram cache key changes from the legacy `ig:exists:<u>` to
 * `instagram:exists:<u>`, so IG existence results cold-start once after deploy
 * (results re-derive on first check; harmless).
 */

import type { Platform } from "$lib/social/platform";
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

function cacheKey(platform: Platform, username: string): string {
    return `${platform}:exists:${username.toLowerCase()}`;
}

export async function validateUsernameCached(
    env: { KV: KVNamespace },
    platform: Platform,
    username: string,
    opts?: ValidateUsernameCachedOptions
): Promise<CachedResult> {
    const key = cacheKey(platform, username);
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
    const result = await validateUsername(platform, username, validatorOpts);

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
