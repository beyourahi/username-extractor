import { describe, expect, it } from "vitest";
import { decryptNotionToken, deriveTokenKey, encryptNotionToken, maskToken } from "../crypto";

function randomBase64Key(): string {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    let binary = "";
    for (const b of raw) binary += String.fromCharCode(b);
    return btoa(binary);
}

describe("crypto helpers", () => {
    it("round-trips encrypt → decrypt to recover the plaintext", async () => {
        const key = await deriveTokenKey(randomBase64Key());
        const plaintext = "secret_ntn_AbCd1234567890XYZ";
        const blob = await encryptNotionToken(plaintext, key);
        const recovered = await decryptNotionToken(blob, key);
        expect(recovered).toBe(plaintext);
        // First 12 bytes are the IV; total length is IV + ciphertext + 16-byte GCM tag.
        expect(blob.length).toBeGreaterThan(plaintext.length + 12);
    });

    it("produces distinct ciphertexts across calls (IV is random)", async () => {
        const key = await deriveTokenKey(randomBase64Key());
        const plaintext = "secret_ntn_AbCd1234567890XYZ";
        const a = await encryptNotionToken(plaintext, key);
        const b = await encryptNotionToken(plaintext, key);
        // Compare byte-by-byte: at least the IV portion (first 12 bytes) must differ
        // with overwhelming probability.
        const ivA = Array.from(a.slice(0, 12)).join(",");
        const ivB = Array.from(b.slice(0, 12)).join(",");
        expect(ivA).not.toBe(ivB);
        // And the ciphertext bodies should differ too.
        const bodyA = Array.from(a.slice(12)).join(",");
        const bodyB = Array.from(b.slice(12)).join(",");
        expect(bodyA).not.toBe(bodyB);
    });

    it("rejects a key whose decoded length is not 32 bytes", async () => {
        // 16-byte key, base64-encoded.
        const short = btoa("0123456789abcdef");
        await expect(deriveTokenKey(short)).rejects.toThrow(/32-byte/);
    });

    it("rejects a blob shorter than the IV", async () => {
        const key = await deriveTokenKey(randomBase64Key());
        await expect(decryptNotionToken(new Uint8Array(8), key)).rejects.toThrow(/too short/);
    });

    describe("maskToken", () => {
        it("returns short inputs unchanged", () => {
            expect(maskToken("")).toBe("");
            expect(maskToken("short")).toBe("short");
            expect(maskToken("1234567890")).toBe("1234567890"); // exactly 10
        });

        it("masks long inputs with first 10 chars + '...'", () => {
            expect(maskToken("12345678901")).toBe("1234567890...");
            expect(maskToken("secret_ntn_FullTokenValue")).toBe("secret_ntn...");
        });
    });
});
