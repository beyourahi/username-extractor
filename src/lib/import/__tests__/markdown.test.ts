import { describe, expect, it } from "vitest";
import { loadUsernamesFromMarkdown } from "../markdown";

describe("loadUsernamesFromMarkdown", () => {
    it("returns empty for empty input", () => {
        expect(loadUsernamesFromMarkdown("")).toEqual([]);
    });

    it("parses plain usernames", () => {
        const md = "rahi\nkhan\nuser3";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan", "user3"]);
    });

    it("strips - bullet prefix", () => {
        const md = "- rahi\n- khan";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan"]);
    });

    it("strips * bullet prefix", () => {
        const md = "* rahi\n* khan";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan"]);
    });

    it("strips • bullet prefix", () => {
        const md = "• rahi\n• khan";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan"]);
    });

    it("strips numbered list prefix", () => {
        const md = "1. rahi\n2. khan\n10. third";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan", "third"]);
    });

    it("strips @ prefix", () => {
        const md = "@rahi\n@khan";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan"]);
    });

    it("strips multiple leading @s", () => {
        const md = "@@rahi";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi"]);
    });

    it("strips bullet then @", () => {
        const md = "- @rahi\n* @khan";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan"]);
    });

    it("skips empty lines", () => {
        const md = "rahi\n\nkhan\n\n";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan"]);
    });

    it("skips headers", () => {
        const md = "# Leads\n## Important\nrahi\nkhan";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan"]);
    });

    it("takes only the first whitespace-delimited token", () => {
        const md = "rahi some extra notes\nkhan another note";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan"]);
    });

    it("preserves order while deduping", () => {
        const md = "rahi\nkhan\nrahi\nthird";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan", "third"]);
    });

    it("handles CRLF line endings", () => {
        const md = "rahi\r\nkhan\r\n";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan"]);
    });

    it("handles mixed real-world markdown", () => {
        const md = `# Leads

- rahi
* khan
• @user3
1. fourth
@fifth
plainuser six words

# Done`;
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi", "khan", "user3", "fourth", "fifth", "plainuser"]);
    });

    it("ignores trailing whitespace tokens", () => {
        const md = "   rahi   ";
        expect(loadUsernamesFromMarkdown(md)).toEqual(["rahi"]);
    });
});
