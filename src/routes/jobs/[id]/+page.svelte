<script lang="ts">
    import { onDestroy } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { toast } from "svelte-sonner";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import JobSummaryPanel from "$lib/components/JobSummaryPanel.svelte";
    import ResultRow from "$lib/components/ResultRow.svelte";
    import Badge from "$lib/components/Badge.svelte";
    import RawResponseDialog from "$lib/components/RawResponseDialog.svelte";
    import { createJobStream } from "$lib/client/job-stream.svelte";
    import type { JobItem } from "$lib/server/schema";
    import type { ItemStatus, Tier, NotionStatus } from "$lib/types/messages";

    let { data } = $props();

    // OptionalUnion in generated $types makes properties technically optional,
    // but the loader either returns these fields or throws, so we narrow here.
    const job = $derived(data.job!);
    const initialItems = $derived((data.items ?? []) as JobItem[]);
    const notionConfigured = $derived(data.notionConfigured ?? false);
    const isLive = $derived(job.status === "pending" || job.status === "running");

    let stream = $state<ReturnType<typeof createJobStream> | null>(null);

    $effect(() => {
        if (isLive && typeof window !== "undefined" && !stream) {
            stream = createJobStream(job.id);
        }
    });

    onDestroy(() => {
        stream?.close();
    });

    // Merge initial items with live updates from the stream.
    const merged = $derived.by(() => {
        const map = new SvelteMap<string, JobItem>();
        for (const it of initialItems) map.set(it.id, it);

        if (stream) {
            for (const live of Object.values(stream.state.items)) {
                const base = map.get(live.item_id) ?? null;
                const merged: JobItem = {
                    id: live.item_id,
                    jobId: job.id,
                    filename: live.filename ?? base?.filename ?? live.item_id,
                    r2Key: base?.r2Key ?? "",
                    status: (live.status as ItemStatus) ?? base?.status ?? "pending",
                    username: live.result?.username ?? base?.username ?? null,
                    confidence: live.result?.confidence ?? base?.confidence ?? null,
                    tier: ((live.result?.tier ?? base?.tier) as Tier) ?? null,
                    isDuplicate: (live.result?.is_duplicate ?? base?.isDuplicate ?? 0) ? 1 : 0,
                    isNearDuplicate: (live.result?.is_near_duplicate ?? base?.isNearDuplicate ?? 0) ? 1 : 0,
                    similarTo: live.result?.similar_to ?? base?.similarTo ?? null,
                    editDistance: live.result?.edit_distance ?? base?.editDistance ?? null,
                    rawModelResponse: base?.rawModelResponse ?? null,
                    error: live.error ?? base?.error ?? null,
                    createdAt: base?.createdAt ?? Date.now(),
                    completedAt: base?.completedAt ?? null
                };
                map.set(live.item_id, merged);
            }
        }
        return Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
    });

    // notion-status overlay from live stream messages.
    function notionStatusFor(itemId: string): NotionStatus {
        if (!stream) return notionConfigured ? null : "unconfigured";
        return stream.state.items[itemId]?.notion_status ?? (notionConfigured ? null : "unconfigured");
    }

    function notionPageFor(itemId: string): string | null {
        return stream?.state.items[itemId]?.notion_page_id ?? null;
    }

    // Raw dialog state.
    let rawOpen = $state(false);
    let rawStem = $state("");

    function openRaw(filename: string) {
        rawStem = filename.replace(/\.[^.]+$/, "");
        rawOpen = true;
    }

    async function retryItem(itemId: string) {
        try {
            const res = await fetch(`/api/jobs/${job.id}/items/${itemId}/retry`, { method: "POST" });
            if (!res.ok) throw new Error(`${res.status}`);
            toast.success("retry queued");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "retry failed");
        }
    }

    async function cancel() {
        if (!confirm("cancel this job?")) return;
        try {
            const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
            if (!res.ok) throw new Error(`${res.status}`);
            toast.success("cancellation sent");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "cancel failed");
        }
    }

    function statusTone(s: string): "success" | "warning" | "danger" | "info" | "default" {
        switch (s) {
            case "completed":
                return "success";
            case "running":
            case "pending":
                return "info";
            case "failed":
                return "danger";
            case "cancelled":
                return "warning";
            default:
                return "default";
        }
    }
</script>

<div class="flex flex-col gap-6">
    <PageHeader
        title={`job · ${job.id.slice(0, 8)}`}
        subtitle={`${job.imageCount} images · ${job.vlmModel}${job.diagnostics ? " · diagnostics" : ""}`}
    >
        {#snippet actions()}
            <Badge tone={statusTone(job.status)}>{job.status}</Badge>
            {#if isLive}
                <button
                    type="button"
                    class="border-danger/40 text-danger hover:bg-danger/10 rounded-sm border px-3 py-1 font-mono text-[10px] tracking-widest uppercase"
                    onclick={cancel}
                >
                    cancel
                </button>
            {/if}
        {/snippet}
    </PageHeader>

    {#if !notionConfigured}
        <div class="border-warning/40 bg-warning/10 text-warning rounded border px-3 py-2 font-mono text-xs">
            notion not configured · leads stored locally only ·
            <a href="/settings" class="underline">configure</a>
        </div>
    {/if}

    <JobSummaryPanel {job} items={merged} />

    <div class="border-border bg-surface/40 overflow-hidden rounded border">
        <div
            class="border-border text-foreground-muted border-b px-3 py-2 font-mono text-[10px] tracking-widest uppercase"
        >
            items
        </div>
        {#if merged.length === 0}
            <div class="text-foreground-muted px-3 py-6 text-center font-mono text-xs">awaiting first item…</div>
        {:else}
            {#each merged as item (item.id)}
                <ResultRow
                    item={{
                        filename: item.filename,
                        username: item.username,
                        confidence: item.confidence,
                        tier: item.tier as Tier,
                        status: item.status as ItemStatus,
                        notionStatus: notionStatusFor(item.id),
                        notionPageId: notionPageFor(item.id),
                        isDuplicate: Boolean(item.isDuplicate),
                        isNearDuplicate: Boolean(item.isNearDuplicate),
                        similarTo: item.similarTo,
                        editDistance: item.editDistance,
                        error: item.error
                    }}
                    onRetry={item.status === "failed" ? () => retryItem(item.id) : undefined}
                    onViewRaw={job.diagnostics ? () => openRaw(item.filename) : undefined}
                    appearAnimated={Boolean(stream)}
                />
            {/each}
        {/if}
    </div>

    {#if stream?.state.error}
        <p class="text-danger font-mono text-xs">stream error: {stream.state.error}</p>
    {/if}
</div>

<RawResponseDialog open={rawOpen} jobId={job.id} stem={rawStem} onclose={() => (rawOpen = false)} />
