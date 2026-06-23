/**
 * @fileoverview Changelog data — hand-curated, customer-facing product updates.
 *
 * @description
 * Single source of truth for the public `/changelog` route. Entries are written
 * in plain English for the person who actually uses the tool — never commit
 * hashes, branch names, file paths, or engineering jargon. They are derived from
 * the git history but consolidated: chore/docs/style/refactor/merge noise is
 * dropped and related commits fold into one coherent, benefit-led entry. This
 * mirrors the sibling tools (day-zero / invoice-generator / order-processor).
 *
 * INVARIANTS
 * ──────────
 * - Newest first. The page groups by `date` and tags the single newest group
 *   "Latest"; it relies on this ordering rather than sorting at render time.
 * - `date` is an ISO `YYYY-MM-DD` string. Absolute dates only — the page never
 *   computes "x days ago" (relative dates are a hydration hazard under SSR).
 *
 * HOW TO ADD AN ENTRY
 * ───────────────────
 * Prepend a new object to `CHANGELOG_ENTRIES`, dated to the day the change ships,
 * and pick the category that best fits the user-visible effect.
 */

export type ChangelogCategory = "New feature" | "Improvement" | "Fix" | "Performance" | "Design";

export type ChangelogEntry = {
    /** ISO `YYYY-MM-DD`. Drives grouping + the "Latest" tag; keep entries newest-first. */
    date: string;
    /** Short, benefit-led, plain-language headline. */
    title: string;
    /** One to three plain-language sentences describing what changed for the user. */
    summary: string;
    category: ChangelogCategory;
};

// Newest first — see file header for the ordering invariant.
export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
    {
        date: "2026-06-23",
        category: "New feature",
        title: "Auto-detect any social platform",
        summary:
            "Drop screenshots from Instagram, TikTok, YouTube, Facebook, and more — the extractor now detects the platform automatically, keeps each platform's leads separate, links to the right profile, and tags every lead with its platform (including in Notion)."
    },
    {
        date: "2026-06-21",
        category: "Design",
        title: "A consistent look across every Dropout tool",
        summary:
            "Username Extractor now wears the same clean, dark editorial design as its sibling tools, with a matching footer on every page — including the sign-in screen."
    },
    {
        date: "2026-06-21",
        category: "New feature",
        title: "Sign in with a passkey or Google One Tap",
        summary:
            "Use Face ID, Touch ID, or a fingerprint to sign in with a passkey, or tap once with Google One Tap — on top of the usual Google sign-in."
    },
    {
        date: "2026-06-20",
        category: "New feature",
        title: "Bring your own Cloudflare account",
        summary:
            "Screenshot extraction now runs on your own Cloudflare account, so usage and billing stay entirely in your hands. Connect it once in Settings and choose your model."
    },
    {
        date: "2026-06-20",
        category: "New feature",
        title: "Drop a whole folder, export your leads",
        summary:
            "Upload an entire folder of profile screenshots at once — even AVIF files — and export your verified leads to a CSV whenever you need them."
    },
    {
        date: "2026-05-19",
        category: "New feature",
        title: "Username Extractor is here",
        summary:
            "The web successor to the original command-line tool: pull Instagram usernames from batches of profile screenshots, de-duplicate them against your leads, and sync the keepers to Notion."
    }
];
