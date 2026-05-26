/**
 * Dual-engine (VLM + OCR) reconciliation: dotted-sibling, confusion-pair, and
 * edit-distance consensus strategies. Verbatim port of Python
 * `extract_usernames.py:256-363, 600-626, 629-704`.
 *
 * STATUS: not wired into v1 (single VLM path). Kept compileable + tested so the
 * eventual dual-engine path drops in without redesign. Pure functions, no I/O.
 *
 * API differences from Python:
 *   - `intelligentConsensus` takes an options object, returns a single result
 *     object (Python uses 6 positional args + a 4-tuple). Semantics identical.
 *   - Local Levenshtein helper to avoid cross-imports between phase-1 modules.
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

// Local Levenshtein — DO NOT replace with `./distance` import (phase-1 isolation rule).
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

/**
 * Directional check: `candidate` is a dotted-up form of `winner` when:
 *   - candidate has `.` where winner has `o`/`O`/`0` (dot misread as O), OR
 *   - candidate has `.` where winner has nothing (dot dropped in winner).
 * For a symmetric check use `isDottedVariant`.
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

/** Symmetric wrapper. Mirrors Python `_is_dotted_variant`. */
export function isDottedVariant(a: string, b: string): boolean {
    return isDottedSibling(a, b) || isDottedSibling(b, a);
}

export interface Variant {
    username: string;
    confidence: number;
    variant?: string;
}

/**
 * Best dotted-sibling variant of `winnerUsername` among `variants`.
 * Accepts only when the sibling's confidence is ≥ 70% of the winner's;
 * otherwise returns null.
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

/**
 * Variant that differs from `winnerUsername` by exactly one CONFUSION_PAIRS
 * substitution and has Levenshtein distance ∈ [1, 3].
 * Acceptance threshold: candidate confidence ≥ 55% of winner's.
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
 * Symmetric confusion-pair check between two candidates (VLM ↔ OCR).
 * Returns the corrected form at fixed confidence 88. Mirrors Python `_find_confusion_match`.
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
 * Reconciles VLM and OCR predictions into a single winner. Strategies tried in
 * order; first match wins. Mirrors Python `intelligent_consensus_validator`.
 *
 * Strategies:
 *   1. exact_agreement       — usernames identical; conf = min(max(...) + 5, 95)
 *   2. dot_reconciled_*      — one is a dotted variant; prefer the side with separators
 *   3. confusion_corrected   — known OCR confusion pair fixes the mismatch
 *   4. *_longer_variant / *_confidence_match — edit distance ≤ 2; tiebreak by length, then confidence
 *   5. *_disagreement_win    — ≥10pt confidence gap; winner penalised −10 (floor 75)
 *   6. ambiguous_disagreement — fall through; pick VLM with −15 (floor 70)
 */
export function intelligentConsensus(input: ConsensusInput): ConsensusResult {
    const { vlmUsername, vlmConfidence, ocrUsername, ocrConfidence } = input;

    if (vlmUsername === ocrUsername) {
        const conf = Math.min(Math.max(vlmConfidence, ocrConfidence) + 5, 95);
        return {
            username: vlmUsername,
            confidence: conf,
            strategy: "exact_agreement",
            editDistance: 0
        };
    }

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

    const correction = findConfusionMatch(vlmUsername, ocrUsername);
    if (correction) {
        return {
            username: correction.username,
            confidence: correction.confidence,
            strategy: "confusion_corrected",
            editDistance: levenshtein(vlmUsername, ocrUsername)
        };
    }

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
