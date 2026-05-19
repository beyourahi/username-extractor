import { describe, expect, it, vi } from "vitest";
import { validateUsernameCached } from "../cache";

function mockResponse(status: number, finalUrl: string): Response {
    return {
        status,
        url: finalUrl,
        ok: status >= 200 && status < 300,
        headers: new Headers()
    } as unknown as Response;
}

interface MockKV {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
}

function makeKv(initial: Record<string, unknown> = {}): MockKV {
    const store = new Map<string, string>();
    for (const [k, v] of Object.entries(initial)) {
        store.set(k, JSON.stringify(v));
    }
    return {
        get: vi.fn(async (key: string, type?: string) => {
            const raw = store.get(key);
            if (raw === undefined) return null;
            if (type === "json") return JSON.parse(raw);
            return raw;
        }),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        })
    };
}

describe("validateUsernameCached", () => {
    it("returns cache hit without calling fetch", async () => {
        const cached = { exists: true, checkedAt: 1700000000000 };
        const kv = makeKv({ "ig:exists:cached_user": cached });
        const fetchMock = vi.fn();

        const result = await validateUsernameCached({ KV: kv as unknown as KVNamespace }, "cached_user", {
            fetch: fetchMock as unknown as typeof fetch
        });

        expect(result).toEqual(cached);
        expect(kv.get).toHaveBeenCalledWith("ig:exists:cached_user", "json");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(kv.put).not.toHaveBeenCalled();
    });

    it("writes-through on cache miss for a successful validation", async () => {
        const kv = makeKv();
        const fetchMock = vi.fn(async () => mockResponse(200, "https://www.instagram.com/freshuser/"));

        const result = await validateUsernameCached({ KV: kv as unknown as KVNamespace }, "freshuser", {
            fetch: fetchMock as unknown as typeof fetch,
            ttlSeconds: 60
        });

        expect(result.exists).toBe(true);
        expect(typeof result.checkedAt).toBe("number");
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(kv.put).toHaveBeenCalledTimes(1);
        const [putKey, putValue, putOpts] = kv.put.mock.calls[0] ?? [];
        expect(putKey).toBe("ig:exists:freshuser");
        const parsed = JSON.parse(String(putValue)) as { exists: boolean };
        expect(parsed.exists).toBe(true);
        expect(putOpts).toEqual({ expirationTtl: 60 });
    });

    it("does NOT cache a transient-error result", async () => {
        const kv = makeKv();
        // Use a fetch that throws synchronously so retries resolve via the catch
        // path immediately — keeps the test under the default 5s timeout without
        // bloating the public cache API with retry-tuning knobs.
        const fetchMock = vi.fn(async () => {
            throw new Error("ECONNRESET");
        });

        const result = await validateUsernameCached({ KV: kv as unknown as KVNamespace }, "somebody", {
            fetch: fetchMock as unknown as typeof fetch
        });

        // The underlying validator exhausted retries and returned an error result.
        expect(result.exists).toBe(false);
        expect(kv.put).not.toHaveBeenCalled();
    }, 20_000);

    it("force: true bypasses the cache and writes the fresh result", async () => {
        const stale = { exists: false, checkedAt: 1 };
        const kv = makeKv({ "ig:exists:revisit": stale });
        const fetchMock = vi.fn(async () => mockResponse(200, "https://www.instagram.com/revisit/"));

        const result = await validateUsernameCached({ KV: kv as unknown as KVNamespace }, "revisit", {
            fetch: fetchMock as unknown as typeof fetch,
            force: true
        });

        expect(result.exists).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        // KV.get should not be consulted when force is set.
        expect(kv.get).not.toHaveBeenCalled();
        expect(kv.put).toHaveBeenCalledTimes(1);
    });
});
