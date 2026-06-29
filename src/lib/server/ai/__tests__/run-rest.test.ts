import { describe, expect, it, vi, afterEach } from "vitest";
import { runVisionViaRest, listVisionModels, CfInferenceError, DEFAULT_VISION_MODEL } from "../run-rest";

const creds = { accountId: "acc123", apiToken: "tok_abc" };

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<unknown>) {
    vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe("runVisionViaRest", () => {
    it("POSTs the chat/image_url schema with bearer auth, and unwraps `result`", async () => {
        let capturedUrl = "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let capturedInit: any = {};
        mockFetch(async (url, init) => {
            capturedUrl = url;
            capturedInit = init;
            return { ok: true, status: 200, json: async () => ({ success: true, result: { response: "x" } }) };
        });

        const out = await runVisionViaRest(creds, "@cf/mistralai/mistral-small-3.1-24b-instruct", {
            image: [1, 2],
            prompt: "p"
        });

        expect(out).toEqual({ response: "x" });
        expect(capturedUrl).toBe(
            "https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/mistralai/mistral-small-3.1-24b-instruct"
        );
        expect(capturedInit.headers.Authorization).toBe("Bearer tok_abc");
        const body = JSON.parse(capturedInit.body);
        // Modern chat-vision schema: messages[].content = [text block, image_url block].
        expect(body.messages[0].role).toBe("user");
        expect(body.messages[0].content[0]).toEqual({ type: "text", text: "p" });
        expect(body.messages[0].content[1].type).toBe("image_url");
        expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
        expect(body.max_tokens).toBe(512);
    });

    it("falls back to the legacy {prompt,image} schema when a model rejects chat (400)", async () => {
        const bodies: string[] = [];
        let call = 0;
        mockFetch(async (_url, init) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            bodies.push((init as any).body);
            call++;
            if (call === 1) return { ok: false, status: 400, json: async () => ({}) };
            return { ok: true, status: 200, json: async () => ({ result: { response: "ok" } }) };
        });

        const out = await runVisionViaRest(creds, "@cf/llava-hf/llava-1.5-7b-hf", { image: [1, 2], prompt: "p" });

        expect(out).toEqual({ response: "ok" });
        expect(call).toBe(2);
        // Second attempt is the legacy image-to-text shape.
        expect(JSON.parse(bodies[1]!)).toMatchObject({ image: [1, 2], prompt: "p" });
    });

    it("maps HTTP status to error kind", async () => {
        const cases: Array<[number, string]> = [
            [401, "auth"],
            [403, "auth"],
            [404, "model_unavailable"],
            [429, "rate_limit"],
            [500, "transport"]
        ];
        for (const [status, kind] of cases) {
            mockFetch(async () => ({ ok: false, status, json: async () => ({}) }));
            await expect(runVisionViaRest(creds, "m", { image: [], prompt: "" })).rejects.toMatchObject({
                kind,
                status
            });
        }
    });
});

describe("listVisionModels", () => {
    it("keeps only vision models (task or tag) and always lists the default first", async () => {
        const result = [
            { name: "@cf/acme/new-vision", task: { name: "Image-Text-to-Text" } }, // dynamic: image task
            { name: "@cf/acme/tagged-vision", task: { name: "Text Generation" }, tags: ["Vision"] }, // dynamic: tag
            { name: "@cf/llava-hf/llava-1.5-7b-hf", task: { name: "Image-to-Text" } }, // known + image task
            { name: "@cf/meta/llama-3.1-8b-instruct", task: { name: "Text Generation" } }, // excluded
            { name: "@cf/baai/bge-m3", task: { name: "Text Embeddings" } } // excluded
        ];
        mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ result }) }));

        const ids = (await listVisionModels(creds)).map((m) => m.id);

        expect(ids[0]).toBe(DEFAULT_VISION_MODEL); // injected + sorted first
        expect(ids).toContain("@cf/acme/new-vision");
        expect(ids).toContain("@cf/acme/tagged-vision");
        expect(ids).toContain("@cf/llava-hf/llava-1.5-7b-hf");
        expect(ids).not.toContain("@cf/meta/llama-3.1-8b-instruct");
        expect(ids).not.toContain("@cf/baai/bge-m3");
    });

    it("throws CfInferenceError(auth) on 403", async () => {
        mockFetch(async () => ({ ok: false, status: 403, json: async () => ({}) }));
        await expect(listVisionModels(creds)).rejects.toBeInstanceOf(CfInferenceError);
    });
});
