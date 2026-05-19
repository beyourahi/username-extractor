import { describe, expect, it } from "vitest";
import { buildConnectionErrorHelp } from "../errors";

describe("buildConnectionErrorHelp", () => {
    it("includes the raw error message verbatim", () => {
        const help = buildConnectionErrorHelp("validation_error", "boom: invalid_payload");
        expect(help).toContain("boom: invalid_payload");
        expect(help).toContain("Could not connect to Notion database");
        expect(help).toContain("Troubleshooting Steps");
    });

    it("renders the object_not_found branch when the code matches", () => {
        const help = buildConnectionErrorHelp("object_not_found", "Could not find database");
        expect(help).toContain("Add connections");
        expect(help).toContain("'...' (three dots)");
        expect(help).toContain("notion.so/YOUR-ID-HERE");
    });

    it("renders the object_not_found branch when only the message hints at it", () => {
        const help = buildConnectionErrorHelp("unknown", "could not find database with that ID");
        expect(help).toContain("Add connections");
    });

    it("renders the unauthorized branch with my-integrations link", () => {
        const help = buildConnectionErrorHelp("unauthorized", "API token is invalid");
        expect(help).toContain("https://www.notion.so/my-integrations");
        expect(help).toContain("Regenerate");
        expect(help).not.toContain("Add connections");
    });

    it("renders the generic fallback when neither pattern matches", () => {
        const help = buildConnectionErrorHelp("rate_limited", "Too many requests");
        // Generic branch references BOTH sharing AND integration token.
        expect(help).toContain("Verify database sharing");
        expect(help).toContain("https://www.notion.so/my-integrations");
        expect(help).toContain("Verify database ID");
    });

    it("always appends the setup-guide footer", () => {
        const help = buildConnectionErrorHelp("anything", "anything");
        expect(help).toContain("github.com/beyourahi/extract_usernames#notion-integration");
    });
});
