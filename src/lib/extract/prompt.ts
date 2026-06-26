/**
 * Multi-platform detection + extraction prompt. The default for every image since
 * the tool went platform-agnostic: the model identifies the platform AND extracts
 * the @handle (or, when no handle is visible, the display/channel/page name).
 *
 * FROZEN-ish: editing this string changes extraction behavior on EVERY platform
 * (Instagram included) and invalidates the docs/benchmark.md accuracy run. Any
 * change must be paired with a fresh `bun run benchmark` and the ship-gate re-check.
 */
export const DETECT_PROFILE_PROMPT =
    "You are analyzing a screenshot of a social media profile. " +
    "Identify the platform and extract the account identifier.\n" +
    "platform must be exactly one of: instagram, facebook, tiktok, youtube, other.\n" +
    "Prefer the @handle / username shown next to the @ symbol or in the profile URL. " +
    "Usernames may contain letters, numbers, dots (.), underscores (_), and hyphens (-). " +
    "Preserve every dot, underscore, and hyphen exactly as shown. Do not add or remove an @.\n" +
    "If NO @handle or username is visible, return the display name, channel name, or page name instead.\n" +
    'Set kind to "handle" when you return an @handle/username, or "display_name" when you return a display/channel/page name.\n' +
    "Respond with ONLY a single-line JSON object and nothing else — no markdown, no code fences, no explanation.\n" +
    'Format: {"platform":"instagram","username":"example_name","kind":"handle"}';
