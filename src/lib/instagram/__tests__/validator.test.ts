import { describe, expect, it, vi } from "vitest";
import { validateUsername } from "../validator";

function mockResponse(status: number, finalUrl: string): Response {
    // Minimal duck-typed Response — only the fields the validator reads.
    return {
        status,
        url: finalUrl,
        ok: status >= 200 && status < 300,
        headers: new Headers()
    } as unknown as Response;
}

describe("validateUsername", () => {
    it("returns exists=true on a clean 200", async () => {
        const fetchMock = vi.fn((..._args: Parameters<typeof fetch>) =>
            Promise.resolve(mockResponse(200, "https://www.instagram.com/cristiano/"))
        );
        const result = await validateUsername("cristiano", {
            fetch: fetchMock as unknown as typeof fetch,
            backoffBaseMs: 1
        });
        expect(result.exists).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.error).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const firstCall = fetchMock.mock.calls[0];
        expect(firstCall?.[0]).toBe("https://www.instagram.com/cristiano/");
    });

    it("treats 200 redirected to /accounts/login as not-exists", async () => {
        const fetchMock = vi.fn(async () =>
            mockResponse(200, "https://www.instagram.com/accounts/login/?next=/ghost_handle/")
        );
        const result = await validateUsername("ghost_handle", { fetch: fetchMock, backoffBaseMs: 1 });
        expect(result.exists).toBe(false);
        expect(result.statusCode).toBe(200);
        expect(result.error).toBe("Account requires login");
    });

    it("returns exists=false on 404", async () => {
        const fetchMock = vi.fn(async () => mockResponse(404, "https://www.instagram.com/nonexistent/"));
        const result = await validateUsername("nonexistent", { fetch: fetchMock, backoffBaseMs: 1 });
        expect(result.exists).toBe(false);
        expect(result.statusCode).toBe(404);
        expect(result.error).toBe("Account not found");
    });

    it("retries on 429 and then succeeds", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(mockResponse(429, "https://www.instagram.com/somebody/"))
            .mockResolvedValueOnce(mockResponse(429, "https://www.instagram.com/somebody/"))
            .mockResolvedValueOnce(mockResponse(200, "https://www.instagram.com/somebody/"));

        const result = await validateUsername("somebody", {
            fetch: fetchMock,
            backoffBaseMs: 1,
            maxRetries: 3
        });
        expect(result.exists).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("exhausts retries on persistent 429 and returns an error result", async () => {
        const fetchMock = vi.fn(async () => mockResponse(429, "https://www.instagram.com/ratelimited/"));
        const result = await validateUsername("ratelimited", {
            fetch: fetchMock,
            backoffBaseMs: 1,
            maxRetries: 2
        });
        expect(result.exists).toBe(false);
        expect(result.statusCode).toBe(429);
        expect(result.error).toMatch(/Retryable status: 429/);
        // 1 initial + 2 retries = 3 calls.
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("returns an error result when fetch aborts (timeout)", async () => {
        const fetchMock = (async (_input: unknown, init?: { signal?: AbortSignal }) => {
            return new Promise<Response>((_resolve, reject) => {
                const signal = init?.signal;
                if (signal) {
                    signal.addEventListener("abort", () => {
                        const err = new Error("The operation was aborted.");
                        err.name = "AbortError";
                        reject(err);
                    });
                }
            });
        }) as unknown as typeof fetch;

        const result = await validateUsername("slowhandle", {
            fetch: fetchMock,
            backoffBaseMs: 1,
            timeoutMs: 5,
            maxRetries: 1
        });
        expect(result.exists).toBe(false);
        expect(result.error).toBe("Request timeout");
    });
});
