<script lang="ts">
    import { untrack } from "svelte";
    import { goto } from "$app/navigation";
    import { toast } from "svelte-sonner";
    import { Sparkles, AlertTriangle } from "@lucide/svelte";
    import HeroHeading from "$lib/components/HeroHeading.svelte";
    import UploadDropzone from "$lib/components/UploadDropzone.svelte";
    import Switch from "$lib/components/Switch.svelte";
    import Button from "$lib/components/Button.svelte";
    import Spinner from "$lib/components/Spinner.svelte";

    let { data } = $props();

    let files = $state<File[]>([]);
    let diagnostics = $state<boolean>(untrack(() => Boolean(data.diagnosticsDefault)));
    let submitting = $state(false);
    const notionConfigured = $derived(Boolean(data.notionConfigured));

    async function submit() {
        if (files.length === 0) {
            toast.error("No files selected");
            return;
        }
        submitting = true;
        try {
            const form = new FormData();
            for (const f of files) form.append("files", f);
            form.append("diagnostics", diagnostics ? "true" : "false");

            const res = await fetch("/api/jobs", { method: "POST", body: form });
            if (!res.ok) {
                const body = await res.text();
                throw new Error(`${res.status} ${body}`);
            }
            const json = (await res.json()) as { jobId?: string; job_id?: string; id?: string };
            const jobId = json.jobId ?? json.job_id ?? json.id;
            if (!jobId) throw new Error("Missing jobId in response");
            toast.success(`Job queued · ${files.length} images`);
            await goto(`/jobs/${jobId}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Upload failed");
        } finally {
            submitting = false;
        }
    }
</script>

<div class="flex w-full grow flex-col items-center justify-center gap-10 px-4 py-10 sm:gap-14 sm:py-14 lg:gap-20">
    <HeroHeading />

    {#if !notionConfigured}
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
            <UploadDropzone disabled={submitting} processing={submitting} onfiles={(f) => (files = f)} />
        </div>

        <div class="flex w-full max-w-sm flex-col gap-4">
            <div class="mb-1 flex items-center gap-3">
                <div class="bg-border h-px flex-1"></div>
                <span class="text-muted-fg text-[11px] font-medium tracking-[0.16em] uppercase">This run</span>
                <div class="bg-border h-px flex-1"></div>
            </div>

            <div class="border-border-strong bg-card rounded-xl border p-4 backdrop-blur-sm">
                <div class="space-y-4">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <p class="text-sm font-medium text-zinc-200">Diagnostics</p>
                            <p class="text-muted-fg mt-1 text-xs text-pretty">
                                Saves raw model responses to R2 for replay.
                            </p>
                        </div>
                        <Switch
                            checked={diagnostics}
                            onchange={(v) => (diagnostics = v)}
                            ariaLabel="Diagnostics"
                            disabled={submitting}
                        />
                    </div>
                    <div class="bg-border h-px"></div>
                    <dl class="space-y-2 text-xs">
                        <div class="flex items-center justify-between gap-3">
                            <dt class="text-muted-fg shrink-0">Vision model</dt>
                            <dd
                                class="truncate text-right text-[11px] whitespace-nowrap"
                                style="font-family: var(--font-mono); color: hsl(0 0% 80%);"
                            >
                                @cf/moonshotai/kimi-k2.6
                            </dd>
                        </div>
                        <div class="flex items-center justify-between gap-3">
                            <dt class="text-muted-fg shrink-0">Auto-sync to Notion</dt>
                            <dd class="flex items-center gap-1.5 whitespace-nowrap">
                                <span
                                    class="h-1.5 w-1.5 rounded-full"
                                    style="background: {notionConfigured ? 'var(--brand)' : 'var(--muted-foreground)'};"
                                ></span>
                                <span class="text-zinc-300">{notionConfigured ? "Enabled" : "Off"}</span>
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            <Button
                variant="brand"
                size="lg"
                class="w-full"
                disabled={files.length === 0 || submitting}
                onclick={submit}
            >
                {#if submitting}
                    <Spinner size="sm" />
                {:else}
                    <Sparkles size={14} />
                {/if}
                {submitting ? "Uploading…" : `Run extraction${files.length > 0 ? ` · ${files.length}` : ""}`}
            </Button>

            <p class="text-muted-fg text-center text-[11px]">Verified handles auto-sync to your Notion CRM.</p>
        </div>
    </div>
</div>
