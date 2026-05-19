import { describe, expect, it } from "vitest";
import {
    CONFUSION_PAIRS,
    findConfusionCorrection,
    findConfusionMatch,
    findDottedSibling,
    intelligentConsensus,
    isDottedSibling,
    isDottedVariant
} from "../consensus";

describe("CONFUSION_PAIRS", () => {
    it("contains the expected pairs in order", () => {
        expect(CONFUSION_PAIRS).toEqual([
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
        ]);
    });
});

describe("isDottedSibling", () => {
    it("detects dot read as o", () => {
        expect(isDottedSibling("rahi.khan", "rahiokhan")).toBe(true);
    });

    it("detects dot dropped in winner", () => {
        expect(isDottedSibling("rahi.khan", "rahikhan")).toBe(true);
    });

    it("returns false when identical", () => {
        expect(isDottedSibling("rahi", "rahi")).toBe(false);
    });

    it("returns false when candidate has no dots", () => {
        expect(isDottedSibling("rahi", "rahio")).toBe(false);
    });

    it("returns false on fundamentally different strings", () => {
        expect(isDottedSibling("rahi.k", "totally")).toBe(false);
    });
});

describe("isDottedVariant", () => {
    it("is bidirectional", () => {
        expect(isDottedVariant("rahi.khan", "rahikhan")).toBe(true);
        expect(isDottedVariant("rahikhan", "rahi.khan")).toBe(true);
    });
});

describe("findDottedSibling", () => {
    it("finds a dotted variant with sufficient confidence", () => {
        const winner = "rahikhan";
        const variants = [
            { username: "rahi.khan", confidence: 70 },
            { username: "rahikhan", confidence: 90 }
        ];
        const result = findDottedSibling(winner, variants, 90);
        // 70 >= 90 * 0.7 = 63 → accept
        expect(result).toEqual({ username: "rahi.khan", confidence: 70 });
    });

    it("rejects when confidence too low", () => {
        const result = findDottedSibling("rahikhan", [{ username: "rahi.khan", confidence: 40 }], 90);
        expect(result).toBeNull();
    });

    it("returns null when no variants match", () => {
        const result = findDottedSibling("rahikhan", [{ username: "xyzzy", confidence: 90 }], 90);
        expect(result).toBeNull();
    });
});

describe("findConfusionCorrection", () => {
    it("finds a 'rn' → 'm' correction", () => {
        // winner has 'rn', candidate has 'm', distance 1
        const result = findConfusionCorrection("harnoon", [{ username: "hamoon", confidence: 80 }], 80);
        expect(result).toEqual({ username: "hamoon", confidence: 80 });
    });

    it("rejects when distance > 3", () => {
        const result = findConfusionCorrection("abcdefrn", [{ username: "xyzm99", confidence: 80 }], 80);
        expect(result).toBeNull();
    });
});

// One fixture per confusion pair (winner → candidate)
describe("confusion pair coverage via findConfusionMatch", () => {
    const cases: Array<[string, string, string]> = [
        // [misread, correct, ...] each pair produces winner=*misread*, candidate=*correct*
        ["atf", "aff", "tf→ff"],
        ["arz", "4rz", "a→4"],
        ["axy", "ady", "x→d"],
        ["clk", "dk", "cl→d"],
        ["arn", "am", "rn→m"],
        ["wvv", "ww", "vv→w"],
        ["mii", "mu", "ii→u"],
        ["lz", "1z", "l→1"],
        ["0z", "oz", "0→o"],
        ["5z", "sz", "5→s"],
        ["8z", "bz", "8→b"]
    ];

    for (const [misread, correct, label] of cases) {
        it(`returns a correction for ${label}`, () => {
            const result = findConfusionMatch(misread, correct);
            expect(result).not.toBeNull();
            expect(result?.confidence).toBe(88);
        });
    }

    it("returns null when distance > 3", () => {
        expect(findConfusionMatch("aaaaaaa", "bbbbbbb")).toBeNull();
    });

    it("returns null on identical strings", () => {
        expect(findConfusionMatch("rahi", "rahi")).toBeNull();
    });

    it("returns null on empty input", () => {
        expect(findConfusionMatch("", "rahi")).toBeNull();
        expect(findConfusionMatch("rahi", "")).toBeNull();
    });
});

describe("intelligentConsensus", () => {
    it("exact_agreement: same username on both sides", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahi",
            vlmConfidence: 85,
            ocrUsername: "rahi",
            ocrConfidence: 80
        });
        expect(r.username).toBe("rahi");
        expect(r.strategy).toBe("exact_agreement");
        expect(r.confidence).toBe(90); // max(85,80) + 5
    });

    it("exact_agreement: clamps confidence at 95", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahi",
            vlmConfidence: 95,
            ocrUsername: "rahi",
            ocrConfidence: 95
        });
        expect(r.confidence).toBe(95);
    });

    it("dot_reconciled_vlm: VLM has dots, OCR doesn't", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahi.khan",
            vlmConfidence: 85,
            ocrUsername: "rahikhan",
            ocrConfidence: 80
        });
        expect(r.strategy).toBe("dot_reconciled_vlm");
        expect(r.username).toBe("rahi.khan");
        expect(r.confidence).toBe(88);
    });

    it("dot_reconciled_ocr: OCR has dots, VLM doesn't", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahikhan",
            vlmConfidence: 85,
            ocrUsername: "rahi.khan",
            ocrConfidence: 80
        });
        expect(r.strategy).toBe("dot_reconciled_ocr");
        expect(r.username).toBe("rahi.khan");
        expect(r.confidence).toBe(83);
    });

    it("confusion_corrected", () => {
        const r = intelligentConsensus({
            vlmUsername: "arn",
            vlmConfidence: 80,
            ocrUsername: "am",
            ocrConfidence: 80
        });
        expect(r.strategy).toBe("confusion_corrected");
        expect(r.confidence).toBe(88);
    });

    it("vlm_longer_variant: minor edit, VLM longer", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahixx",
            vlmConfidence: 80,
            ocrUsername: "rahi",
            ocrConfidence: 80
        });
        expect(r.strategy).toBe("vlm_longer_variant");
    });

    it("ocr_longer_variant: minor edit, OCR longer", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahi",
            vlmConfidence: 80,
            ocrUsername: "rahixx",
            ocrConfidence: 80
        });
        expect(r.strategy).toBe("ocr_longer_variant");
    });

    it("vlm_confidence_match: same length, VLM higher conf", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahi",
            vlmConfidence: 90,
            ocrUsername: "raha",
            ocrConfidence: 80
        });
        expect(r.strategy).toBe("vlm_confidence_match");
    });

    it("ocr_confidence_match: same length, OCR higher conf", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahi",
            vlmConfidence: 80,
            ocrUsername: "raha",
            ocrConfidence: 90
        });
        expect(r.strategy).toBe("ocr_confidence_match");
    });

    it("vlm_disagreement_win: distance >2, VLM more confident", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahikhan",
            vlmConfidence: 95,
            ocrUsername: "totallyx",
            ocrConfidence: 70
        });
        expect(r.strategy).toBe("vlm_disagreement_win");
        expect(r.confidence).toBe(85);
    });

    it("ocr_disagreement_win: distance >2, OCR more confident", () => {
        const r = intelligentConsensus({
            vlmUsername: "totallyx",
            vlmConfidence: 70,
            ocrUsername: "rahikhan",
            ocrConfidence: 95
        });
        expect(r.strategy).toBe("ocr_disagreement_win");
    });

    it("ambiguous_disagreement: similar confidence, big disagreement", () => {
        const r = intelligentConsensus({
            vlmUsername: "rahikhan",
            vlmConfidence: 80,
            ocrUsername: "totallyx",
            ocrConfidence: 80
        });
        expect(r.strategy).toBe("ambiguous_disagreement");
        expect(r.confidence).toBe(70); // max(80-15, 70)
    });
});
