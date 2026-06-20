import { describe, it, expect } from "vitest";
import { isWebSafe } from "../normalizeImage";

/**
 * Only `isWebSafe` is unit-tested here — `normalizeImage`/`normalizeAll` depend on
 * `createImageBitmap` + canvas, which are browser-only and not available under the
 * node test environment. The decode/re-encode path is exercised manually via the
 * Playwright sample run (see plan verification).
 */
describe("isWebSafe", () => {
    it("treats jpeg/png/webp MIME types as web-safe (pass-through)", () => {
        expect(isWebSafe({ type: "image/jpeg", name: "a.jpg" })).toBe(true);
        expect(isWebSafe({ type: "image/png", name: "a.png" })).toBe(true);
        expect(isWebSafe({ type: "image/webp", name: "a.webp" })).toBe(true);
    });

    it("flags AVIF/BMP/TIFF as needing normalization", () => {
        expect(isWebSafe({ type: "image/avif", name: "a.avif" })).toBe(false);
        expect(isWebSafe({ type: "image/bmp", name: "a.bmp" })).toBe(false);
        expect(isWebSafe({ type: "image/tiff", name: "a.tiff" })).toBe(false);
    });

    it("falls back to extension when the picker reports an empty MIME", () => {
        expect(isWebSafe({ type: "", name: "photo.JPG" })).toBe(true);
        expect(isWebSafe({ type: "", name: "photo.avif" })).toBe(false);
    });
});
