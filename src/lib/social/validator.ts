/**
 * Platform-aware profile existence check. Generalizes the Instagram-only
 * `$lib/instagram/validator`.
 *
 * INVARIANT (inherited): NEVER throws — every failure surfaces via
 * `ValidationResult.error`.
 *
 * Per-platform semantics:
 *   - instagram → delegates to the untouched `$lib/instagram/validator` (byte-identical).
 *   - tiktok / youtube → live GET; a clean 404 is the ONLY signal that marks a
 *     handle as not-existing. Everything else (200, 403 anti-bot, 429, 5xx,
 *     timeout) resolves OPTIMISTICALLY to `exists: true` so a flaky/bot-blocked
 *     check never marks a real lead invalid. Non-200/404 carries `error` so the
 *     cache layer won't persist it.
 *   - facebook / other → skipped entirely (`exists: true`) — no reliable public
 *     existence endpoint; we trust the model and let the lead sync.
 */

import type { Platform } from "$lib/social/platform";
import {
    validateUsername as validateInstagram,
    type ValidationResult,
    type ValidatorOptions
} from "$lib/instagram/validator";

export type { ValidationResult, ValidatorOptions };

const RETRYABLE_STATUS_CODES = new Set<number>([429, 500, 502, 503, 504]);
const BACKOFF_CAP_MS = 10_000;
const USER_AGENT = "username-extractor/1.0";

const PROFILE_URL_BUILDERS: Partial<Record<Platform, (username: string) => string>> = {
    tiktok: (u) => `https://www.tiktok.com/@${encodeURIComponent(u)}`,
    youtube: (u) => `https://www.youtube.com/@${encodeURIComponent(u)}`
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(base: number, attempt: number): number {
    return Math.min(base * Math.pow(2, attempt), BACKOFF_CAP_MS);
}

/**
 * Optimistic existence check for platforms whose only definitive negative signal
 * is a 404. Mirrors the Instagram validator's retry/backoff but resolves every
 * non-404 ambiguity to `exists: true`.
 */
async function httpExists(username: string, targetUrl: string, opts?: ValidatorOptions): Promise<ValidationResult> {
    const fetchImpl = opts?.fetch ?? globalThis.fetch;
    const timeoutMs = opts?.timeoutMs ?? 10_000;
    const maxRetries = opts?.maxRetries ?? 3;
    const backoffBaseMs = opts?.backoffBaseMs ?? 1000;

    const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9"
    };

    let lastStatus = 0;
    let lastError: string | null = null;
    let lastFinalUrl = targetUrl;

    const totalAttempts = Math.max(1, maxRetries + 1);

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetchImpl(targetUrl, {
                method: "GET",
                headers,
                redirect: "follow",
                signal: controller.signal
            });
            clearTimeout(timer);

            lastStatus = response.status;
            lastFinalUrl = response.url || targetUrl;

            if (response.status === 404) {
                return { username, exists: false, statusCode: 404, error: null, finalUrl: lastFinalUrl };
            }

            if (response.status === 200) {
                return { username, exists: true, statusCode: 200, error: null, finalUrl: lastFinalUrl };
            }

            if (RETRYABLE_STATUS_CODES.has(response.status)) {
                lastError = `Retryable status: ${response.status}`;
                if (attempt < totalAttempts - 1) {
                    await sleep(computeBackoff(backoffBaseMs, attempt));
                    continue;
                }
                // Exhausted → optimistic (non-definitive, carries error so it isn't cached).
                return { username, exists: true, statusCode: lastStatus, error: lastError, finalUrl: lastFinalUrl };
            }

            // 403 anti-bot / any other non-200/404 → optimistic, non-definitive.
            return {
                username,
                exists: true,
                statusCode: response.status,
                error: `Non-definitive status: ${response.status}`,
                finalUrl: lastFinalUrl
            };
        } catch (err) {
            clearTimeout(timer);
            const isAbort = err instanceof Error && err.name === "AbortError";
            lastError = isAbort
                ? "Request timeout"
                : `Request failed: ${err instanceof Error ? err.message : String(err)}`;
            if (attempt < totalAttempts - 1) {
                await sleep(computeBackoff(backoffBaseMs, attempt));
                continue;
            }
            // Network/timeout → optimistic, non-definitive.
            return { username, exists: true, statusCode: lastStatus, error: lastError, finalUrl: lastFinalUrl };
        }
    }

    return { username, exists: true, statusCode: lastStatus, error: lastError, finalUrl: lastFinalUrl };
}

export async function validateUsername(
    platform: Platform,
    username: string,
    opts?: ValidatorOptions
): Promise<ValidationResult> {
    if (platform === "instagram") {
        return validateInstagram(username, opts);
    }

    const builder = PROFILE_URL_BUILDERS[platform];
    if (!builder) {
        // facebook / other — no reliable existence endpoint; never block the sync.
        return { username, exists: true, statusCode: 0, error: null, finalUrl: "" };
    }

    return httpExists(username, builder(username), opts);
}
