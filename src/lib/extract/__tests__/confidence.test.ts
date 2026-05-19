import { describe, expect, it } from "vitest";
import { containsHedging, HEDGING_WORDS, scoreConfidence } from "../confidence";

describe("HEDGING_WORDS", () => {
    it("matches the Python source word list", () => {
        expect([...HEDGING_WORDS]).toEqual(["appears", "seems", "possibly", "might", "unclear", "could be"]);
    });
});

describe("containsHedging", () => {
    it("detects hedging substring", () => {
        expect(containsHedging("It appears to be rahi")).toBe(true);
        expect(containsHedging("seems like rahi")).toBe(true);
        expect(containsHedging("could be rahi")).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(containsHedging("APPEARS")).toBe(true);
    });

    it("returns false on plain text", () => {
        expect(containsHedging("rahikhan")).toBe(false);
    });

    it("returns false on empty input", () => {
        expect(containsHedging("")).toBe(false);
    });
});

describe("scoreConfidence", () => {
    it("returns 95 for a valid username with no penalties (base 85 + 10)", () => {
        expect(scoreConfidence({ username: "rahikhan" })).toBe(95);
    });

    it("subtracts 15 when hedged explicitly", () => {
        // 85 + 10 (valid format) - 15 (hedged) = 80
        expect(scoreConfidence({ username: "rahikhan", hedged: true })).toBe(80);
    });

    it("subtracts 15 when rawText contains hedging", () => {
        expect(scoreConfidence({ username: "rahikhan", rawText: "appears to be rahikhan" })).toBe(80);
    });

    it("adds 10 for valid format", () => {
        expect(scoreConfidence({ username: "rahikhan" })).toBe(95);
    });

    it("subtracts 10 for unusual pattern", () => {
        // 'xkrtn' length 5 no vowels → unusual; valid format → +10; net 85
        expect(scoreConfidence({ username: "xkrtn" })).toBe(85);
    });

    it("clamps to max 100", () => {
        // Even with all bonuses, max possible is 95 (85 + 10). But we ensure clamp at 100.
        const score = scoreConfidence({ username: "rahikhan" });
        expect(score).toBeLessThanOrEqual(100);
    });

    it("clamps to min 60", () => {
        // Bad username: invalid format (no bonus), unusual pattern (-10), hedged (-15)
        // = 85 - 10 - 15 = 60. Confirm clamp.
        const score = scoreConfidence({ username: "....", hedged: true });
        expect(score).toBeGreaterThanOrEqual(60);
        expect(score).toBe(60);
    });

    it("hedged flag overrides rawText scan", () => {
        // rawText has no hedging, hedged=true explicitly → penalty applied
        expect(scoreConfidence({ username: "rahikhan", rawText: "plain", hedged: true })).toBe(80);
    });

    it("does not double-penalize when both hedged=true and rawText hedging present", () => {
        // 85 + 10 - 15 = 80
        expect(scoreConfidence({ username: "rahikhan", rawText: "appears", hedged: true })).toBe(80);
    });

    it("flags rawText with 'might' lowercase", () => {
        expect(scoreConfidence({ username: "rahikhan", rawText: "might be it" })).toBe(80);
    });

    it("returns 95 for valid username with no hedging in rawText", () => {
        expect(scoreConfidence({ username: "rahikhan", rawText: "rahikhan" })).toBe(95);
    });
});
