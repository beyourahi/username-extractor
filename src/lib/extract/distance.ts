/**
 * Levenshtein distance and similarity matching for username deduplication.
 *
 * Source: /Users/beyourahi/Desktop/projects/extract_usernames/extract_usernames/_archive/extract_usernames.py:748-784
 */

/**
 * Compute Levenshtein edit distance between two strings using a row-rolling DP.
 * Swaps args so the iterated string is the shorter one.
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
 * Find the closest existing username within `maxDistance` (exclusive of 0,
 * i.e. exact matches are skipped — matches Python `0 < dist < best_dist`).
 *
 * Returns null when no candidate is within distance.
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
