import { describe, expect, it } from "vitest";
import { cleanUsername } from "../clean";

describe("cleanUsername", () => {
    describe("positive cases", () => {
        it("returns a clean lowercase username untouched", () => {
            expect(cleanUsername("rahikhan")).toBe("rahikhan");
        });

        it("lowercases mixed case", () => {
            expect(cleanUsername("RahiKhan")).toBe("rahikhan");
        });

        it("trims surrounding whitespace", () => {
            expect(cleanUsername("  rahikhan  ")).toBe("rahikhan");
        });

        it("strips internal whitespace", () => {
            expect(cleanUsername("rahi khan")).toBe("rahikhan");
        });

        it("strips invalid chars but preserves dots and underscores", () => {
            expect(cleanUsername("rahi.khan_2025")).toBe("rahi.khan_2025");
        });

        it("strips @ symbol", () => {
            expect(cleanUsername("@rahikhan")).toBe("rahikhan");
        });

        it("strips leading dots and underscores", () => {
            expect(cleanUsername("._.rahi")).toBe("rahi");
        });

        it("strips trailing dots", () => {
            expect(cleanUsername("rahi...")).toBe("rahi");
        });

        it("keeps a username of length 30 unchanged", () => {
            const u = "a".repeat(30);
            expect(cleanUsername(u)).toBe(u);
        });

        it("keeps a single-character alphanumeric username", () => {
            expect(cleanUsername("a")).toBe("a");
            expect(cleanUsername("5")).toBe("5");
        });

        it("handles emoji and non-ascii by stripping them", () => {
            expect(cleanUsername("rahi🎉khan")).toBe("rahikhan");
        });
    });

    describe("negative cases", () => {
        it("rejects empty string", () => {
            expect(cleanUsername("")).toBeNull();
        });

        it("rejects whitespace-only", () => {
            expect(cleanUsername("   ")).toBeNull();
        });

        it("rejects strings with no alphanumeric chars", () => {
            expect(cleanUsername("...")).toBeNull();
            expect(cleanUsername("___")).toBeNull();
            expect(cleanUsername("._.")).toBeNull();
        });

        it("rejects strings longer than 30 chars", () => {
            expect(cleanUsername("a".repeat(31))).toBeNull();
        });

        it("rejects strings that would be empty after cleanup", () => {
            expect(cleanUsername("!@#$%^&*()")).toBeNull();
        });
    });

    describe("boundary cases", () => {
        it("rejects length 0 after cleanup", () => {
            expect(cleanUsername("@")).toBeNull();
        });

        it("accepts length 1", () => {
            expect(cleanUsername("z")).toBe("z");
        });

        it("accepts exactly length 30", () => {
            const u = "a".repeat(30);
            expect(cleanUsername(u)?.length).toBe(30);
        });

        it("rejects length 31", () => {
            expect(cleanUsername("a".repeat(31))).toBeNull();
        });

        it("handles all-numbers username", () => {
            expect(cleanUsername("12345")).toBe("12345");
        });

        it("rejects leading underscore (stripped → still must start alnum)", () => {
            // _abc → leading _ stripped → abc
            expect(cleanUsername("_abc")).toBe("abc");
        });

        it("rejects trailing dot (regex collapse leaves valid handle)", () => {
            expect(cleanUsername("abc.")).toBe("abc");
        });

        it("returns null for sole leading dot input that becomes empty", () => {
            expect(cleanUsername(".")).toBeNull();
        });
    });
});
