/**
 * VLM extraction prompt. Verbatim port of Python `extract_usernames.py:547-552`.
 *
 * FROZEN STRING: editing invalidates the docs/benchmark.md accuracy run for
 * `@cf/moonshotai/kimi-k2.6`. Any change must be paired with a fresh benchmark.
 */
export const EXTRACT_USERNAME_PROMPT =
    "Extract the Instagram username from this image. " +
    "The username may contain letters, numbers, dots (.), and underscores (_). " +
    "Return ONLY the username text with no explanation, quotes, or @ symbol. " +
    "Preserve all dots and underscores exactly as shown.";
