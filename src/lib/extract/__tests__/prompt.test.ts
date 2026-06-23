import { describe, expect, it } from "vitest";
import { EXTRACT_USERNAME_PROMPT, DETECT_PROFILE_PROMPT } from "../prompt";

describe("EXTRACT_USERNAME_PROMPT", () => {
    it("is verbatim from Python source _archive/extract_usernames.py:547-552", () => {
        // Regression guard: edits invalidate docs/benchmark.md. Snapshot is intentional.
        expect(EXTRACT_USERNAME_PROMPT).toMatchInlineSnapshot(
            `"Extract the Instagram username from this image. The username may contain letters, numbers, dots (.), and underscores (_). Return ONLY the username text with no explanation, quotes, or @ symbol. Preserve all dots and underscores exactly as shown."`
        );
    });

    it("does not include @ symbol guidance that the model might literally output", () => {
        // Prior regression: extra `@example` text in the prompt caused the model to echo `@`.
        // The only allowed `@` is in the phrase "no ... @ symbol".
        const matches = EXTRACT_USERNAME_PROMPT.match(/@/g);
        expect(matches?.length ?? 0).toBe(1);
    });
});

describe("DETECT_PROFILE_PROMPT", () => {
    it("is the verbatim multi-platform detection prompt (regression guard)", () => {
        // Edits change extraction behavior on EVERY platform and invalidate docs/benchmark.md.
        expect(DETECT_PROFILE_PROMPT).toMatchInlineSnapshot(
            `"You are analyzing a screenshot of a social media profile. Identify the platform and extract the account identifier.
platform must be exactly one of: instagram, facebook, tiktok, youtube, other.
Prefer the @handle / username shown next to the @ symbol or in the profile URL. Usernames may contain letters, numbers, dots (.), underscores (_), and hyphens (-). Preserve every dot, underscore, and hyphen exactly as shown. Do not add or remove an @.
If NO @handle or username is visible, return the display name, channel name, or page name instead.
Set kind to "handle" when you return an @handle/username, or "display_name" when you return a display/channel/page name.
Respond with ONLY a single-line JSON object and nothing else — no markdown, no code fences, no explanation.
Format: {"platform":"instagram","username":"example_name","kind":"handle"}"`
        );
    });

    it("instructs the model to return JSON only (no fences/prose)", () => {
        expect(DETECT_PROFILE_PROMPT).toContain("ONLY a single-line JSON object");
        expect(DETECT_PROFILE_PROMPT).toContain("no code fences");
    });

    it("enumerates the five supported platforms", () => {
        for (const p of ["instagram", "facebook", "tiktok", "youtube", "other"]) {
            expect(DETECT_PROFILE_PROMPT).toContain(p);
        }
    });
});
