import { describe, expect, it } from "vitest";
import { PLATFORM_LABELS, buildProfileUrl, cleanDisplayName, getPlatform, type Platform } from "../platform";
import { cleanUsername } from "$lib/extract/clean";
import { isValidInstagramFormat } from "$lib/extract/validate";

describe("platform registry", () => {
    it("Instagram delegates to the frozen functions BY REFERENCE (zero drift guarantee)", () => {
        const ig = getPlatform("instagram");
        expect(ig.cleanHandle).toBe(cleanUsername);
        expect(ig.isValidFormat).toBe(isValidInstagramFormat);
        expect(ig.buildProfileUrl("john.doe")).toBe("https://instagram.com/john.doe");
    });

    it("falls back to `other` for unknown ids", () => {
        expect(getPlatform("threads").id).toBe("other");
        expect(getPlatform(null).id).toBe("other");
        expect(getPlatform(undefined).id).toBe("other");
    });

    it("has a human label for every platform", () => {
        expect(PLATFORM_LABELS).toEqual({
            instagram: "Instagram",
            facebook: "Facebook",
            tiktok: "TikTok",
            youtube: "YouTube",
            other: "Other"
        });
    });

    describe("TikTok cleaner (max 24, [a-z0-9._])", () => {
        const tt = getPlatform("tiktok");
        it("cleans and lowercases, stripping @", () => {
            expect(tt.cleanHandle("@MrBeast")).toBe("mrbeast");
        });
        it("strips hyphens (not allowed on TikTok)", () => {
            expect(tt.cleanHandle("mr-beast")).toBe("mrbeast");
        });
        it("rejects over-length handles (>24)", () => {
            expect(tt.cleanHandle("a".repeat(25))).toBeNull();
            expect(tt.cleanHandle("a".repeat(24))).toBe("a".repeat(24));
        });
        it("builds the @-prefixed profile URL", () => {
            expect(tt.buildProfileUrl("mrbeast")).toBe("https://www.tiktok.com/@mrbeast");
        });
    });

    describe("YouTube cleaner (3–30, allows hyphen)", () => {
        const yt = getPlatform("youtube");
        it("keeps hyphens", () => {
            expect(yt.cleanHandle("@cool-channel")).toBe("cool-channel");
        });
        it("rejects under-length handles (<3)", () => {
            expect(yt.cleanHandle("ab")).toBeNull();
            expect(yt.cleanHandle("abc")).toBe("abc");
        });
        it("builds the @-prefixed profile URL", () => {
            expect(yt.buildProfileUrl("mkbhd")).toBe("https://www.youtube.com/@mkbhd");
        });
    });

    describe("Facebook cleaner (min 5, [a-z0-9.])", () => {
        const fb = getPlatform("facebook");
        it("rejects too-short vanity names (<5)", () => {
            expect(fb.cleanHandle("zuck")).toBeNull();
            expect(fb.cleanHandle("zuckerberg")).toBe("zuckerberg");
        });
        it("strips underscores (not allowed in FB vanity)", () => {
            expect(fb.cleanHandle("john_smith")).toBe("johnsmith");
        });
        it("builds the profile URL", () => {
            expect(fb.buildProfileUrl("zuckerberg")).toBe("https://www.facebook.com/zuckerberg");
        });
    });

    describe("other (lenient, IG validator reused)", () => {
        const other = getPlatform("other");
        it("reuses the Instagram format validator", () => {
            expect(other.isValidFormat).toBe(isValidInstagramFormat);
        });
        it("has no canonical URL", () => {
            expect(other.buildProfileUrl("anything")).toBe("");
        });
    });
});

describe("buildProfileUrl (top-level)", () => {
    it("returns null for display-name leads regardless of platform", () => {
        expect(buildProfileUrl("instagram", "john", "display_name")).toBeNull();
    });
    it("returns null for the `other` platform", () => {
        expect(buildProfileUrl("other", "john", "handle")).toBeNull();
    });
    it("returns null for an empty username", () => {
        expect(buildProfileUrl("tiktok", "", "handle")).toBeNull();
        expect(buildProfileUrl("tiktok", null, "handle")).toBeNull();
    });
    it("builds per-platform URLs for handles", () => {
        const cases: Array<[Platform, string]> = [
            ["instagram", "https://instagram.com/john"],
            ["tiktok", "https://www.tiktok.com/@john"],
            ["youtube", "https://www.youtube.com/@john"],
            ["facebook", "https://www.facebook.com/john"]
        ];
        for (const [p, url] of cases) {
            expect(buildProfileUrl(p, "john", "handle")).toBe(url);
        }
    });
});

describe("cleanDisplayName", () => {
    it("preserves case and internal spaces", () => {
        expect(cleanDisplayName("MrBeast Gaming")).toBe("MrBeast Gaming");
    });
    it("collapses whitespace and trims", () => {
        expect(cleanDisplayName("  John   Doe \n")).toBe("John Doe");
    });
    it("strips surrounding quotes", () => {
        expect(cleanDisplayName('"John Doe"')).toBe("John Doe");
    });
    it("caps at 64 characters", () => {
        const long = "a".repeat(100);
        expect(cleanDisplayName(long)?.length).toBe(64);
    });
    it("returns null for empty/whitespace-only input", () => {
        expect(cleanDisplayName("")).toBeNull();
        expect(cleanDisplayName("   ")).toBeNull();
    });
});
