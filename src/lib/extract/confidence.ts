/**
 * VLM confidence scoring.
 *
 * Source: /Users/beyourahi/Desktop/projects/extract_usernames/extract_usernames/_archive/extract_usernames.py:525-589 (especially :563-578)
 *
 * Pure scoring logic extracted from `vlm_primary_extract`. Network/VLM
 * invocation is handled elsewhere; this module only deals with the post-hoc
 * score adjustment.
 */
import { hasUnusualPattern, isValidInstagramFormat } from "./validate";

export const HEDGING_WORDS = ["appears", "seems", "possibly", "might", "unclear", "could be"] as const;

const BASE_CONFIDENCE = 85;
const MIN_CONFIDENCE = 60;
const MAX_CONFIDENCE = 100;
const HEDGING_PENALTY = 15;
const FORMAT_BONUS = 10;
const UNUSUAL_PENALTY = 10;

/**
 * Detect VLM hedging phrases ("appears", "might", etc.) in raw model output.
 * Match is case-insensitive substring (matches Python `any(word in raw.lower() ...)`).
 */
export function containsHedging(rawText: string): boolean {
    if (!rawText) {
        return false;
    }
    const lower = rawText.toLowerCase();
    for (const word of HEDGING_WORDS) {
        if (lower.includes(word)) {
            return true;
        }
    }
    return false;
}

/**
 * Compute a VLM confidence score in [60, 100].
 *
 * - Hedging language: −15
 * - Valid Instagram format: +10
 * - Unusual pattern: −10
 *
 * `hedged` can be passed explicitly; otherwise `rawText` is scanned via
 * `containsHedging`. Final value is clamped.
 */
export function scoreConfidence(opts: { username: string; rawText?: string; hedged?: boolean }): number {
    const { username, rawText, hedged } = opts;
    let score = BASE_CONFIDENCE;

    const isHedged = hedged ?? (rawText !== undefined && containsHedging(rawText));
    if (isHedged) {
        score -= HEDGING_PENALTY;
    }

    if (isValidInstagramFormat(username)) {
        score += FORMAT_BONUS;
    }

    if (hasUnusualPattern(username)) {
        score -= UNUSUAL_PENALTY;
    }

    return Math.max(MIN_CONFIDENCE, Math.min(score, MAX_CONFIDENCE));
}
