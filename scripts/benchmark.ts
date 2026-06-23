#!/usr/bin/env bun
/**
 * Kimi K2.6 accuracy benchmark. PRD §Risks + §Final verification gate.
 *
 * COSTS MONEY: every run invokes Workers AI per fixture. Excluded from CI.
 * Trigger manually with `bun run benchmark`.
 *
 * I/O:
 *   in  → src/lib/extract/__tests__/fixtures/expected.json  (pair manifest)
 *   in  → src/lib/extract/__tests__/fixtures/screenshots/   (PNG crops)
 *   out → docs/benchmark.md                                  (markdown report)
 *
 * Protocol (mirrors production call site `src/lib/server/ai/extract.ts`):
 *   1. base64-encode PNG bytes.
 *   2. `wrangler ai run @cf/moonshotai/kimi-k2.6 --remote --json` with `{ image, prompt }`.
 *   3. Normalize via `cleanUsername` so comparison matches the runtime pipeline.
 *   4. `match = cleaned === expected`. Aggregate to accuracy %.
 *
 * Ship gate: accuracy must be within −2pt of the legacy `glm-ocr:bf16`
 * baseline (~85%) — i.e. ≥ 83% per the PRD.
 *
 * Fallback: when `wrangler` is missing OR the probe call fails, the script
 * still writes a TEMPLATE report (TBD numbers). This is intentional — the
 * scaffolding existing on disk is the deliverable.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { cleanUsername } from "../src/lib/extract/clean.ts";
import { DETECT_PROFILE_PROMPT } from "../src/lib/extract/prompt.ts";
import { parseProfileResponse } from "../src/lib/extract/parse-response.ts";

type Pair = { id: string; filename: string; expected: string; platform?: string; kind?: string };
type Manifest = {
    source: string;
    model_baseline: string;
    notes?: string;
    pairs: Pair[];
};

type Row = {
    id: string;
    expected: string;
    raw: string | null;
    cleaned: string | null;
    detectedPlatform: string | null;
    match: boolean;
    notes: string;
};

const MODEL_ID = "@cf/moonshotai/kimi-k2.6";
const BASELINE_MODEL = "glm-ocr:bf16";
// Production uses the multi-platform detection prompt. The fixtures are all Instagram
// handles, so we always normalize via `cleanUsername` and record the detected platform
// separately (a misclassification shows in the report without breaking the accuracy metric).
const PROMPT = DETECT_PROFILE_PROMPT;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const fixturesDir = join(root, "src/lib/extract/__tests__/fixtures");
const screenshotsDir = join(fixturesDir, "screenshots");
const manifestPath = join(fixturesDir, "expected.json");
const reportPath = join(root, "docs/benchmark.md");

function loadManifest(): Manifest {
    if (!existsSync(manifestPath)) {
        throw new Error(`fixtures manifest not found at ${manifestPath}`);
    }
    return JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
}

function hasWrangler(): boolean {
    const res = spawnSync("wrangler", ["--version"], { encoding: "utf-8", stdio: "pipe" });
    return res.status === 0;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s: string): string {
    return s.replace(ANSI_RE, "");
}

/**
 * One Workers AI call via `wrangler ai run --json` with JSON payload on stdin.
 * Returns `{raw}` on success, `{raw: null, error}` on any non-zero exit.
 *
 * CAVEAT: `wrangler ai run` does not expose a stable public flag for image
 * bytes. Stdin JSON is the current best-effort. See the file header fallback note.
 */
function callKimi(imagePath: string): { raw: string | null; error?: string } {
    const bytes = readFileSync(imagePath);
    const b64 = bytes.toString("base64");

    const payload = JSON.stringify({
        image: b64,
        prompt: PROMPT,
        max_tokens: 256
    });

    const res = spawnSync("wrangler", ["ai", "run", MODEL_ID, "--remote", "--json"], {
        input: payload,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
    });

    if (res.status !== 0) {
        const cleanedErr = stripAnsi((res.stderr || "").trim()).split("\n")[0] ?? "";
        return { raw: null, error: cleanedErr.slice(0, 200) };
    }

    // `wrangler` may emit a banner before the JSON; scan for the first `{` and parse from there.
    const out = (res.stdout || "").trim();
    const jsonStart = out.indexOf("{");
    if (jsonStart === -1) {
        return { raw: out || null };
    }
    try {
        const parsed = JSON.parse(out.slice(jsonStart)) as { response?: string; text?: string };
        return { raw: parsed.response ?? parsed.text ?? null };
    } catch {
        return { raw: out };
    }
}

function runBenchmark(): { rows: Row[]; live: boolean; reason: string } {
    const manifest = loadManifest();
    const wranglerAvailable = hasWrangler();

    // One probe call gates the rest of the run. If the wrangler shape rejects our
    // payload, drop straight to template mode rather than burning quota on 58 retries.
    let live = false;
    let reason = "";
    if (!wranglerAvailable) {
        reason = "wrangler CLI not on PATH";
    } else {
        const probeImage = join(screenshotsDir, manifest.pairs[0]!.filename);
        const probe = callKimi(probeImage);
        if (probe.raw !== null && probe.raw.length > 0) {
            live = true;
        } else {
            reason = probe.error ?? "wrangler ai run rejected the image payload";
        }
    }

    const rows: Row[] = [];
    for (const pair of manifest.pairs) {
        const imagePath = join(screenshotsDir, pair.filename);
        if (!existsSync(imagePath)) {
            rows.push({
                id: pair.id,
                expected: pair.expected,
                raw: null,
                cleaned: null,
                detectedPlatform: null,
                match: false,
                notes: "fixture image missing"
            });
            continue;
        }

        if (!live) {
            rows.push({
                id: pair.id,
                expected: pair.expected,
                raw: null,
                cleaned: null,
                detectedPlatform: null,
                match: false,
                notes: "TBD — populate via `bun run benchmark` once wrangler ai run image input is wired"
            });
            continue;
        }

        const { raw, error } = callKimi(imagePath);
        // Parse the structured {platform, username, kind} response, then normalize the username
        // with the production cleaner. Fixtures are Instagram by construction → always cleanUsername.
        const parsed = raw ? parseProfileResponse(raw) : null;
        const cleaned = parsed ? cleanUsername(parsed.username) : null;
        rows.push({
            id: pair.id,
            expected: pair.expected,
            raw,
            cleaned,
            detectedPlatform: parsed?.platform ?? null,
            match: cleaned !== null && cleaned === pair.expected,
            notes: error ?? ""
        });
    }

    return { rows, live, reason };
}

function buildReport(args: { rows: Row[]; live: boolean; reason: string; manifest: Manifest }): string {
    const { rows, live, reason, manifest } = args;
    const total = rows.length;
    const matches = rows.filter((r) => r.match).length;
    const accuracy = total === 0 ? 0 : (matches / total) * 100;
    const stamp = new Date().toISOString();

    const tableRows = rows
        .map((r) => {
            const got = r.cleaned ?? r.raw ?? "—";
            const mark = r.match ? "✅" : "❌";
            const detected = r.detectedPlatform ?? "—";
            const notes = r.notes.replace(/\|/g, "\\|");
            return `| ${r.id} | \`${r.expected}\` | \`${got}\` | ${detected} | ${mark} | ${notes} |`;
        })
        .join("\n");

    const summary = live
        ? [
              `- **Total fixtures:** ${total}`,
              `- **Matches:** ${matches}`,
              `- **Accuracy:** ${accuracy.toFixed(2)}%`,
              `- **Baseline (\`${BASELINE_MODEL}\`):** ≈ 85% on this same needs-review set (per the legacy CLI quality column — see source manifest).`,
              `- **Delta vs baseline:** ${(accuracy - 85).toFixed(2)} pts`
          ].join("\n")
        : [
              `- **Status:** TEMPLATE — no live model run.`,
              `- **Reason:** ${reason || "wrangler ai run could not be invoked with image bytes"}.`,
              `- **Total fixtures available:** ${total}`,
              `- **Matches:** TBD`,
              `- **Accuracy:** TBD`,
              `- **Baseline (\`${BASELINE_MODEL}\`):** ≈ 85% on this same needs-review set.`,
              `- **Delta vs baseline:** TBD`
          ].join("\n");

    return `# Kimi K2.6 accuracy benchmark

**Model:** \`${MODEL_ID}\`
**Baseline:** \`${BASELINE_MODEL}\` (legacy Python CLI, Ollama)
**Generated:** ${stamp}
**Sample size:** ${total}
**Source manifest:** \`src/lib/extract/__tests__/fixtures/expected.json\` (${manifest.source})

> PRD §Risks and §Final verification: the production app must beat or
> match the legacy \`glm-ocr:bf16\` baseline on a fixed evaluation set
> before launch. This report is the artifact of that protocol. It is
> **not** run in CI — every execution hits Workers AI and costs money.

## Summary

${summary}

## Per-fixture results

| id | expected | got | detected | match? | notes |
| --- | --- | --- | --- | :---: | --- |
${tableRows}

## How to run

\`\`\`bash
bun run benchmark
\`\`\`

The script reads \`src/lib/extract/__tests__/fixtures/expected.json\`,
iterates each \`(id, filename, expected)\` triple, calls Workers AI via
\`wrangler ai run @cf/moonshotai/kimi-k2.6 --remote\` for every image,
normalizes the response with the production \`cleanUsername\` helper, and
writes a fresh \`docs/benchmark.md\`.

A baseline accuracy of **≈ 85%** for \`${BASELINE_MODEL}\` is the gate —
Kimi K2.6 must land within −2 pts of that figure (≥ 83%) to ship per the
PRD. Lower → reopen Open Question Q6 and either tune the prompt
(\`src/lib/extract/prompt.ts\`) or revisit model selection.

## How to extend the fixture set

The current 58 pairs come from the legacy \`extract_usernames\` Python
CLI's \`needs_review.md\` output (handles the human reviewer manually
confirmed). Source path on disk:

\`\`\`
/Users/beyourahi/Desktop/extract usernames          /
├── needs_review.md
└── cropped_usernames_images/*_crop.avif
\`\`\`

To extend:

1. Parse new \`(IMG_id, expected_username)\` pairs from \`needs_review.md\`
   (one entry per numbered block).
2. Convert each \`IMG_XXXX_crop.avif\` → PNG with macOS-native sips:

   \`\`\`bash
   sips -s format png input.avif --out output.png
   \`\`\`

3. Copy the PNG into \`src/lib/extract/__tests__/fixtures/screenshots/\`.
4. Append the new pair to the \`pairs\` array in
   \`src/lib/extract/__tests__/fixtures/expected.json\`.
5. Rerun \`bun run benchmark\`.

Hard upper bound is the legacy needs-review set size (~60 entries). To go
beyond, harvest additional confirmed handles from \`verified_usernames.md\`
in the same source directory.

## Why this isn't in CI

Workers AI calls cost money per token / per image. Running 58+ image
inferences on every push is wasteful and racy under quotas. The
benchmark is an opt-in pre-release check, not a regression gate. The
regression gate is the unit suite in \`src/lib/extract/__tests__/\`
(\`cleanUsername\`, confidence scoring, classification, Levenshtein near-
dup detection) — those run free, locally, in CI.
`;
}

function main(): void {
    const manifest = loadManifest();
    const { rows, live, reason } = runBenchmark();
    const report = buildReport({ rows, live, reason, manifest });

    writeFileSync(reportPath, report);

    const total = rows.length;
    const matches = rows.filter((r) => r.match).length;
    if (live) {
        const pct = total === 0 ? 0 : ((matches / total) * 100).toFixed(2);
        console.log(`[benchmark] wrote ${reportPath}`);
        console.log(`[benchmark] live run: ${matches}/${total} matches (${pct}%)`);
    } else {
        console.log(`[benchmark] wrote ${reportPath}`);
        console.log(`[benchmark] template-only run: ${stripAnsi(reason)}`);
        console.log("[benchmark] populate by running with a working `wrangler ai run` setup.");
    }
}

main();
