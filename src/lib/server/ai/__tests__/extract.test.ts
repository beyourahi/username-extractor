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

    it("parses structured JSON for an Instagram handle (legacy scoring path intact)", async () => {
        mockRest({ response: '{"platform":"instagram","username":"lebron.james","kind":"handle"}' });
        const result = await extractUsernameFromImage({
            creds,
            model: "@cf/moonshotai/kimi-k2.6",
            imageBytes: new Uint8Array([1, 2, 3])
        });
        expect(result.username).toBe("lebron.james");
        expect(result.platform).toBe("instagram");
        expect(result.kind).toBe("handle");
        expect(result.profileUrl).toBe("https://instagram.com/lebron.james");
        // confidence: base 85 + valid IG format bonus (+10) = 95 — identical to the legacy pipeline.
        expect(result.confidence).toBe(95);
        expect(result.status).toBe("verified");
        expect(result.tier).toBe("HIGH");
    });

    it("falls back to a bare-string handle on `other` when the model ignores the JSON instruction", async () => {
        mockRest({ response: "lebron.james" });
        const result = await extractUsernameFromImage({ creds, imageBytes: new Uint8Array([1]) });
        expect(result.username).toBe("lebron.james");
        expect(result.platform).toBe("other");
        expect(result.kind).toBe("handle");
        expect(result.profileUrl).toBeNull();
        // `other` reuses the IG validator → +10 bonus → 95 (preserves legacy bare-string scoring).
        expect(result.confidence).toBe(95);
    });

    it("parses a TikTok handle and builds the TikTok profile URL", async () => {
        mockRest({ response: '```json\n{"platform":"tiktok","username":"mrbeast","kind":"handle"}\n```' });
        const result = await extractUsernameFromImage({ creds, imageBytes: new Uint8Array([1]) });
        expect(result.username).toBe("mrbeast");
        expect(result.platform).toBe("tiktok");
        expect(result.profileUrl).toBe("https://www.tiktok.com/@mrbeast");
        expect(result.confidence).toBe(95);
    });

    it("handles a display_name result (no handle visible) without a profile URL", async () => {
        mockRest({ response: '{"platform":"youtube","username":"MrBeast Gaming","kind":"display_name"}' });
        const result = await extractUsernameFromImage({ creds, imageBytes: new Uint8Array([1]) });
        expect(result.username).toBe("MrBeast Gaming"); // case + space preserved
        expect(result.platform).toBe("youtube");
        expect(result.kind).toBe("display_name");
        expect(result.profileUrl).toBeNull();
        // display names skip the handle-format bonus → base 85 → verified / MED.
        expect(result.confidence).toBe(85);
        expect(result.tier).toBe("MED");
    });

    it("returns review when the response is hedged", async () => {
        mockRest({ response: '{"platform":"instagram","username":"foo.bar","kind":"handle"} (appears blurry)' });
        const result = await extractUsernameFromImage({ creds, imageBytes: new Uint8Array([1]) });
        expect(result.username).toBe("foo.bar");
        expect(result.confidence).toBeLessThan(95);
    });

    it("returns null username + review when the response is empty", async () => {
        mockRest({ response: "" });
        const result = await extractUsernameFromImage({ creds, imageBytes: new Uint8Array([1]) });
        expect(result.username).toBeNull();
        expect(result.platform).toBe("other");
        expect(result.profileUrl).toBeNull();
        expect(result.confidence).toBe(0);
        expect(result.tier).toBeNull();
        expect(result.status).toBe("review");
    });
});
