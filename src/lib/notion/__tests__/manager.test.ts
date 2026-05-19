import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@notionhq/client";
import { NotionDatabaseManager } from "../manager";

interface MockClientState {
    retrieveMock: ReturnType<typeof vi.fn>;
    queryMock: ReturnType<typeof vi.fn>;
    createMock: ReturnType<typeof vi.fn>;
}

function makeClient(state: Partial<MockClientState> = {}): { client: Client; state: MockClientState } {
    const retrieveMock = state.retrieveMock ?? vi.fn();
    const queryMock = state.queryMock ?? vi.fn();
    const createMock = state.createMock ?? vi.fn();
    const client = {
        databases: { retrieve: retrieveMock },
        dataSources: { query: queryMock },
        pages: { create: createMock }
    } as unknown as Client;
    return { client, state: { retrieveMock, queryMock, createMock } };
}

describe("NotionDatabaseManager.cleanDatabaseId", () => {
    const expected = "300472d4ce5181aa83f2000b8ae958d2";

    it("accepts a bare 32-char hex id", () => {
        expect(NotionDatabaseManager.cleanDatabaseId(expected)).toBe(expected);
    });

    it("strips dashes from a dashed UUID", () => {
        expect(NotionDatabaseManager.cleanDatabaseId("300472d4-ce51-81aa-83f2-000b8ae958d2")).toBe(expected);
    });

    it("extracts the id from a full Notion URL with query params", () => {
        const url = `https://notion.so/300472d4-ce51-81aa-83f2-000b8ae958d2?v=abc123`;
        expect(NotionDatabaseManager.cleanDatabaseId(url)).toBe(expected);
    });

    it("returns empty string for empty input", () => {
        expect(NotionDatabaseManager.cleanDatabaseId("")).toBe("");
    });
});

describe("NotionDatabaseManager.detectPropertyNames", () => {
    it("detects properties by type and 'social' hint for url", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({
            properties: {
                "Brand Name": { type: "title" },
                "Social Media Account": { type: "url" },
                Status: { type: "status" }
            },
            data_sources: [{ id: "ds-1" }]
        });
        const mgr = NotionDatabaseManager.withClient(client, "abc");
        const names = await mgr.detectPropertyNames();
        expect(names).toEqual({
            title: "Brand Name",
            url: "Social Media Account",
            status: "Status"
        });
    });

    it("falls back to first url-typed property when none match 'social'", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({
            properties: {
                Handle: { type: "title" },
                Website: { type: "url" }
            },
            data_sources: [{ id: "ds-1" }]
        });
        const mgr = NotionDatabaseManager.withClient(client, "abc");
        const names = await mgr.detectPropertyNames();
        expect(names.title).toBe("Handle");
        expect(names.url).toBe("Website");
        expect(names.status).toBeNull();
    });

    it("returns sensible defaults when schema is empty", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({ properties: {}, data_sources: [] });
        const mgr = NotionDatabaseManager.withClient(client, "abc");
        const names = await mgr.detectPropertyNames();
        expect(names.title).toBe("Brand Name");
        expect(names.url).toBe("Social Media Account");
        expect(names.status).toBeNull();
    });

    it("memoizes results across calls", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({
            properties: { N: { type: "title" } },
            data_sources: [{ id: "ds-1" }]
        });
        const mgr = NotionDatabaseManager.withClient(client, "abc");
        await mgr.detectPropertyNames();
        await mgr.detectPropertyNames();
        expect(state.retrieveMock).toHaveBeenCalledTimes(1);
    });
});

describe("NotionDatabaseManager.getAllExistingUsernames", () => {
    it("paginates and lowercases usernames", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({
            properties: {
                "Brand Name": { type: "title" },
                URL: { type: "url" }
            },
            data_sources: [{ id: "ds-1" }]
        });
        state.queryMock
            .mockResolvedValueOnce({
                results: [
                    {
                        id: "p1",
                        properties: { "Brand Name": { title: [{ plain_text: "Alice" }] } }
                    },
                    {
                        id: "p2",
                        properties: { "Brand Name": { title: [{ plain_text: "Bob" }] } }
                    }
                ],
                has_more: true,
                next_cursor: "cursor-1"
            })
            .mockResolvedValueOnce({
                results: [
                    {
                        id: "p3",
                        properties: { "Brand Name": { title: [{ plain_text: "CHARLIE" }] } }
                    }
                ],
                has_more: false,
                next_cursor: null
            });

        const mgr = NotionDatabaseManager.withClient(client, "abc", { rateLimitMs: 0 });
        const usernames = await mgr.getAllExistingUsernames();
        expect(usernames).toEqual(new Set(["alice", "bob", "charlie"]));
        expect(state.queryMock).toHaveBeenCalledTimes(2);
        const secondCall = state.queryMock.mock.calls[1]?.[0] as { start_cursor?: string };
        expect(secondCall?.start_cursor).toBe("cursor-1");
    });

    it("returns cached set on subsequent calls", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({
            properties: { "Brand Name": { type: "title" } },
            data_sources: [{ id: "ds-1" }]
        });
        state.queryMock.mockResolvedValue({ results: [], has_more: false, next_cursor: null });

        const mgr = NotionDatabaseManager.withClient(client, "abc", { rateLimitMs: 0 });
        await mgr.getAllExistingUsernames();
        await mgr.getAllExistingUsernames();
        expect(state.queryMock).toHaveBeenCalledTimes(1);

        await mgr.getAllExistingUsernames({ forceRefresh: true });
        expect(state.queryMock).toHaveBeenCalledTimes(2);
    });
});

describe("NotionDatabaseManager.createPage", () => {
    it("builds the properties payload with detected property names and database_id parent", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({
            properties: {
                "Brand Name": { type: "title" },
                "Social Media Account": { type: "url" },
                Status: { type: "status" }
            },
            data_sources: [{ id: "ds-1" }]
        });
        state.createMock.mockResolvedValue({ id: "new-page-id" });

        const mgr = NotionDatabaseManager.withClient(client, "300472d4ce5181aa83f2000b8ae958d2", {
            rateLimitMs: 0
        });
        const result = await mgr.createPage({
            username: "rahi.khan",
            instagramUrl: "https://instagram.com/rahi.khan"
        });

        expect(result.pageId).toBe("new-page-id");
        expect(state.createMock).toHaveBeenCalledTimes(1);

        const payload = state.createMock.mock.calls[0]?.[0] as {
            parent: { database_id?: string; data_source_id?: string };
            properties: Record<string, unknown>;
        };
        // Modern SDK path: parent uses database_id, NOT data_source_id.
        expect(payload.parent.database_id).toBe("300472d4ce5181aa83f2000b8ae958d2");
        expect(payload.parent.data_source_id).toBeUndefined();

        expect(payload.properties["Brand Name"]).toEqual({
            title: [{ text: { content: "rahi.khan" } }]
        });
        expect(payload.properties["Social Media Account"]).toEqual({
            url: "https://instagram.com/rahi.khan"
        });
        expect(payload.properties["Status"]).toEqual({ status: { name: "Didn't Approach" } });
    });

    it("omits status property when database has no status field", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({
            properties: {
                Handle: { type: "title" },
                Site: { type: "url" }
            },
            data_sources: [{ id: "ds-1" }]
        });
        state.createMock.mockResolvedValue({ id: "p1" });

        const mgr = NotionDatabaseManager.withClient(client, "abc", { rateLimitMs: 0 });
        await mgr.createPage({ username: "u", instagramUrl: "https://x" });
        const payload = state.createMock.mock.calls[0]?.[0] as { properties: Record<string, unknown> };
        expect(Object.keys(payload.properties)).toEqual(["Handle", "Site"]);
    });
});

describe("NotionDatabaseManager rate limiter timing", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("inserts a delay between consecutive requests", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({
            properties: { "Brand Name": { type: "title" } },
            data_sources: [{ id: "ds-1" }]
        });
        state.queryMock.mockResolvedValue({ results: [], has_more: false, next_cursor: null });

        const mgr = NotionDatabaseManager.withClient(client, "abc", { rateLimitMs: 1000 });

        const promise = mgr.getAllExistingUsernames();
        // First we drain the retrieve (cached after) + query — both gated by enforceRateLimit.
        await vi.runAllTimersAsync();
        await promise;

        // Now force a refresh: this should issue another query, gated by 1000ms.
        const t0 = Date.now();
        const second = mgr.getAllExistingUsernames({ forceRefresh: true });
        // Without advancing timers, the throttle delay should not have elapsed.
        await vi.advanceTimersByTimeAsync(500);
        // Should still be pending — give the event loop a chance.
        let resolved = false;
        void second.then(() => {
            resolved = true;
        });
        await Promise.resolve();
        expect(resolved).toBe(false);

        await vi.advanceTimersByTimeAsync(1000);
        await second;
        const elapsed = Date.now() - t0;
        expect(elapsed).toBeGreaterThanOrEqual(1000);
    });
});

describe("NotionDatabaseManager.batchCreatePages", () => {
    it("skips duplicates and records failures with errors", async () => {
        const { client, state } = makeClient();
        state.retrieveMock.mockResolvedValue({
            properties: {
                "Brand Name": { type: "title" },
                URL: { type: "url" }
            },
            data_sources: [{ id: "ds-1" }]
        });
        state.queryMock.mockResolvedValue({
            results: [
                {
                    id: "existing",
                    properties: { "Brand Name": { title: [{ plain_text: "Alice" }] } }
                }
            ],
            has_more: false,
            next_cursor: null
        });
        state.createMock.mockResolvedValue({ id: "new" });

        const mgr = NotionDatabaseManager.withClient(client, "abc", { rateLimitMs: 0 });
        const result = await mgr.batchCreatePages([
            { username: "alice", instagramUrl: "https://x/alice" }, // skipped (duplicate)
            { username: "bob", instagramUrl: "https://x/bob" }, // created
            { username: "", instagramUrl: "https://x/empty" } // failed
        ]);

        expect(result.total).toBe(3);
        expect(result.created).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.failed).toBe(1);
        expect(state.createMock).toHaveBeenCalledTimes(1);
    });
});
