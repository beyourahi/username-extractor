import { describe, expect, it, vi } from "vitest";
import type { Client } from "@notionhq/client";
import { deduplicate, findDuplicates, scoreUsername, type DedupResult, type NotionRow } from "../dedup";

function row(partial: Partial<NotionRow> & { pageId: string; url: string }): NotionRow {
    return {
        username: partial.username ?? "",
        createdAt: partial.createdAt ?? 0,
        ...partial
    };
}

function makeMockClient(): { client: Client; updateMock: ReturnType<typeof vi.fn> } {
    const updateMock = vi.fn().mockResolvedValue({});
    const client = {
        pages: { update: updateMock }
    } as unknown as Client;
    return { client, updateMock };
}

describe("scoreUsername", () => {
    it("returns 0 for empty string", () => {
        expect(scoreUsername("")).toBe(0);
    });

    it("returns -1000 for numeric-only usernames", () => {
        expect(scoreUsername("1")).toBe(-1000);
        expect(scoreUsername("123")).toBe(-1000);
        expect(scoreUsername("1.")).toBe(-1000);
        expect(scoreUsername("42.")).toBe(-1000);
    });

    it("penalizes a digit-starting username with -50", () => {
        // "9abc": -50 (digit start) + 0 (no alpha first) + floor(3/4 * 50)=37 +
        // 50 (length bracket) + 4*2=8 (length<15 bonus) + 10 (lowercase) = 55
        expect(scoreUsername("9abc")).toBe(55);
    });

    it("rewards an alpha-starting username with +100", () => {
        // "abc": +100 + 50 alpha ratio (3/3 * 50) + 50 (length) + 3*2=6 + 10 lowercase = 216
        expect(scoreUsername("abc")).toBe(216);
    });

    it("applies the 3–30 length bracket bonus", () => {
        const inside = scoreUsername("abc"); // 216
        const outside = scoreUsername("ab"); // shorter than 3
        // "ab": +100 + floor(2/2 * 50)=50 + -20 (length penalty) + 2*2=4 + 10 = 144
        expect(inside).toBeGreaterThan(outside);
        expect(outside).toBe(144);
    });

    it("caps the length bonus at 15 chars", () => {
        const at15 = scoreUsername("abcdefghijklmno"); // 15 chars
        const at20 = scoreUsername("abcdefghijklmnopqrst"); // 20 chars

        // Length bonus component is min(len, 15) * 2 → identical for both
        // But alpha ratio + length bracket may shift. Both fall in 3–30 and are 100% alpha,
        // so the only difference is +2 for chars 16+ being absent → at20 should equal at15.
        expect(at20).toBe(at15);
    });

    it("awards the lowercase bonus", () => {
        const lower = scoreUsername("abc");
        const upper = scoreUsername("ABC");
        expect(lower - upper).toBe(10);
    });

    it("ranks 'rahi.khan' above '1.'", () => {
        expect(scoreUsername("rahi.khan")).toBeGreaterThan(scoreUsername("1."));
    });
});

describe("findDuplicates", () => {
    it("returns empty map when there are no duplicates", () => {
        const rows = [
            row({ pageId: "p1", url: "https://instagram.com/a", username: "a" }),
            row({ pageId: "p2", url: "https://instagram.com/b", username: "b" })
        ];
        expect(findDuplicates(rows).size).toBe(0);
    });

    it("groups rows by URL when there are duplicates", () => {
        const rows = [
            row({ pageId: "p1", url: "https://instagram.com/a", username: "a" }),
            row({ pageId: "p2", url: "https://instagram.com/a", username: "1." }),
            row({ pageId: "p3", url: "https://instagram.com/b", username: "b" }),
            row({ pageId: "p4", url: "https://instagram.com/a", username: "a_real" })
        ];
        const groups = findDuplicates(rows);
        expect(groups.size).toBe(1);
        const entries = groups.get("https://instagram.com/a");
        expect(entries).toBeDefined();
        expect(entries).toHaveLength(3);
    });

    it("skips rows without URLs", () => {
        const rows = [row({ pageId: "p1", url: "", username: "a" }), row({ pageId: "p2", url: "", username: "a" })];
        expect(findDuplicates(rows).size).toBe(0);
    });
});

describe("deduplicate", () => {
    it("dryRun does not call pages.update", async () => {
        const { client, updateMock } = makeMockClient();
        const rows: NotionRow[] = [
            row({ pageId: "loser", url: "https://x", username: "1." }),
            row({ pageId: "winner", url: "https://x", username: "real_handle" })
        ];

        const result: DedupResult = await deduplicate({ client, rows, dryRun: true });
        expect(updateMock).not.toHaveBeenCalled();
        expect(result.duplicateGroups).toBe(1);
        expect(result.duplicatesFound).toBe(1);
        expect(result.duplicatesRemoved).toBe(0);
        expect(result.archivedPageIds).toContain("loser");
    });

    it("keeps the highest-scoring username under 'best' strategy", async () => {
        const { client, updateMock } = makeMockClient();
        const rows: NotionRow[] = [
            row({ pageId: "loser1", url: "https://x", username: "1." }),
            row({ pageId: "winner", url: "https://x", username: "real_handle" }),
            row({ pageId: "loser2", url: "https://x", username: "2." })
        ];

        const result = await deduplicate({ client, rows, keepStrategy: "best", rateLimitMs: 0 });
        expect(result.duplicatesRemoved).toBe(2);
        expect(updateMock).toHaveBeenCalledTimes(2);

        const archivedIds = updateMock.mock.calls.map((call) => (call[0] as { page_id: string }).page_id);
        expect(archivedIds.sort()).toEqual(["loser1", "loser2"]);
        // Winner is never archived
        expect(archivedIds).not.toContain("winner");
        // All update calls archive
        for (const call of updateMock.mock.calls) {
            expect((call[0] as { archived: boolean }).archived).toBe(true);
        }
    });

    it("keeps the oldest entry under 'oldest' strategy", async () => {
        const { client, updateMock } = makeMockClient();
        const rows: NotionRow[] = [
            row({ pageId: "old", url: "https://x", username: "abc", createdAt: 100 }),
            row({ pageId: "mid", url: "https://x", username: "abc", createdAt: 200 }),
            row({ pageId: "new", url: "https://x", username: "abc", createdAt: 300 })
        ];

        await deduplicate({ client, rows, keepStrategy: "oldest", rateLimitMs: 0 });
        const archivedIds = updateMock.mock.calls.map((call) => (call[0] as { page_id: string }).page_id);
        expect(archivedIds.sort()).toEqual(["mid", "new"]);
    });

    it("keeps the newest entry under 'newest' strategy", async () => {
        const { client, updateMock } = makeMockClient();
        const rows: NotionRow[] = [
            row({ pageId: "old", url: "https://x", username: "abc", createdAt: 100 }),
            row({ pageId: "mid", url: "https://x", username: "abc", createdAt: 200 }),
            row({ pageId: "new", url: "https://x", username: "abc", createdAt: 300 })
        ];

        await deduplicate({ client, rows, keepStrategy: "newest", rateLimitMs: 0 });
        const archivedIds = updateMock.mock.calls.map((call) => (call[0] as { page_id: string }).page_id);
        expect(archivedIds.sort()).toEqual(["mid", "old"]);
    });

    it("collects errors when pages.update rejects", async () => {
        const updateMock = vi.fn().mockRejectedValueOnce(new Error("forbidden"));
        const client = { pages: { update: updateMock } } as unknown as Client;
        const rows: NotionRow[] = [
            row({ pageId: "loser", url: "https://x", username: "1." }),
            row({ pageId: "winner", url: "https://x", username: "real_handle" })
        ];

        const result = await deduplicate({ client, rows, rateLimitMs: 0 });
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.pageId).toBe("loser");
        expect(result.errors[0]?.error).toContain("forbidden");
        expect(result.duplicatesRemoved).toBe(0);
    });
});
