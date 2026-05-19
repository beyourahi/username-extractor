import { describe, expect, it } from "vitest";
import { classifyStatus, tierOf } from "../classify";

describe("classifyStatus", () => {
    it("verifies at exactly 85", () => {
        expect(classifyStatus(85)).toBe("verified");
    });

    it("verifies at 100", () => {
        expect(classifyStatus(100)).toBe("verified");
    });

    it("verifies above 95", () => {
        expect(classifyStatus(99)).toBe("verified");
    });

    it("reviews at 84", () => {
        expect(classifyStatus(84)).toBe("review");
    });

    it("reviews at 0", () => {
        expect(classifyStatus(0)).toBe("review");
    });

    it("reviews negative input", () => {
        expect(classifyStatus(-10)).toBe("review");
    });
});

describe("tierOf", () => {
    it("returns HIGH at 95", () => {
        expect(tierOf(95)).toBe("HIGH");
    });

    it("returns HIGH at 100", () => {
        expect(tierOf(100)).toBe("HIGH");
    });

    it("returns MED at 85", () => {
        expect(tierOf(85)).toBe("MED");
    });

    it("returns MED at 94", () => {
        expect(tierOf(94)).toBe("MED");
    });

    it("returns null at 84", () => {
        expect(tierOf(84)).toBeNull();
    });

    it("returns null at 0", () => {
        expect(tierOf(0)).toBeNull();
    });

    it("returns null at -5", () => {
        expect(tierOf(-5)).toBeNull();
    });
});
