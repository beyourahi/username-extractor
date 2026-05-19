import { describe, expect, it } from "vitest";
import { EXTRACT_USERNAME_PROMPT } from "../prompt";

describe("EXTRACT_USERNAME_PROMPT", () => {
    it("is verbatim from Python source _archive/extract_usernames.py:547-552", () => {
        // Single string, no leading/trailing whitespace, four sentences.
        expect(EXTRACT_USERNAME_PROMPT).toMatchInlineSnapshot(
            `"Extract the Instagram username from this image. The username may contain letters, numbers, dots (.), and underscores (_). Return ONLY the username text with no explanation, quotes, or @ symbol. Preserve all dots and underscores exactly as shown."`
        );
    });

    it("does not include @ symbol guidance that the model might literally output", () => {
        // The prompt explicitly asks to omit @ — verify we haven't accidentally
        // included it as a sample. This caught a regression once.
        const matches = EXTRACT_USERNAME_PROMPT.match(/@/g);
        expect(matches?.length ?? 0).toBe(1); // "no ... @ symbol" only
    });
});
