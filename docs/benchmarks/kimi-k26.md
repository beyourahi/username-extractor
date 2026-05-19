# Kimi K2.6 — Username extraction benchmark

Tracks accuracy of `@cf/moonshot/kimi-k2.6` (Workers AI) on Instagram profile-screenshot username extraction, the core decision in the PRD §Acceptance criteria.

## Protocol

1. Curate 50 historical Instagram profile screenshots from the legacy CLI archive. Cover a mix of: light/dark mode, sponsored profile chrome, edge-case usernames (underscores, periods, very short, max-length 30 chars), low-resolution captures, and verified-badge variants.
2. Hand-label the ground-truth username for each screenshot (`username` only, no `@` prefix, lowercased).
3. Upload the batch through the deployed pipeline (`POST /api/jobs`) and wait for completion.
4. For each item: compare the extracted `username` to the ground truth.
5. Record verified-tier accuracy = `verified_correct / total`, where "verified" means the pipeline classified the item as HIGH or MED tier and committed it to `leads`.

## Threshold

≥ **92% verified-tier accuracy** is required to keep Workers AI as the single inference path. Below threshold, fall back to the **Cloudflare Containers escape hatch** documented in the PRD: run the legacy Python pipeline inside a Cloudflare Container (Ollama + GLM-OCR) behind the same Queue consumer, and route AI calls there instead.

Near-duplicate fallbacks (Levenshtein ≤ 2 against an existing lead) count as **correct** when the matched lead is the ground truth; otherwise they count as incorrect.

## Results

| Run date                 | Total | Verified correct | Verified accuracy | Notes                                                     |
| ------------------------ | ----- | ---------------- | ----------------- | --------------------------------------------------------- |
| TODO — first real deploy | 50    | —                | —                 | Fill after `bun run deploy` + uploading the benchmark set |

If a run drops below threshold, attach a CSV of `(filename, ground_truth, predicted, tier, confidence, edit_distance)` next to this doc and open an issue tagged `bench-regression`.
