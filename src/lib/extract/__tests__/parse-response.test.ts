import { describe, expect, it } from "vitest";
import { parseProfileResponse } from "../parse-response";

describe("parseProfileResponse", () => {
    it("parses clean one-line JSON", () => {
        expect(parseProfileResponse('{"platform":"instagram","username":"john.doe","kind":"handle"}')).toEqual({
            platform: "instagram",
            username: "john.doe",
            kind: "handle"
        });
    });

    it("strips ```json code fences", () => {
        const text = '```json\n{"platform":"tiktok","username":"mrbeast","kind":"handle"}\n```';
        expect(parseProfileResponse(text)).toEqual({ platform: "tiktok", username: "mrbeast", kind: "handle" });
    });

    it("ignores leading and trailing prose around the object", () => {
        const text = 'Here is the result: {"platform":"youtube","username":"mkbhd","kind":"handle"} — done.';
        expect(parseProfileResponse(text)).toEqual({ platform: "youtube", username: "mkbhd", kind: "handle" });
    });

    it("recovers single-quoted JSON", () => {
        const text = "{'platform':'facebook','username':'zuck','kind':'handle'}";
        expect(parseProfileResponse(text)).toEqual({ platform: "facebook", username: "zuck", kind: "handle" });
    });

    it("defaults missing kind to handle", () => {
        expect(parseProfileResponse('{"platform":"instagram","username":"john"}').kind).toBe("handle");
    });

    it("strips a leading @ and forces kind=handle when @-prefixed", () => {
        expect(parseProfileResponse('{"platform":"instagram","username":"@john","kind":"display_name"}')).toEqual({
            platform: "instagram",
            username: "john",
            kind: "handle"
        });
    });

    it("maps platform synonyms to canonical ids", () => {
        expect(parseProfileResponse('{"platform":"IG","username":"a"}').platform).toBe("instagram");
        expect(parseProfileResponse('{"platform":"FB","username":"a"}').platform).toBe("facebook");
        expect(parseProfileResponse('{"platform":"YouTube channel","username":"a"}').platform).toBe("youtube");
        expect(parseProfileResponse('{"platform":"instagram.com","username":"a"}').platform).toBe("instagram");
    });

    it("falls back to `other` for unknown platforms", () => {
        expect(parseProfileResponse('{"platform":"threads","username":"a"}').platform).toBe("other");
    });

    it("honors an explicit display_name kind", () => {
        expect(parseProfileResponse('{"platform":"facebook","username":"John Doe","kind":"display_name"}')).toEqual({
            platform: "facebook",
            username: "John Doe",
            kind: "display_name"
        });
    });

    it("falls back to a bare-string handle on `other` when the text is not JSON", () => {
        expect(parseProfileResponse("lebron.james")).toEqual({
            platform: "other",
            username: "lebron.james",
            kind: "handle"
        });
    });

    it("strips a leading @ in the bare-string fallback too", () => {
        expect(parseProfileResponse("@lebron.james")).toEqual({
            platform: "other",
            username: "lebron.james",
            kind: "handle"
        });
    });

    it("returns an empty handle fallback for empty input", () => {
        expect(parseProfileResponse("")).toEqual({ platform: "other", username: "", kind: "handle" });
        expect(parseProfileResponse("   ")).toEqual({ platform: "other", username: "", kind: "handle" });
    });

    it("falls back when JSON has no usable username field", () => {
        // No username/handle/name → treat the whole text as a bare candidate.
        const text = '{"platform":"instagram","foo":"bar"}';
        expect(parseProfileResponse(text)).toEqual({ platform: "other", username: text, kind: "handle" });
    });

    // ── M-020 fixes ──────────────────────────────────────────────────────────

    it("keeps the LAST valid object when the model echoes an example before the real answer", () => {
        // Chatty VLMs emit a placeholder example first, the real answer last.
        const text =
            ' or {"platform":"youtube","username":"Example Name","kind":"display_name"})\n\n' +
            '{"platform":"instagram","username":"ebonyperkins.evolvedfinance","kind":"handle"}';
        expect(parseProfileResponse(text)).toEqual({
            platform: "instagram",
            username: "ebonyperkins.evolvedfinance",
            kind: "handle"
        });
    });

    it("recovers the real answer after a stray </think> tag", () => {
        const text = '</think>{"platform":"facebook","username":"ecrockville","kind":"handle"}';
        expect(parseProfileResponse(text)).toEqual({
            platform: "facebook",
            username: "ecrockville",
            kind: "handle"
        });
    });

    it('unwraps a nested {"description":"…json…"} envelope (llava)', () => {
        const text =
            '{"description":" {\\"platform\\": \\"instagram\\", \\"username\\": \\"luzentto\\", \\"kind\\": \\"handle\\"}"}';
        expect(parseProfileResponse(text)).toEqual({
            platform: "instagram",
            username: "luzentto",
            kind: "handle"
        });
    });

    it("does NOT split a JSON object whose string value contains braces", () => {
        const text = '{"platform":"instagram","username":"a{b}c","kind":"handle"}';
        expect(parseProfileResponse(text)).toEqual({ platform: "instagram", username: "a{b}c", kind: "handle" });
    });
});
