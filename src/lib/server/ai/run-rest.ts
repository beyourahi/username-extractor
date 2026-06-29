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

/**
 * Default vision model — benchmark-validated (docs/benchmark.md) at 16/16 on a real
 * lead-screenshot sample. Reads full screenshots correctly via the chat/image_url
 * request format below. (The former default `@cf/moonshotai/kimi-k2.6` scored 0/16 —
 * a text-first model that doesn't actually read the image; see M-020.)
 */
export const DEFAULT_VISION_MODEL = "@cf/mistralai/mistral-small-3.1-24b-instruct";

export interface CloudflareCreds {
    accountId: string;
    apiToken: string;
}

/** Image extraction input — identical contract to the old binding call. */
export interface VisionRestInput {
    image: number[];
    prompt: string;
    /** Optional output cap. Set high enough that a JSON object response can't truncate. */
    maxTokens?: number;
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

/** Sniff an image MIME type from leading magic bytes; default to JPEG. */
function sniffMime(bytes: number[]): string {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
    return "image/jpeg";
}

/** Base64-encode a byte array in chunks (avoids arg-count limits / stack overflow on large images). */
function bytesToBase64(bytes: number[]): string {
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.slice(i, i + CHUNK));
    }
    return btoa(binary);
}

async function postRun(creds: CloudflareCreds, model: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(`${CF_API}/accounts/${creds.accountId}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
}

function unwrapResult(json: unknown): unknown {
    return json && typeof json === "object" && "result" in json ? (json as { result: unknown }).result : json;
}

/**
 * Runs one image through the user's chosen model on the user's account.
 * Returns the unwrapped model output (hand straight to `extractResponseText`).
 * Throws `CfInferenceError` on any non-2xx so the consumer can map it.
 *
 * Modern instruct/chat vision models (mistral-small-3.1, llama-4-scout, gemma, kimi)
 * REQUIRE the OpenAI-style `messages` + `image_url` (base64 data URL) schema — the
 * legacy `{ prompt, image: number[] }` shape is silently ignored by them (they never
 * see the image and emit placeholders; root cause of M-020). We send chat first and
 * fall back to the legacy shape only if a model rejects it (the older image-to-text
 * models like llava expect `{ prompt, image }`).
 */
export async function runVisionViaRest(
    creds: CloudflareCreds,
    model: string,
    input: VisionRestInput
): Promise<unknown> {
    const maxTokens = input.maxTokens ?? 512;
    const dataUrl = `data:${sniffMime(input.image)};base64,${bytesToBase64(input.image)}`;
    const chatBody: Record<string, unknown> = {
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: input.prompt },
                    { type: "image_url", image_url: { url: dataUrl } }
                ]
            }
        ],
        max_tokens: maxTokens
    };

    let res: Response;
    try {
        res = await postRun(creds, model, chatBody);
    } catch (e) {
        throw new CfInferenceError(0, "transport", e instanceof Error ? e.message : "network error");
    }

    // 400 == this model rejects the chat schema → retry the legacy image-to-text shape (llava/uform).
    if (res.status === 400) {
        const legacyBody: Record<string, unknown> = { image: input.image, prompt: input.prompt, max_tokens: maxTokens };
        try {
            res = await postRun(creds, model, legacyBody);
        } catch (e) {
            throw new CfInferenceError(0, "transport", e instanceof Error ? e.message : "network error");
        }
    }

    if (!res.ok) {
        throw new CfInferenceError(res.status, kindForStatus(res.status), `Workers AI REST ${res.status}`);
    }

    // Native Workers AI REST wraps the output: { success, result, errors }.
    return unwrapResult(await res.json());
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
            label: "mistralai/mistral-small-3.1-24b-instruct",
            task: "Image-Text-to-Text",
            description: "Default vision model (benchmark-validated, 16/16 on real screenshots).",
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
