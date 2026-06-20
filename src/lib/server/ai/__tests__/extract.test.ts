import { describe, expect, it, vi, afterEach } from "vitest";
import { extractResponseText } from "../gateway";
import { extractUsernameFromImage } from "../extract";

describe("extractResponseText", () => {
    it("returns plain strings unchanged", () => {
        expect(extractResponseText("hello")).toBe("hello");
    });

    it("handles the classic LLaVA `{ response }` shape", () => {
        expect(extractResponseText({ response: "lebron.james" })).toBe("lebron.james");
    });

    it("handles the captioner `{ description }` shape", () => {
        expect(extractResponseText({ description: "kobe" })).toBe("kobe");
    });

    it("handles a top-level `{ text }` shape", () => {
        expect(extractResponseText({ text: "doncic" })).toBe("doncic");
    });

    it("handles OpenAI-compat `{ choices: [{ message: { content } }] }`", () => {
        expect(
            extractResponseText({
                choices: [{ message: { role: "assistant", content: "wembanyama" } }]
            })
        ).toBe("wembanyama");
    });

    it("falls back to choice.text when message.content is missing", () => {
        expect(extractResponseText({ choices: [{ text: "luka" }] })).toBe("luka");
    });

    it("returns empty string for null/undefined/objects without known fields", () => {
        expect(extractResponseText(null)).toBe("");
        expect(extractResponseText(undefined)).toBe("");
        expect(extractResponseText({})).toBe("");
        expect(extractResponseText({ foo: "bar" })).toBe("");
    });
});

describe("extractUsernameFromImage (per-user REST)", () => {
    const creds = { accountId: "acc", apiToken: "tok" };

    afterEach(() => vi.unstubAllGlobals());

    /** Mock the Workers AI REST call: the endpoint wraps model output in `{ success, result }`. */
    function mockRest(inner: unknown, status = 200) {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: status < 400,
                status,
                json: async () => ({ success: status < 400, result: inner })
            }))
        );
    }

    it("returns a verified result for a clean response", async () => {
        mockRest({ response: "lebron.james" });
        const result = await extractUsernameFromImage({
            creds,
            model: "@cf/moonshotai/kimi-k2.6",
            imageBytes: new Uint8Array([1, 2, 3])
        });
        expect(result.username).toBe("lebron.james");
        // confidence: base 85 + valid IG format bonus (+10) = 95
        expect(result.confidence).toBe(95);
        expect(result.status).toBe("verified");
        expect(result.tier).toBe("HIGH");
    });

    it("returns review when the response is hedged", async () => {
        mockRest({ response: "The username appears to be foo.bar" });
        const result = await extractUsernameFromImage({ creds, imageBytes: new Uint8Array([1]) });
        expect(result.confidence).toBeLessThan(95);
    });

    it("returns null username + review when the response is empty", async () => {
        mockRest({ response: "" });
        const result = await extractUsernameFromImage({ creds, imageBytes: new Uint8Array([1]) });
        expect(result.username).toBeNull();
        expect(result.confidence).toBe(0);
        expect(result.tier).toBeNull();
        expect(result.status).toBe("review");
    });
});
