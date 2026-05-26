/**
 * Verbatim port of Python `_classify_status` / `_tier_of` (extract_usernames.py:707-720).
 * Thresholds are part of the benchmarked contract — do not change without re-running docs/benchmark.md.
 */

export type Tier = "HIGH" | "MED" | null;

/** `confidence >= 85` → "verified", else "review". */
export function classifyStatus(confidence: number): "verified" | "review" {
    if (confidence >= 85) {
        return "verified";
    }
    return "review";
}

/** Tier: HIGH (≥95) | MED (85-94) | null (<85). */
export function tierOf(confidence: number): Tier {
    if (confidence >= 95) {
        return "HIGH";
    }
    if (confidence >= 85) {
        return "MED";
    }
    return null;
}
