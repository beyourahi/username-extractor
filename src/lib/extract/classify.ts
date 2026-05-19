/**
 * Confidence-based status classification.
 *
 * Source: /Users/beyourahi/Desktop/projects/extract_usernames/extract_usernames/_archive/extract_usernames.py:707-720
 */

export type Tier = "HIGH" | "MED" | null;

/**
 * Classify extraction status by confidence score.
 * Threshold matches the Python version: >=85 → verified, else review.
 */
export function classifyStatus(confidence: number): "verified" | "review" {
    if (confidence >= 85) {
        return "verified";
    }
    return "review";
}

/**
 * Tier breakdown:
 * - HIGH: confidence >= 95
 * - MED:  85 <= confidence < 95
 * - null: confidence < 85
 */
export function tierOf(confidence: number): Tier {
    if (confidence >= 95) {
        return "HIGH";
    }
    if (confidence >= 85) {
        return "MED";
    }
    return null;
}
