import { describe, expect, it } from "vitest";
import { findSimilarExisting, levenshteinDistance } from "../distance";

describe("levenshteinDistance", () => {
    it("returns 0 for equal strings", () => {
        expect(levenshteinDistance("rahi", "rahi")).toBe(0);
    });

    it("returns length when one side is empty", () => {
        expect(levenshteinDistance("", "rahi")).toBe(4);
        expect(levenshteinDistance("rahi", "")).toBe(4);
    });

    it("returns 0 for two empty strings", () => {
        expect(levenshteinDistance("", "")).toBe(0);
    });

    it("counts single insertion", () => {
        expect(levenshteinDistance("rahi", "rahik")).toBe(1);
    });

    it("counts single deletion", () => {
        expect(levenshteinDistance("rahik", "rahi")).toBe(1);
    });

    it("counts single substitution", () => {
        expect(levenshteinDistance("rahi", "raha")).toBe(1);
    });

    it("counts mixed edits", () => {
        expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    });

    it("is symmetric", () => {
        expect(levenshteinDistance("abc", "abcd")).toBe(levenshteinDistance("abcd", "abc"));
    });

    it("handles long strings", () => {
        const a = "a".repeat(30);
        const b = "b".repeat(30);
        expect(levenshteinDistance(a, b)).toBe(30);
    });
});

describe("findSimilarExisting", () => {
    it("finds a 1-edit match", () => {
        const result = findSimilarExisting("rahi", ["raha", "other"], 2);
        expect(result).toEqual({ match: "raha", distance: 1 });
    });

    it("returns null when nothing within distance", () => {
        const result = findSimilarExisting("rahi", ["xxxxxxx", "yyyyy"], 2);
        expect(result).toBeNull();
    });

    it("skips entries with length diff exceeding maxDistance", () => {
        // 'rahi' (4) vs 'rahikhansomething' (17): diff 13 > 2 → skipped
        const result = findSimilarExisting("rahi", ["rahikhansomething"], 2);
        expect(result).toBeNull();
    });

    it("skips exact matches (distance 0)", () => {
        const result = findSimilarExisting("rahi", ["rahi", "raha"], 2);
        expect(result).toEqual({ match: "raha", distance: 1 });
    });

    it("returns the smallest-distance match", () => {
        const result = findSimilarExisting("rahi", ["raha", "raho", "other"], 2);
        expect(result?.distance).toBe(1);
    });

    it("returns null for empty existing", () => {
        expect(findSimilarExisting("rahi", [], 2)).toBeNull();
    });

    it("returns null for empty input username", () => {
        expect(findSimilarExisting("", ["abc"], 2)).toBeNull();
    });

    it("uses default maxDistance of 2", () => {
        // distance 3 → not returned
        expect(findSimilarExisting("abc", ["zzzz"])).toBeNull();
    });

    it("accepts iterable other than array", () => {
        const set = new Set(["raha", "other"]);
        const result = findSimilarExisting("rahi", set, 2);
        expect(result).toEqual({ match: "raha", distance: 1 });
    });
});
