/**
 * Verbatim VLM prompt from the Python extractor.
 *
 * Source: /Users/beyourahi/Desktop/projects/extract_usernames/extract_usernames/_archive/extract_usernames.py:547-552
 *
 * Used Phase 3 onward when calling env.AI.run('@cf/moonshotai/kimi-k2.6', ...).
 * Do not edit casually — any change invalidates the Kimi K2.6 accuracy benchmark
 * recorded against the legacy glm-ocr:bf16 baseline.
 */
export const EXTRACT_USERNAME_PROMPT =
    "Extract the Instagram username from this image. " +
    "The username may contain letters, numbers, dots (.), and underscores (_). " +
    "Return ONLY the username text with no explanation, quotes, or @ symbol. " +
    "Preserve all dots and underscores exactly as shown.";
