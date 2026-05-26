/**
 * Verbatim port of Python `_levenshtein_distance` / `_find_similar_existing`
 * (extract_usernames.py:748-784). Used for the near-dup check against the
 * leads table; queue consumer caps the candidate set at NEAR_DUP_CANDIDATE_LIMIT.
 */

/**
 * Row-rolling Levenshtein DP. O(|s1| * |s2|) time, O(min(|s1|,|s2|)) space.
 * Swaps args so `s2` is the shorter side ⇒ smaller `previousRow` allocation.
 */
export function levenshteinDistance(s1: string, s2: string): number {
    if (s1.length < s2.length) {
        return levenshteinDistance(s2, s1);
    }
    if (s2.length === 0) {
        return s1.length;
    }

    let previousRow: number[] = [];
    for (let j = 0; j <= s2.length; j += 1) {
        previousRow.push(j);
    }

    for (let i = 0; i < s1.length; i += 1) {
        const c1 = s1[i];
        const currentRow: number[] = [i + 1];
        for (let j = 0; j < s2.length; j += 1) {
            const c2 = s2[j];
            const prevAtJ = previousRow[j] ?? 0;
            const prevAtJ1 = previousRow[j + 1] ?? 0;
            const currAtJ = currentRow[j] ?? 0;
            const insertions = prevAtJ1 + 1;
            const deletions = currAtJ + 1;
            const substitutions = prevAtJ + (c1 === c2 ? 0 : 1);
            currentRow.push(Math.min(insertions, deletions, substitutions));
        }
        previousRow = currentRow;
    }

    return previousRow[previousRow.length - 1] ?? 0;
}

/**
 * Nearest candidate within `(0, maxDistance]` edit distance.
 * Exact matches (`dist === 0`) are skipped — they're handled by the
 * `existsExact` check upstream. Length-difference filter short-circuits the DP.
 * Returns `null` when nothing qualifies.
 */
export function findSimilarExisting(
    username: string,
    existing: Iterable<string>,
    maxDistance = 2
): { match: string; distance: number } | null {
    if (!username) {
        return null;
    }

    let bestMatch: string | null = null;
    let bestDist = maxDistance + 1;

    for (const candidate of existing) {
        if (Math.abs(candidate.length - username.length) > maxDistance) {
            continue;
        }
        const dist = levenshteinDistance(username, candidate);
        if (dist > 0 && dist < bestDist) {
            bestMatch = candidate;
            bestDist = dist;
        }
    }

    if (bestMatch === null) {
        return null;
    }
    return { match: bestMatch, distance: bestDist };
}
