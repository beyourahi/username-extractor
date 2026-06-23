import { describe, expect, it, vi } from "vitest";
import { validateUsernameCached } from "../cache";

function mockKV() {
    const store = new Map<string, unknown>();
    return {
        store,
        get: vi.fn(async (key: string) => store.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, JSON.parse(value));
        })
    };
}

function fetchReturning(status: number) {
    return vi.fn(async (url: string) => ({ status, url, ok: status < 400 }) as unknown as Response);
}

describe("validateUsernameCached (social)", () => {
    it("keys the cache by platform + lowercased username", async () => {
        const kv = mockKV();
        await validateUsernameCached({ KV: kv as unknown as KVNamespace }, "tiktok", "MrBeast", {
            fetch: fetchReturning(200) as unknown as typeof fetch
        });
        expect([...kv.store.keys()]).toEqual(["tiktok:exists:mrbeast"]);
    });

    it("returns the cached value on a hit without re-fetching", async () => {
        const kv = mockKV();
        const f = fetchReturning(200);
        const env = { KV: kv as unknown as KVNamespace };
        await validateUsernameCached(env, "youtube", "mkbhd", { fetch: f as unknown as typeof fetch });
        await validateUsernameCached(env, "youtube", "mkbhd", { fetch: f as unknown as typeof fetch });
        expect(f).toHaveBeenCalledTimes(1);
    });

    it("does NOT cache non-definitive (error) results — anti-bot must not pin a value", async () => {
        const kv = mockKV();
        const env = { KV: kv as unknown as KVNamespace };
        // 403 → optimistic exists:true but error set → must not be cached.
        const r = await validateUsernameCached(env, "tiktok", "blocked", {
            fetch: fetchReturning(403) as unknown as typeof fetch
        });
        expect(r.exists).toBe(true);
        expect(kv.store.size).toBe(0);
    });

    it("caches a definitive 404 (not-exists)", async () => {
        const kv = mockKV();
        const env = { KV: kv as unknown as KVNamespace };
        const r = await validateUsernameCached(env, "tiktok", "nope", {
            fetch: fetchReturning(404) as unknown as typeof fetch
        });
        expect(r.exists).toBe(false);
        expect(kv.store.get("tiktok:exists:nope")).toMatchObject({ exists: false });
    });
});
