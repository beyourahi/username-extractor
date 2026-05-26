/**
 * Verbatim port of the Python CLI's confidence scoring
 * (extract_usernames.py:563-578 inside `vlm_primary_extract`).
 *
 * Pure post-extraction scoring — no I/O. DO NOT alter weights without
 * re-running the docs/benchmark.md accuracy run; the recorded baseline
 * depends on the exact constants below.
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
 * True if `rawText` contains any HEDGING_WORDS as a case-insensitive substring.
 * Mirrors Python `any(word in raw.lower() for word in HEDGING_WORDS)` — does
 * NOT do word-boundary matching, so e.g. "couldbe" still triggers.
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
 * Score VLM confidence. Result clamped to [MIN_CONFIDENCE, MAX_CONFIDENCE] = [60, 100].
 *
 *   start = BASE_CONFIDENCE (85)
 *   −HEDGING_PENALTY (15) if hedged
 *   +FORMAT_BONUS    (10) if `isValidInstagramFormat(username)`
 *   −UNUSUAL_PENALTY (10) if `hasUnusualPattern(username)`
 *
 * `hedged` overrides `rawText` scanning when explicitly passed.
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
