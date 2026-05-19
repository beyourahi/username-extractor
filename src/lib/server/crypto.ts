/**
 * AES-GCM helpers for encrypting the user's Notion token at rest in D1.
 *
 * The D1 column `user_settings.notion_token_encrypted` is a BLOB structured as
 * `[12-byte IV] || [ciphertext + auth tag]`. Encryption uses WebCrypto only —
 * no Node `crypto` imports — so this module is safe to call from any Workers
 * route handler.
 *
 * `maskToken` mirrors the Python helper at `config.py:122-128` so the rendered
 * settings UI matches the CLI's display.
 */

const IV_LENGTH_BYTES = 12;
const AES_KEY_LENGTH_BYTES = 32;

function base64Decode(input: string): Uint8Array {
    const binary = atob(input);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

/** Derive an AES-GCM 256 CryptoKey from a base64-encoded 32-byte secret. */
export async function deriveTokenKey(base64Key: string): Promise<CryptoKey> {
    const raw = base64Decode(base64Key);
    if (raw.length !== AES_KEY_LENGTH_BYTES) {
        throw new Error(
            `deriveTokenKey: expected ${AES_KEY_LENGTH_BYTES}-byte key after base64 decode, got ${raw.length} bytes`
        );
    }
    return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptNotionToken(plaintext: string, key: CryptoKey): Promise<Uint8Array> {
    const iv = new Uint8Array(IV_LENGTH_BYTES);
    crypto.getRandomValues(iv);

    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const cipher = new Uint8Array(cipherBuf);

    const blob = new Uint8Array(IV_LENGTH_BYTES + cipher.length);
    blob.set(iv, 0);
    blob.set(cipher, IV_LENGTH_BYTES);
    return blob;
}

export async function decryptNotionToken(blob: Uint8Array, key: CryptoKey): Promise<string> {
    if (blob.length <= IV_LENGTH_BYTES) {
        throw new Error(`decryptNotionToken: blob too short (${blob.length} bytes); expected > ${IV_LENGTH_BYTES}`);
    }
    const iv = blob.slice(0, IV_LENGTH_BYTES);
    const cipher = blob.slice(IV_LENGTH_BYTES);

    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new TextDecoder().decode(plainBuf);
}

/** Token render mask matching the Python `config.py:122-128` helper: first 10 chars + "..." */
export function maskToken(plaintext: string): string {
    if (plaintext.length <= 10) return plaintext;
    return plaintext.slice(0, 10) + "...";
}
