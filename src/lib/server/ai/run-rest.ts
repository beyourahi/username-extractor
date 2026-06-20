/**
 * Per-user Cloudflare Workers AI over the REST API.
 *
 * Inference and the model catalog run on the END USER's own Cloudflare account
 * (billed to them), NOT the owner's bound `env.AI`. Both calls authenticate with
 * the user's account-scoped API token (least-privilege: Account → Workers AI).
 *
 *   runVisionViaRest  → POST /accounts/{id}/ai/run/{model}      (one image extraction)
 *   listVisionModels  → GET  /accounts/{id}/ai/models/search    (suitable models for the picker)
 *
 * The REST envelope wraps the model output in `{ success, result, errors }`; we
 * unwrap `result` so the existing `extractResponseText` (which expects the inner
 * shape the binding returns directly) keeps working unchanged.
 */

const CF_API = "https://api.cloudflare.com/client/v4";

/** Default vision model — the benchmark-validated one. New users start here. */
export const DEFAULT_VISION_MODEL = "@cf/moonshotai/kimi-k2.6";

export interface CloudflareCreds {
    accountId: string;
    apiToken: string;
}

/** Image extraction input — identical contract to the old binding call. */
export interface VisionRestInput {
    image: number[];
    prompt: string;
}

/** A model surfaced in the picker. `id` is the run path (e.g. "@cf/moonshotai/kimi-k2.6"). */
export interface CfModel {
    id: string;
    label: string;
    task: string;
    description: string;
    deprecated: boolean;
    beta: boolean;
}

export type CfErrorKind = "auth" | "rate_limit" | "model_unavailable" | "transport";

/** Typed Workers AI REST failure. `kind` drives the consumer's ack-vs-retry decision. */
export class CfInferenceError extends Error {
    public readonly status: number;
    public readonly kind: CfErrorKind;
    constructor(status: number, kind: CfErrorKind, message: string) {
        super(message);
        this.name = "CfInferenceError";
        this.status = status;
        this.kind = kind;
    }
}

function kindForStatus(status: number): CfErrorKind {
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "rate_limit";
    if (status === 404) return "model_unavailable";
    return "transport";
}

/**
 * Runs one image through the user's chosen model on the user's account.
 * Returns the unwrapped model output (hand straight to `extractResponseText`).
 * Throws `CfInferenceError` on any non-2xx so the consumer can map it.
 */
export async function runVisionViaRest(
    creds: CloudflareCreds,
    model: string,
    input: VisionRestInput
): Promise<unknown> {
    let res: Response;
    try {
        res = await fetch(`${CF_API}/accounts/${creds.accountId}/ai/run/${model}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${creds.apiToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(input)
        });
    } catch (e) {
        throw new CfInferenceError(0, "transport", e instanceof Error ? e.message : "network error");
    }

    if (!res.ok) {
        throw new CfInferenceError(res.status, kindForStatus(res.status), `Workers AI REST ${res.status}`);
    }

    // Native Workers AI REST wraps the output: { success, result, errors }.
    // The binding returns `result` directly, so unwrap to keep `extractResponseText` working.
    const json = (await res.json()) as { result?: unknown };
    return json && typeof json === "object" && "result" in json ? json.result : json;
}

// ── Model catalog ────────────────────────────────────────────────────────────

/** Raw `/ai/models/search` entry (only the fields we read; shape is defensive). */
interface RawModel {
    id?: string;
    name?: string;
    description?: string;
    task?: { name?: string } | null;
    tags?: string[];
    properties?: Array<{ property_id?: string; value?: unknown }>;
}

/**
 * Known vision-capable model ids (from the Workers AI catalog). Used as an extra
 * inclusion signal so we always surface these even if the API's task/property
 * tagging differs — the dynamic predicate below still adds any other vision model
 * the account exposes.
 */
const KNOWN_VISION_IDS = new Set([
    "@cf/moonshotai/kimi-k2.6",
    "@cf/moonshotai/kimi-k2.7-code",
    "@cf/moonshotai/kimi-k2.5",
    "@cf/meta/llama-4-scout-17b-16e-instruct",
    "@cf/meta/llama-3.2-11b-vision-instruct",
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/google/gemma-3-12b-it",
    "@cf/mistralai/mistral-small-3.1-24b-instruct",
    "@cf/llava-hf/llava-1.5-7b-hf",
    "@cf/unum/uform-gen2-qwen-500m"
]);

const IMAGE_TASKS = new Set(["image-to-text", "image-text-to-text"]);

/** True when a model can read an image + text and return text (suitable for extraction). */
function isVisionModel(m: RawModel): boolean {
    const id = m.name ?? m.id ?? "";
    if (KNOWN_VISION_IDS.has(id)) return true;

    const task = (m.task?.name ?? "").toLowerCase();
    if (IMAGE_TASKS.has(task)) return true;

    // Some catalogs flag vision via a property or tag rather than the task name.
    const hay = [
        ...(m.tags ?? []),
        ...(m.properties ?? []).map((p) => `${p.property_id ?? ""}:${String(p.value ?? "")}`)
    ]
        .join(" ")
        .toLowerCase();
    return hay.includes("vision");
}

function hasFlag(m: RawModel, flag: string): boolean {
    if ((m.tags ?? []).some((t) => t.toLowerCase() === flag)) return true;
    return (m.properties ?? []).some(
        (p) => `${p.property_id ?? ""}`.toLowerCase() === flag && String(p.value ?? "").toLowerCase() !== "false"
    );
}

function toCfModel(m: RawModel): CfModel {
    const id = m.name ?? m.id ?? "";
    return {
        id,
        label: id.replace(/^@cf\//, "").replace(/^@hf\//, ""),
        task: m.task?.name ?? "",
        description: m.description ?? "",
        deprecated: hasFlag(m, "deprecated"),
        beta: hasFlag(m, "beta")
    };
}

/**
 * Lists the account's SUITABLE (vision) models for the picker. Always includes the
 * default model (even if the live catalog momentarily omits it). Throws
 * `CfInferenceError` on auth/transport failure (callers treat that as "token invalid").
 */
export async function listVisionModels(creds: CloudflareCreds): Promise<CfModel[]> {
    let res: Response;
    try {
        res = await fetch(`${CF_API}/accounts/${creds.accountId}/ai/models/search?per_page=200`, {
            headers: { Authorization: `Bearer ${creds.apiToken}` }
        });
    } catch (e) {
        throw new CfInferenceError(0, "transport", e instanceof Error ? e.message : "network error");
    }
    if (!res.ok) {
        throw new CfInferenceError(res.status, kindForStatus(res.status), `models/search ${res.status}`);
    }

    const json = (await res.json()) as { result?: RawModel[] };
    const vision = (json.result ?? []).filter(isVisionModel).map(toCfModel);

    // Guarantee the default is present and first; de-dup by id.
    const byId = new Map<string, CfModel>();
    for (const m of vision) byId.set(m.id, m);
    if (!byId.has(DEFAULT_VISION_MODEL)) {
        byId.set(DEFAULT_VISION_MODEL, {
            id: DEFAULT_VISION_MODEL,
            label: "moonshotai/kimi-k2.6",
            task: "Text Generation",
            description: "Default vision model (benchmark-validated).",
            deprecated: false,
            beta: false
        });
    }

    return [...byId.values()].sort((a, b) => {
        if (a.id === DEFAULT_VISION_MODEL) return -1;
        if (b.id === DEFAULT_VISION_MODEL) return 1;
        if (a.deprecated !== b.deprecated) return a.deprecated ? 1 : -1;
        return a.id.localeCompare(b.id);
    });
}
