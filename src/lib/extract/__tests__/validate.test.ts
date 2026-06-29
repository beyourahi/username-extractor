import { describe, expect, it } from "vitest";
import { hasUnusualPattern, isValidInstagramFormat, isPlaceholderName } from "../validate";

describe("isValidInstagramFormat", () => {
    describe("positive cases", () => {
        it("accepts a simple lowercase username", () => {
            expect(isValidInstagramFormat("rahikhan")).toBe(true);
        });

        it("accepts digits", () => {
            expect(isValidInstagramFormat("user2025")).toBe(true);
        });

        it("accepts dots and underscores in the middle", () => {
            expect(isValidInstagramFormat("rahi.khan_2025")).toBe(true);
        });

        it("accepts length 1", () => {
            expect(isValidInstagramFormat("a")).toBe(true);
        });

        it("accepts length 30", () => {
            expect(isValidInstagramFormat("a".repeat(30))).toBe(true);
        });
    });

    describe("negative cases", () => {
        it("rejects empty string", () => {
            expect(isValidInstagramFormat("")).toBe(false);
        });

        it("rejects length 31", () => {
            expect(isValidInstagramFormat("a".repeat(31))).toBe(false);
        });

        it("rejects uppercase", () => {
            expect(isValidInstagramFormat("Rahi")).toBe(false);
        });

        it("rejects leading dot", () => {
            expect(isValidInstagramFormat(".rahi")).toBe(false);
        });

        it("rejects leading underscore", () => {
            expect(isValidInstagramFormat("_rahi")).toBe(false);
        });

        it("rejects trailing dot", () => {
            expect(isValidInstagramFormat("rahi.")).toBe(false);
        });

        it("rejects consecutive dots", () => {
            expect(isValidInstagramFormat("ra..hi")).toBe(false);
        });

        it("rejects invalid chars (hyphen)", () => {
            expect(isValidInstagramFormat("rahi-khan")).toBe(false);
        });

        it("rejects emoji", () => {
            expect(isValidInstagramFormat("rahi🎉")).toBe(false);
        });
    });

    describe("boundary cases", () => {
        it("accepts trailing underscore", () => {
            expect(isValidInstagramFormat("rahi_")).toBe(true);
        });

        it("accepts mid-string consecutive underscores", () => {
            expect(isValidInstagramFormat("rahi__khan")).toBe(true);
        });
    });
});

describe("hasUnusualPattern", () => {
    describe("flags suspicious", () => {
        it("flags 4 consecutive dots", () => {
            expect(hasUnusualPattern("rahi....khan")).toBe(true);
        });

        it("flags 4 consecutive underscores", () => {
            expect(hasUnusualPattern("rahi____khan")).toBe(true);
        });

        it("flags >50% special chars", () => {
            expect(hasUnusualPattern("a._._.")).toBe(true);
        });

        it("flags long username with no vowels", () => {
            expect(hasUnusualPattern("xkrtn")).toBe(true);
        });

        it("flags empty string", () => {
            expect(hasUnusualPattern("")).toBe(true);
        });
    });

    describe("does not flag", () => {
        it("does not flag a normal username", () => {
            expect(hasUnusualPattern("rahikhan")).toBe(false);
        });

        it("does not flag <50% specials", () => {
            expect(hasUnusualPattern("rahi.khan")).toBe(false);
        });

        it("does not flag short string with no vowels", () => {
            expect(hasUnusualPattern("xy")).toBe(false);
        });

        it("does not flag length 4 consonant-only string", () => {
            expect(hasUnusualPattern("xkrt")).toBe(false);
        });
    });

    describe("boundary cases", () => {
        it("flags at length 5 with no vowels", () => {
            expect(hasUnusualPattern("xkrtn")).toBe(true);
        });

        it("treats single non-vowel char as fine", () => {
            expect(hasUnusualPattern("z")).toBe(false);
        });

        it("flags exactly 50%+ specials", () => {
            // 2 specials of 3 chars => 66% > 50%
            expect(hasUnusualPattern("a..")).toBe(true);
        });
    });
});

describe("isPlaceholderName", () => {
    it("flags the placeholders models echo when they can't read a handle", () => {
        for (const p of [
            "Some Display Name",
            "My Channel",
            "Example Name",
            "example_name",
            "Channel Name",
            "John Doe"
        ]) {
            expect(isPlaceholderName(p)).toBe(true);
        }
    });

    it("does not flag real brand handles", () => {
        for (const real of ["luzzentobd", "ranowofficialbd", "coffeetrapdhaka", "handifyy_", "punsandpaws.shop"]) {
            expect(isPlaceholderName(real)).toBe(false);
        }
    });

    it("returns false for empty input", () => {
        expect(isPlaceholderName("")).toBe(false);
    });
});
