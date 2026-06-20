/**
 * Client-side image normalization (browser only).
 *
 * Cloudflare Workers AI vision models reliably decode JPEG/PNG/WebP, but NOT
 * AVIF/BMP/TIFF — and a 300 MB+ AVIF folder can't be shipped in one request.
 * Browsers, however, decode AVIF natively. So we decode non-web-safe formats
 * in the browser and re-encode them to JPEG before upload; web-safe formats
 * pass straight through untouched.
 *
 * Pure UI helper — never imported by server code.
 */

const PASSTHROUGH_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const PASSTHROUGH_EXT = /\.(jpe?g|png|webp)$/i;

/** True when a file is already in a model-safe format and can skip re-encoding. */
export function isWebSafe(file: { type: string; name: string }): boolean {
    if (PASSTHROUGH_MIME.has(file.type)) return true;
    // Some pickers report an empty MIME for AVIF/exotic types — fall back to extension.
    if (!file.type && PASSTHROUGH_EXT.test(file.name)) return true;
    return false;
}

async function encodeJpeg(bitmap: ImageBitmap, quality: number): Promise<Blob> {
    const { width, height } = bitmap;
    if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("2d context unavailable");
        ctx.drawImage(bitmap, 0, 0);
        return canvas.convertToBlob({ type: "image/jpeg", quality });
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0);
    return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))), "image/jpeg", quality)
    );
}

/**
 * Returns the file unchanged when it's already web-safe; otherwise decodes it and
 * re-encodes to JPEG. If the browser can't decode it, the original is returned and
 * the server/model decides what to do (graceful degradation, never throws on decode).
 */
export async function normalizeImage(file: File, quality = 0.85): Promise<File> {
    if (isWebSafe(file)) return file;

    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return file;
    }
    try {
        const blob = await encodeJpeg(bitmap, quality);
        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        return new File([blob], name, { type: "image/jpeg" });
    } catch {
        return file;
    } finally {
        bitmap.close();
    }
}

/**
 * Normalizes a list sequentially (bounds peak memory for large folders), invoking
 * `onProgress(done, total)` after each file so the UI can show "Preparing N/Total".
 */
export async function normalizeAll(
    files: File[],
    onProgress?: (done: number, total: number) => void,
    quality = 0.85
): Promise<File[]> {
    const out: File[] = [];
    let done = 0;
    for (const file of files) {
        out.push(await normalizeImage(file, quality));
        onProgress?.(++done, files.length);
    }
    return out;
}
