<script lang="ts">
    import { untrack } from "svelte";
    import { goto } from "$app/navigation";
    import { toast } from "svelte-sonner";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import UploadDropzone from "$lib/components/UploadDropzone.svelte";

    let { data } = $props();

    let files = $state<File[]>([]);
    let diagnostics = $state<boolean>(untrack(() => Boolean(data.diagnosticsDefault)));
    let submitting = $state(false);
    const notionConfigured = $derived(Boolean(data.notionConfigured));

    async function submit() {
        if (files.length === 0) {
            toast.error("no files selected");
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
            if (!jobId) throw new Error("missing jobId in response");
            toast.success(`job queued · ${files.length} images`);
            await goto(`/jobs/${jobId}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "upload failed");
        } finally {
            submitting = false;
        }
    }
</script>

<div class="flex flex-col gap-6">
    <PageHeader title="upload" subtitle="drop instagram screenshots — extract usernames at confidence ≥85" />

    {#if !notionConfigured}
        <div class="border-warning/40 bg-warning/10 text-warning rounded border px-3 py-2 font-mono text-xs">
            notion not configured · leads will save locally only ·
            <a href="/settings" class="underline">configure</a>
        </div>
    {/if}

    <UploadDropzone disabled={submitting} onfiles={(f) => (files = f)} />

    <div class="flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
        <label class="text-foreground-muted flex items-center gap-2">
            <input type="checkbox" bind:checked={diagnostics} disabled={submitting} />
            <span>diagnostics · save raw model response</span>
        </label>

        <button
            type="button"
            class="border-accent bg-accent/10 text-accent hover:bg-accent/20 rounded-sm border px-4 py-1.5 tracking-widest uppercase disabled:cursor-not-allowed disabled:opacity-50"
            onclick={submit}
            disabled={submitting || files.length === 0}
        >
            {submitting ? "uploading…" : `extract · ${files.length || 0}`}
        </button>
    </div>
</div>
