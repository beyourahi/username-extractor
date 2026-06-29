#!/usr/bin/env bun
/**
 * Vision-model accuracy benchmark. PRD §Risks + §Final verification gate.
 *
 * COSTS MONEY: every run invokes Workers AI per fixture. Excluded from CI.
 * Trigger manually with `bun run benchmark`.
 *
 * Auth (BYO Cloudflare, same creds drizzle.config uses):
 *   CLOUDFLARE_ACCOUNT_ID   — account to bill the inference to
 *   CLOUDFLARE_API_TOKEN    — token with Workers AI run permission
 * Put them in the shell env before running. MISSING CREDS = HARD FAILURE (exit 1):
 * this gate must never silently "pass". (Previously it called the non-existent
 * `wrangler ai run` and silently wrote a TEMPLATE report — see M-020. Never again.)
 *
 * I/O:
 *   in  → src/lib/extract/__tests__/fixtures/expected.json  (pair manifest)
 *   in  → src/lib/extract/__tests__/fixtures/screenshots/   (PNG crops)
 *   out → docs/benchmark.md                                  (markdown report)
 *
 * Protocol (mirrors production call site `src/lib/server/ai/extract.ts`):
 *   1. runVisionViaRest (chat/image_url schema) on the user's CF account.
 *   2. extractResponseText → parseProfileResponse → per-platform cleanHandle/cleanDisplayName (production pipeline).
 *   3. `match = cleaned === expected`. Aggregate to accuracy %.
 *
 * Ship gate: accuracy must be within −2pt of the legacy `glm-ocr:bf16` baseline
 * (~85%) — i.e. ≥ 83% per the PRD.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DETECT_PROFILE_PROMPT } from "../src/lib/extract/prompt.ts";
import { parseProfileResponse } from "../src/lib/extract/parse-response.ts";
import { getPlatform, cleanDisplayName } from "../src/lib/social/platform.ts";
import { runVisionViaRest, DEFAULT_VISION_MODEL, type CloudflareCreds } from "../src/lib/server/ai/run-rest.ts";
import { extractResponseText } from "../src/lib/server/ai/gateway.ts";

type Pair = { id: string; filename: string; expected: string; platform?: string; kind?: string };
type Manifest = { source: string; model_baseline: string; notes?: string; pairs: Pair[] };
type Row = {
    id: string;
    expected: string;
    raw: string | null;
    cleaned: string | null;
    detectedPlatform: string | null;
    match: boolean;
    notes: string;
};

const MODEL_ID = DEFAULT_VISION_MODEL;
const BASELINE_MODEL = "glm-ocr:bf16";
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

/** Load CF creds from env. FAIL LOUD if absent — a benchmark that can't run must not pretend it passed. */
function loadCredsOrExit(): CloudflareCreds {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
        console.error(
            "[benchmark] FATAL: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set (token needs Workers AI run permission)."
        );
        console.error("[benchmark] Refusing to write a template/no-op report. Set the creds and re-run.");
        process.exit(1);
    }
    return { accountId, apiToken };
}

async function callModel(creds: CloudflareCreds, imagePath: string): Promise<{ raw: string | null; error?: string }> {
    try {
        const bytes = Array.from(new Uint8Array(readFileSync(imagePath)));
        const result = await runVisionViaRest(creds, MODEL_ID, { image: bytes, prompt: PROMPT, maxTokens: 512 });
        const text = extractResponseText(result);
        return { raw: text || null };
    } catch (e) {
        return { raw: null, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
    }
}

async function runBenchmark(creds: CloudflareCreds): Promise<Row[]> {
    const manifest = loadManifest();

    // Probe gate: one call. If it fails, ABORT loudly — do not burn quota or fake a report.
    const probeImage = join(screenshotsDir, manifest.pairs[0]!.filename);
    const probe = await callModel(creds, probeImage);
    if (!probe.raw) {
        console.error(`[benchmark] FATAL: probe call failed (${probe.error ?? "empty response"}). Aborting.`);
        process.exit(1);
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
        const { raw, error } = await callModel(creds, imagePath);
        const parsed = raw ? parseProfileResponse(raw) : null;
        // Mirror the production cleaner dispatch exactly (extract.ts): per-platform handle
        // cleaner, or the display-name cleaner when kind="display_name". Using the IG-only
        // cleanUsername here would mis-score YouTube hyphens / Facebook underscores / display names.
        const cleaned = parsed
            ? parsed.kind === "display_name"
                ? cleanDisplayName(parsed.username)
                : getPlatform(parsed.platform).cleanHandle(parsed.username)
            : null;
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
    return rows;
}

function buildReport(rows: Row[], manifest: Manifest): string {
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

    const summary = [
        `- **Total fixtures:** ${total}`,
        `- **Matches:** ${matches}`,
        `- **Accuracy:** ${accuracy.toFixed(2)}%`,
        `- **Baseline (\`${BASELINE_MODEL}\`):** ≈ 85% on this same needs-review set.`,
        `- **Delta vs baseline:** ${(accuracy - 85).toFixed(2)} pts`
    ].join("\n");

    return `# Vision model accuracy benchmark

**Model:** \`${MODEL_ID}\`
**Baseline:** \`${BASELINE_MODEL}\` (legacy Python CLI, Ollama)
**Generated:** ${stamp}
**Sample size:** ${total}
**Source manifest:** \`src/lib/extract/__tests__/fixtures/expected.json\` (${manifest.source})

## Summary

${summary}

## Per-fixture results

| id | expected | got | detected | match? | notes |
| --- | --- | --- | --- | :---: | --- |
${tableRows}

## How to run

\`\`\`bash
CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… bun run benchmark
\`\`\`

It calls Workers AI via the production REST chat path for every fixture, normalizes
with the production \`extractResponseText\` → \`parseProfileResponse\` → \`cleanUsername\`
pipeline, and writes this report. Missing creds or a failed probe is a HARD failure
(exit 1) — the gate never silently writes a template (M-020).
`;
}

async function main(): Promise<void> {
    const creds = loadCredsOrExit();
    const manifest = loadManifest();
    const rows = await runBenchmark(creds);
    writeFileSync(reportPath, buildReport(rows, manifest));
    const total = rows.length;
    const matches = rows.filter((r) => r.match).length;
    const pct = total === 0 ? 0 : ((matches / total) * 100).toFixed(2);
    console.log(`[benchmark] wrote ${reportPath}`);
    console.log(`[benchmark] live run: ${matches}/${total} matches (${pct}%)`);
}

await main();
