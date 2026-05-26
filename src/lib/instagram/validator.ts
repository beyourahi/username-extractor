/**
 * Instagram existence check. Workers-runtime port of
 * `extract_usernames/integrations/instagram_validator.py`.
 *
 * INVARIANT (PRD §FR-15): NEVER throws. All failure modes — timeout, network,
 * unexpected status — surface via `ValidationResult.error` so callers can
 * persist without try/catch.
 *
 * Retry policy mirrors the Python original:
 *   - Retryable statuses: 429, 500, 502, 503, 504.
 *   - Up to `maxRetries` (default 3) retries on top of 1 initial attempt.
 *   - Exponential backoff `base * 2^attempt`, capped at BACKOFF_CAP_MS.
 *
 * Result semantics:
 *   200 + final URL not /accounts/login → exists: true
 *   200 + /accounts/login redirect      → exists: false, error: "Account requires login"
 *   404                                 → exists: false, error: "Account not found"
 *   retryable (after exhaustion)        → exists: false, error: "Retryable status: <code>"
 *   other                               → exists: false, error: "Unexpected status: <code>"
 *   timeout (AbortError)                → exists: false, error: "Request timeout"
 */

export interface ValidationResult {
    username: string;
    exists: boolean;
    statusCode: number;
    error: string | null;
    finalUrl: string;
}

export interface ValidatorOptions {
    /** Injected fetch (defaults to globalThis.fetch). */
    fetch?: typeof fetch;
    /** Per-request timeout in ms (default 10_000). */
    timeoutMs?: number;
    /** Max retries on retryable status codes (default 3). */
    maxRetries?: number;
    /** Base backoff in ms (default 1000). Capped at 10_000. Exponential. */
    backoffBaseMs?: number;
}

const RETRYABLE_STATUS_CODES = new Set<number>([429, 500, 502, 503, 504]);
const BACKOFF_CAP_MS = 10_000;
const USER_AGENT = "username-extractor/1.0";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(base: number, attempt: number): number {
    // attempt is 0-indexed: returns base, 2*base, 4*base, … capped at BACKOFF_CAP_MS.
    const raw = base * Math.pow(2, attempt);
    return Math.min(raw, BACKOFF_CAP_MS);
}

function buildUrl(username: string): string {
    return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}

export async function validateUsername(username: string, opts?: ValidatorOptions): Promise<ValidationResult> {
    const fetchImpl = opts?.fetch ?? globalThis.fetch;
    const timeoutMs = opts?.timeoutMs ?? 10_000;
    const maxRetries = opts?.maxRetries ?? 3;
    const backoffBaseMs = opts?.backoffBaseMs ?? 1000;

    const targetUrl = buildUrl(username);
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

            if (RETRYABLE_STATUS_CODES.has(response.status)) {
                lastError = `Retryable status: ${response.status}`;
                if (attempt < totalAttempts - 1) {
                    await sleep(computeBackoff(backoffBaseMs, attempt));
                    continue;
                }
                return {
                    username,
                    exists: false,
                    statusCode: lastStatus,
                    error: lastError,
                    finalUrl: lastFinalUrl
                };
            }

            if (response.status === 200) {
                const redirectedToLogin = lastFinalUrl.includes("/accounts/login");
                if (redirectedToLogin) {
                    return {
                        username,
                        exists: false,
                        statusCode: 200,
                        error: "Account requires login",
                        finalUrl: lastFinalUrl
                    };
                }
                return {
                    username,
                    exists: true,
                    statusCode: 200,
                    error: null,
                    finalUrl: lastFinalUrl
                };
            }

            if (response.status === 404) {
                return {
                    username,
                    exists: false,
                    statusCode: 404,
                    error: "Account not found",
                    finalUrl: lastFinalUrl
                };
            }

            // Any other non-retryable, non-200/404 status.
            return {
                username,
                exists: false,
                statusCode: response.status,
                error: `Unexpected status: ${response.status}`,
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
            return {
                username,
                exists: false,
                statusCode: lastStatus,
                error: lastError,
                finalUrl: lastFinalUrl
            };
        }
    }

    // Unreachable in practice; the loop always returns. Satisfies the type checker.
    return {
        username,
        exists: false,
        statusCode: lastStatus,
        error: lastError ?? "Unknown error",
        finalUrl: lastFinalUrl
    };
}
