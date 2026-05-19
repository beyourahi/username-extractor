/**
 * Consensus / dotted-sibling / confusion-correction logic for dual-engine OCR.
 *
 * Source: /Users/beyourahi/Desktop/projects/extract_usernames/extract_usernames/_archive/extract_usernames.py:256-363, 600-626, 629-704
 *
 * Not invoked in v1 (single VLM path), but kept compileable + tested so the
 * eventual dual-engine path has these primitives ready. Pure functions; no I/O.
 *
 * Deviation from Python:
 * - `intelligentConsensus` takes one options object rather than 6 positional
 *   args, and returns a single object instead of a 4-tuple. Behavior matches
 *   `intelligent_consensus_validator` semantically.
 * - To respect the "no cross-imports between phase-1 modules" rule, this file
 *   inlines a local Levenshtein helper instead of importing from `./distance`.
 */

export const CONFUSION_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ["tf", "ff"],
    ["a", "4"],
    ["x", "d"],
    ["cl", "d"],
    ["rn", "m"],
    ["vv", "w"],
    ["ii", "u"],
    ["l", "1"],
    ["0", "o"],
    ["5", "s"],
    ["8", "b"]
];

// ---------------------------------------------------------------------------
// Local Levenshtein (kept private to avoid cross-imports between phase-1 modules).
// ---------------------------------------------------------------------------
function levenshtein(s1: string, s2: string): number {
    if (s1.length < s2.length) {
        return levenshtein(s2, s1);
    }
    if (s2.length === 0) {
        return s1.length;
    }
    let prev: number[] = [];
    for (let j = 0; j <= s2.length; j += 1) {
        prev.push(j);
    }
    for (let i = 0; i < s1.length; i += 1) {
        const c1 = s1[i];
        const curr: number[] = [i + 1];
        for (let j = 0; j < s2.length; j += 1) {
            const c2 = s2[j];
            const prevJ = prev[j] ?? 0;
            const prevJ1 = prev[j + 1] ?? 0;
            const currJ = curr[j] ?? 0;
            curr.push(Math.min(prevJ1 + 1, currJ + 1, prevJ + (c1 === c2 ? 0 : 1)));
        }
        prev = curr;
    }
    return prev[prev.length - 1] ?? 0;
}

// ---------------------------------------------------------------------------
// Dotted-sibling detection
// ---------------------------------------------------------------------------

/**
 * Returns true if `candidate` is a dotted variant of `winner`:
 * - candidate has '.' where winner has 'o' / 'O' / '0' (dot misread as letter)
 * - candidate has '.' where winner has nothing (dot dropped in winner)
 *
 * Directional (candidate must be the one with the dots). Use through
 * `isDottedVariant` for a symmetric check.
 */
export function isDottedSibling(candidate: string, winner: string): boolean {
    if (candidate === winner) {
        return false;
    }
    if (!candidate.includes(".")) {
        return false;
    }

    let ci = 0;
    let wi = 0;
    while (ci < candidate.length && wi < winner.length) {
        const c = candidate[ci];
        const w = winner[wi];
        if (c === w) {
            ci += 1;
            wi += 1;
        } else if (c === ".") {
            if (w !== undefined && (w === "o" || w === "O" || w === "0")) {
                ci += 1;
                wi += 1;
            } else {
                ci += 1;
            }
        } else {
            return false;
        }
    }

    while (ci < candidate.length) {
        if (candidate[ci] !== ".") {
            return false;
        }
        ci += 1;
    }
    while (wi < winner.length) {
        const w = winner[wi];
        if (w === "o" || w === "O" || w === "0") {
            wi += 1;
        } else {
            return false;
        }
    }

    return true;
}

/**
 * Bidirectional dotted-variant check (`_is_dotted_variant` in Python).
 */
export function isDottedVariant(a: string, b: string): boolean {
    return isDottedSibling(a, b) || isDottedSibling(b, a);
}

export interface Variant {
    username: string;
    confidence: number;
    variant?: string;
}

/**
 * Find a dotted-sibling variant of the winning username among the candidate
 * variants. Accepts only if the dotted variant's confidence is at least 70%
 * of the winner's.
 */
export function findDottedSibling(
    winnerUsername: string,
    variants: ReadonlyArray<Variant>,
    winnerConfidence: number
): { username: string; confidence: number } | null {
    let bestUsername: string | null = null;
    let bestConfidence = 0;

    for (const r of variants) {
        if (r.username === winnerUsername) {
            continue;
        }
        if (isDottedSibling(r.username, winnerUsername)) {
            if (r.confidence > bestConfidence) {
                bestUsername = r.username;
                bestConfidence = r.confidence;
            }
        }
    }

    if (bestUsername !== null && bestConfidence >= winnerConfidence * 0.7) {
        return { username: bestUsername, confidence: bestConfidence };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Confusion-pair correction
// ---------------------------------------------------------------------------

/**
 * Scan variants for a username that differs from the winner by exactly one
 * known OCR confusion pair (and edit distance 1–3). Accept only if its
 * confidence is at least 55% of the winner's.
 */
export function findConfusionCorrection(
    winnerUsername: string,
    variants: ReadonlyArray<Variant>,
    winnerConfidence: number
): { username: string; confidence: number } | null {
    for (const r of variants) {
        const candidate = r.username;
        if (candidate === winnerUsername) {
            continue;
        }

        const dist = levenshtein(candidate, winnerUsername);
        if (dist === 0 || dist > 3) {
            continue;
        }

        for (const [misread, correct] of CONFUSION_PAIRS) {
            if (winnerUsername.includes(misread) && candidate.includes(correct)) {
                const fixed = winnerUsername.replace(misread, correct);
                if (fixed === candidate && r.confidence >= winnerConfidence * 0.55) {
                    return { username: candidate, confidence: r.confidence };
                }
            }
        }
    }
    return null;
}

/**
 * Bidirectional confusion-pair match between a VLM and an OCR result.
 * Returns the corrected username (preferred over either input) at a fixed
 * confidence of 88, mirroring `_find_confusion_match` in Python.
 */
export function findConfusionMatch(
    vlmUsername: string,
    ocrUsername: string
): { username: string; confidence: number } | null {
    if (!vlmUsername || !ocrUsername) {
        return null;
    }

    const dist = levenshtein(vlmUsername, ocrUsername);
    if (dist === 0 || dist > 3) {
        return null;
    }

    for (const [misread, correct] of CONFUSION_PAIRS) {
        if (vlmUsername.includes(misread) && ocrUsername.includes(correct)) {
            const fixed = vlmUsername.replace(misread, correct);
            if (fixed === ocrUsername) {
                return { username: ocrUsername, confidence: 88 };
            }
        }
        if (ocrUsername.includes(misread) && vlmUsername.includes(correct)) {
            const fixed = ocrUsername.replace(misread, correct);
            if (fixed === vlmUsername) {
                return { username: vlmUsername, confidence: 88 };
            }
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Top-level consensus
// ---------------------------------------------------------------------------

export type ConsensusStrategy =
    | "exact_agreement"
    | "dot_reconciled_vlm"
    | "dot_reconciled_ocr"
    | "confusion_corrected"
    | "vlm_longer_variant"
    | "ocr_longer_variant"
    | "vlm_confidence_match"
    | "ocr_confidence_match"
    | "vlm_disagreement_win"
    | "ocr_disagreement_win"
    | "ambiguous_disagreement";

export interface ConsensusInput {
    vlmUsername: string;
    vlmConfidence: number;
    ocrUsername: string;
    ocrConfidence: number;
}

export interface ConsensusResult {
    username: string;
    confidence: number;
    strategy: ConsensusStrategy;
    editDistance: number;
}

/**
 * Merge VLM and EasyOCR results into a single decision.
 * Mirrors `intelligent_consensus_validator` in the Python source.
 */
export function intelligentConsensus(input: ConsensusInput): ConsensusResult {
    const { vlmUsername, vlmConfidence, ocrUsername, ocrConfidence } = input;

    // Strategy 1: Exact agreement
    if (vlmUsername === ocrUsername) {
        const conf = Math.min(Math.max(vlmConfidence, ocrConfidence) + 5, 95);
        return {
            username: vlmUsername,
            confidence: conf,
            strategy: "exact_agreement",
            editDistance: 0
        };
    }

    // Strategy 2: Dot reconciliation
    if (isDottedVariant(vlmUsername, ocrUsername)) {
        if (vlmUsername.includes(".") || vlmUsername.includes("_")) {
            return {
                username: vlmUsername,
                confidence: vlmConfidence + 3,
                strategy: "dot_reconciled_vlm",
                editDistance: levenshtein(vlmUsername, ocrUsername)
            };
        }
        return {
            username: ocrUsername,
            confidence: ocrConfidence + 3,
            strategy: "dot_reconciled_ocr",
            editDistance: levenshtein(vlmUsername, ocrUsername)
        };
    }

    // Strategy 3: Confusion correction
    const correction = findConfusionMatch(vlmUsername, ocrUsername);
    if (correction) {
        return {
            username: correction.username,
            confidence: correction.confidence,
            strategy: "confusion_corrected",
            editDistance: levenshtein(vlmUsername, ocrUsername)
        };
    }

    // Strategy 4: Minor edit distance
    const editDist = levenshtein(vlmUsername, ocrUsername);
    if (editDist <= 2) {
        if (vlmUsername.length > ocrUsername.length) {
            return {
                username: vlmUsername,
                confidence: vlmConfidence,
                strategy: "vlm_longer_variant",
                editDistance: editDist
            };
        }
        if (ocrUsername.length > vlmUsername.length) {
            return {
                username: ocrUsername,
                confidence: ocrConfidence,
                strategy: "ocr_longer_variant",
                editDistance: editDist
            };
        }
        if (vlmConfidence >= ocrConfidence) {
            return {
                username: vlmUsername,
                confidence: vlmConfidence,
                strategy: "vlm_confidence_match",
                editDistance: editDist
            };
        }
        return {
            username: ocrUsername,
            confidence: ocrConfidence,
            strategy: "ocr_confidence_match",
            editDistance: editDist
        };
    }

    // Strategy 5: Significant disagreement
    if (vlmConfidence >= ocrConfidence + 10) {
        return {
            username: vlmUsername,
            confidence: Math.max(vlmConfidence - 10, 75),
            strategy: "vlm_disagreement_win",
            editDistance: editDist
        };
    }
    if (ocrConfidence >= vlmConfidence + 10) {
        return {
            username: ocrUsername,
            confidence: Math.max(ocrConfidence - 10, 75),
            strategy: "ocr_disagreement_win",
            editDistance: editDist
        };
    }
    return {
        username: vlmUsername,
        confidence: Math.max(vlmConfidence - 15, 70),
        strategy: "ambiguous_disagreement",
        editDistance: editDist
    };
}
