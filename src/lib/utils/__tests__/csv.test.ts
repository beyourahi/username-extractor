import { describe, it, expect } from "vitest";
import { csvField, toCsv } from "../csv";

describe("csvField", () => {
    it("passes plain values through unquoted", () => {
        expect(csvField("brand_name")).toBe("brand_name");
        expect(csvField(42)).toBe("42");
    });

    it("renders null/undefined as empty string", () => {
        expect(csvField(null)).toBe("");
        expect(csvField(undefined)).toBe("");
    });

    it("quotes and escapes fields containing comma, quote, CR or LF", () => {
        expect(csvField("a,b")).toBe('"a,b"');
        expect(csvField('she said "hi"')).toBe('"she said ""hi"""');
        expect(csvField("line1\nline2")).toBe('"line1\nline2"');
    });
});

describe("toCsv", () => {
    it("emits a header row plus CRLF-delimited rows", () => {
        const csv = toCsv(
            ["username", "confidence"],
            [
                ["alpha", 96],
                ["beta", 88]
            ]
        );
        expect(csv).toBe("username,confidence\r\nalpha,96\r\nbeta,88");
    });

    it("escapes problematic values inside rows", () => {
        const csv = toCsv(["a", "b"], [["x,y", 'z"q']]);
        expect(csv).toBe('a,b\r\n"x,y","z""q"');
    });

    it("returns just the header for empty rows", () => {
        expect(toCsv(["a", "b"], [])).toBe("a,b");
    });
});
