import { describe, expect, it, vi } from "vitest";
import { validateUsername } from "../validator";

/** Minimal fetch stub returning a fixed status + final URL. */
function fetchReturning(status: number) {
    return vi.fn(async (url: string) => ({ status, url, ok: status < 400 }) as unknown as Response);
}

describe("validateUsername (social, per-platform)", () => {
    it("TikTok 200 → exists, hits the @-prefixed URL", async () => {
        const f = fetchReturning(200);
        const r = await validateUsername("tiktok", "mrbeast", { fetch: f as unknown as typeof fetch });
        expect(r.exists).toBe(true);
        expect(r.error).toBeNull();
        expect(f.mock.calls[0]?.[0]).toBe("https://www.tiktok.com/@mrbeast");
    });

    it("TikTok 404 → not exists (definitive, no error)", async () => {
        const r = await validateUsername("tiktok", "nope", { fetch: fetchReturning(404) as unknown as typeof fetch });
        expect(r.exists).toBe(false);
        expect(r.error).toBeNull();
    });

    it("TikTok 403 anti-bot → OPTIMISTIC exists with a non-definitive error (never marks invalid)", async () => {
        const r = await validateUsername("tiktok", "blocked", {
            fetch: fetchReturning(403) as unknown as typeof fetch,
            maxRetries: 0
        });
        expect(r.exists).toBe(true);
        expect(r.error).not.toBeNull();
    });

    it("TikTok 429 (exhausted) → optimistic exists, non-definitive error", async () => {
        const r = await validateUsername("tiktok", "rl", {
            fetch: fetchReturning(429) as unknown as typeof fetch,
            maxRetries: 0
        });
        expect(r.exists).toBe(true);
        expect(r.error).not.toBeNull();
    });

    it("YouTube 200 → exists, correct URL", async () => {
        const f = fetchReturning(200);
        const r = await validateUsername("youtube", "mkbhd", { fetch: f as unknown as typeof fetch });
        expect(r.exists).toBe(true);
        expect(f.mock.calls[0]?.[0]).toBe("https://www.youtube.com/@mkbhd");
    });

    it("Facebook → skipped (exists, no network call)", async () => {
        const f = vi.fn();
        const r = await validateUsername("facebook", "zuckerberg", { fetch: f as unknown as typeof fetch });
        expect(r.exists).toBe(true);
        expect(r.error).toBeNull();
        expect(f).not.toHaveBeenCalled();
    });

    it("other → skipped (exists, no network call)", async () => {
        const f = vi.fn();
        const r = await validateUsername("other", "anything", { fetch: f as unknown as typeof fetch });
        expect(r.exists).toBe(true);
        expect(f).not.toHaveBeenCalled();
    });
});
