<script lang="ts">
    import { untrack } from "svelte";
    import { goto, beforeNavigate } from "$app/navigation";
    import { toast } from "svelte-sonner";
    import { Sparkles, AlertTriangle, Cloud, LogIn } from "@lucide/svelte";
    import { Eyebrow } from "$lib/ds";
    import UploadDropzone from "$lib/components/UploadDropzone.svelte";
    import Switch from "$lib/components/Switch.svelte";
    import Button from "$lib/components/Button.svelte";
    import Spinner from "$lib/components/Spinner.svelte";

    import { normalizeAll } from "$lib/utils/normalizeImage";

    let { data } = $props();

    // Files-per-request for chunked folder uploads. A single multipart POST can't
    // carry hundreds of MB; folders stream up in batches that share one job.
    const CHUNK = 50;

    let files = $state<File[]>([]);
    let diagnostics = $state<boolean>(untrack(() => Boolean(data.diagnosticsDefault)));
    let submitting = $state(false);
    // True only during the fragile client-side upload window (create → chunks → finalize).
    // Guards (beforeunload + beforeNavigate) below arm only while this is true.
    let uploadActive = $state(false);
    const signedIn = $derived(Boolean(data.signedIn));
    const notionConfigured = $derived(Boolean(data.notionConfigured));
    const cloudflareConnected = $derived(Boolean(data.cloudflareConnected));

    // Progress surface for the dropzone while preparing/uploading large folders.
    let phase = $state<"idle" | "preparing" | "creating" | "uploading">("idle");
    let prepared = $state(0);
    let uploaded = $state(0);
    let total = $state(0);
    const progressLabel = $derived.by(() => {
        if (phase === "preparing") return `Preparing ${prepared}/${total}…`;
        if (phase === "uploading") return `Uploading ${uploaded}/${total}…`;
        return "Creating job…";
    });

    async function postChunk(url: string, chunk: File[]) {
        const form = new FormData();
        for (const f of chunk) form.append("files", f);
        const res = await fetch(url, { method: "POST", body: form });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res;
    }

    async function submit() {
        if (files.length === 0) {
            toast.error("No files selected");
            return;
        }
        if (!cloudflareConnected) {
            toast.error("Connect your Cloudflare account in Settings first.");
            return;
        }
        submitting = true;
        uploadActive = true;
        total = files.length;
        try {
            // 1. Normalize AVIF/BMP/TIFF → JPEG so the model can read them (web-safe pass through).
            phase = "preparing";
            prepared = 0;
            const prepd = await normalizeAll(files, (d) => (prepared = d));

            let jobId: string | undefined;

            if (prepd.length <= CHUNK) {
                // Small batch → single multipart POST (legacy path, unchanged).
                phase = "creating";
                const form = new FormData();
                for (const f of prepd) form.append("files", f);
                form.append("diagnostics", diagnostics ? "true" : "false");
                const res = await fetch("/api/jobs", { method: "POST", body: form });
                if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
                const json = (await res.json()) as { jobId?: string; job_id?: string; id?: string };
                jobId = json.jobId ?? json.job_id ?? json.id;
            } else {
                // Large folder → create one job, stream chunks, finalize.
                phase = "creating";
                const createRes = await fetch("/api/jobs", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ multi: true, expectedTotal: prepd.length, diagnostics })
                });
                if (!createRes.ok) throw new Error(`${createRes.status} ${await createRes.text()}`);
                const cj = (await createRes.json()) as { jobId?: string; job_id?: string; id?: string };
                jobId = cj.jobId ?? cj.job_id ?? cj.id;
                if (!jobId) throw new Error("Missing jobId in response");

                phase = "uploading";
                uploaded = 0;
                for (let i = 0; i < prepd.length; i += CHUNK) {
                    const chunk = prepd.slice(i, i + CHUNK);
                    await postChunk(`/api/jobs/${jobId}/items`, chunk);
                    uploaded += chunk.length;
                }
                const fin = await fetch(`/api/jobs/${jobId}/finalize`, { method: "POST" });
                if (!fin.ok) throw new Error(`finalize ${fin.status} ${await fin.text()}`);
            }

            if (!jobId) throw new Error("Missing jobId in response");
            // Upload fully complete (all chunks uploaded + finalized) — the fragile window has
            // closed. Release the guards BEFORE the app's own redirect so it isn't blocked.
            uploadActive = false;
            toast.success(`Job queued · ${prepd.length} images`);
            await goto(`/jobs/${jobId}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Upload failed");
        } finally {
            submitting = false;
            uploadActive = false;
            phase = "idle";
        }
    }

    // Guard hard browser exits (refresh / tab close / window close / new URL) while the upload
    // loop is mid-flight. Modern browsers show their own generic prompt; custom text is ignored.
    $effect(() => {
        if (!uploadActive) return;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    });

    // Guard in-app SvelteKit navigation (tab links, floating User links) during the same window.
    // uploadActive flips false synchronously before the intentional goto(), so this never blocks it.
    beforeNavigate((navigation) => {
        if (
            uploadActive &&
            !confirm(
                "Upload still in progress — leaving now will cancel the images that haven't uploaded yet. Leave anyway?"
            )
        ) {
            navigation.cancel();
        }
    });
</script>

<div class="flex w-full flex-col items-center gap-8 sm:gap-10">
    {#if !signedIn}
        <div
            class="border-brand-border bg-brand-soft fade-in flex w-full max-w-md items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs text-pretty"
        >
            <LogIn size={15} class="text-brand mt-px shrink-0" />
            <span class="text-foreground">
                Sign in to run extractions — screenshots are processed on your own Cloudflare account.
                <a href="/login" class="text-brand font-medium underline-offset-2 hover:underline">Sign in</a>
            </span>
        </div>
    {:else if !cloudflareConnected}
        <div
            class="border-brand-border bg-brand-soft fade-in flex w-full max-w-md items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs text-pretty"
        >
            <Cloud size={15} class="text-brand mt-px shrink-0" />
            <span class="text-foreground">
                Connect your Cloudflare account to run extractions — it runs on your own Cloudflare account.
                <a href="/settings" class="text-brand font-medium underline-offset-2 hover:underline">Connect now</a>
            </span>
        </div>
    {/if}

    {#if signedIn && !notionConfigured}
        <div
            class="border-tier-med-border bg-tier-med-bg text-tier-med-fg fade-in flex w-full max-w-md items-start gap-2 rounded-lg border px-3 py-2 text-xs text-pretty"
        >
            <AlertTriangle size={14} class="mt-px shrink-0" />
            <span>
                Notion not configured · leads will save locally only ·
                <a href="/settings" class="font-medium underline-offset-2 hover:underline">configure</a>
            </span>
        </div>
    {/if}

    <div
        class="flex w-full max-w-md flex-col items-center justify-center gap-8 sm:max-w-xl sm:gap-10 lg:max-w-4xl lg:flex-row lg:items-start lg:gap-12 2xl:max-w-6xl"
    >
        <div class="w-full lg:max-w-lg">
            <UploadDropzone
                disabled={submitting}
                processing={submitting}
                {progressLabel}
                onfiles={(f) => (files = f)}
            />
        </div>

        <div class="flex w-full max-w-sm flex-col gap-4">
            <div class="mb-1 flex items-center gap-3">
                <div class="border-hair flex-1 border-t"></div>
                <Eyebrow>This run</Eyebrow>
                <div class="border-hair flex-1 border-t"></div>
            </div>

            <div class="border-hair bg-card rounded-lg border p-4 sm:p-5">
                <div class="space-y-4">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <p class="text-foreground text-sm font-medium">Diagnostics</p>
                            <p class="text-ink-muted mt-1 text-xs text-pretty">
                                Saves the raw AI response so you can review it later.
                            </p>
                        </div>
                        <Switch
                            checked={diagnostics}
                            onchange={(v) => (diagnostics = v)}
                            ariaLabel="Diagnostics"
                            disabled={submitting}
                        />
                    </div>
                    <div class="border-hair border-t"></div>
                    <dl class="space-y-2 text-xs">
                        <div class="flex items-center justify-between gap-3">
                            <dt class="text-ink-muted shrink-0">Image model</dt>
                            <dd class="text-foreground text-caption truncate text-right font-mono whitespace-nowrap">
                                {data.cloudflareModel}
                            </dd>
                        </div>
                        <div class="flex items-center justify-between gap-3">
                            <dt class="text-ink-muted shrink-0">Auto-sync to Notion</dt>
                            <dd class="flex items-center gap-1.5 whitespace-nowrap">
                                <span class="h-1.5 w-1.5 rounded-full {notionConfigured ? 'bg-brand' : 'bg-ink-muted'}"
                                ></span>
                                <span class="text-foreground">{notionConfigured ? "Enabled" : "Off"}</span>
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            <Button
                variant="brand"
                size="lg"
                class="w-full touch-manipulation"
                disabled={files.length === 0 || submitting || !cloudflareConnected}
                onclick={submit}
            >
                {#if submitting}
                    <Spinner size="sm" />
                {:else}
                    <Sparkles size={14} />
                {/if}
                {submitting ? "Uploading…" : `Run extraction${files.length > 0 ? ` · ${files.length}` : ""}`}
            </Button>

            <p class="text-ink-muted text-caption text-center">Verified usernames auto-sync to your Notion database.</p>
        </div>
    </div>
</div>
