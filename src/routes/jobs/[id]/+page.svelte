<script lang="ts">
    import { onDestroy } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { toast } from "svelte-sonner";
    import { ChevronRight, Plus, Check, X, Layers } from "@lucide/svelte";
    import JobSummaryPanel from "$lib/components/JobSummaryPanel.svelte";
    import ResultRow from "$lib/components/ResultRow.svelte";
    import RawResponseDialog from "$lib/components/RawResponseDialog.svelte";
    import Button from "$lib/components/Button.svelte";
    import Eyebrow from "$lib/components/Eyebrow.svelte";
    import { createJobStream } from "$lib/client/job-stream.svelte";
    import { cn } from "$lib/utils/cn";
    import type { JobItem } from "$lib/server/schema";
    import type { ItemStatus, Tier, NotionStatus } from "$lib/types/messages";

    let { data } = $props();

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

    onDestroy(() => stream?.close());

    const merged = $derived.by(() => {
        const map = new SvelteMap<string, JobItem>();
        for (const it of initialItems) map.set(it.id, it);

        if (stream) {
            for (const live of Object.values(stream.state.items)) {
                const base = map.get(live.item_id) ?? null;
                const m: JobItem = {
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
                map.set(live.item_id, m);
            }
        }
        return Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
    });

    function notionStatusFor(itemId: string): NotionStatus {
        if (!stream) return notionConfigured ? null : "unconfigured";
        return stream.state.items[itemId]?.notion_status ?? (notionConfigured ? null : "unconfigured");
    }

    function notionPageFor(itemId: string): string | null {
        return stream?.state.items[itemId]?.notion_page_id ?? null;
    }

    // Filter chips
    type Filter = "all" | "verified" | "review" | "failed";
    let filter = $state<Filter>("all");

    const counts = $derived.by(() => {
        const c = { verified: 0, review: 0, failed: 0, duplicate: 0 };
        for (const it of merged) {
            if (it.status === "verified") c.verified++;
            else if (it.status === "review") c.review++;
            else if (it.status === "failed") c.failed++;
            else if (it.status === "duplicate") c.duplicate++;
        }
        return c;
    });

    const filtered = $derived.by(() => {
        if (filter === "all") return merged;
        return merged.filter((it) => it.status === filter);
    });

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
            toast.success("Retry queued");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Retry failed");
        }
    }

    async function cancel() {
        if (!confirm("Cancel this job?")) return;
        try {
            const res = await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
            if (!res.ok) throw new Error(`${res.status}`);
            toast.success("Cancellation sent");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Cancel failed");
        }
    }

    const elapsed = $derived.by(() => {
        if (!job.completedAt) return null;
        const ms = job.completedAt - job.createdAt;
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60_000).toFixed(1)}m`;
    });
</script>

<main class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-8 pb-8 sm:px-6 sm:pt-10 lg:gap-8">
    <div class="flex items-center gap-1.5 text-xs">
        <a href="/jobs" class="sleek text-zinc-500 hover:text-zinc-200">Jobs</a>
        <ChevronRight size={11} class="text-zinc-700" />
        <span class="text-muted-fg font-mono">{job.id}</span>
    </div>

    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
            <div class="flex flex-wrap items-center gap-2.5">
                <h1 class="text-2xl font-black tracking-tight sm:text-3xl" style="letter-spacing: -0.02em;">
                    {#if isLive}Extracting…{:else if job.status === "completed"}Extraction complete{:else if job.status === "cancelled"}Cancelled{:else if job.status === "failed"}Failed{:else}Job{/if}
                </h1>
                {#if isLive}
                    <span
                        class="border-brand-border bg-brand-soft text-brand inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                    >
                        <span class="status-dot-pulse bg-brand h-1.5 w-1.5 rounded-full"></span>
                        LIVE
                    </span>
                {:else if job.status === "completed"}
                    <span
                        class="border-status-active-border bg-status-active-bg text-status-active-fg inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                    >
                        <Check size={9} /> COMPLETED
                    </span>
                {:else if job.status === "cancelled"}
                    <span
                        class="border-status-inactive-border bg-status-inactive-bg text-status-inactive-fg inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                    >
                        <X size={9} /> CANCELLED
                    </span>
                {:else if job.status === "failed"}
                    <span
                        class="border-tier-failed-border bg-tier-failed-bg text-tier-failed-fg inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                    >
                        <X size={9} /> FAILED
                    </span>
                {/if}
            </div>
            <p class="text-muted-fg mt-1 text-xs">
                <span class="font-mono">{job.id}</span> · {job.imageCount} images ·
                <span class="font-mono">{job.vlmModel}</span>{#if job.diagnostics}
                    · diagnostics{/if}{#if elapsed}
                    · {elapsed}{/if}
            </p>
        </div>
        <div class="flex items-center gap-2">
            {#if isLive}
                <Button variant="outline" size="sm" onclick={cancel}>
                    <X size={13} /> Cancel job
                </Button>
            {:else}
                <Button variant="outline" size="sm" href="/">
                    <Plus size={13} /> New job
                </Button>
            {/if}
        </div>
    </div>

    {#if !notionConfigured}
        <div
            class="border-tier-med-border bg-tier-med-bg text-tier-med-fg flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-pretty"
        >
            <span class="mt-px">⚠</span>
            <span>
                Notion not configured · leads stored locally only ·
                <a href="/settings" class="font-medium underline-offset-2 hover:underline">configure</a>
            </span>
        </div>
    {/if}

    <JobSummaryPanel
        {job}
        items={merged}
        running={isLive}
        processed={merged.filter((it) => it.status !== "pending").length}
    />

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Eyebrow icon={Layers}>Results · {filtered.length} of {merged.length}</Eyebrow>
        <div class="flex flex-wrap items-center gap-2">
            {#each [{ id: "all" as Filter, label: "All", n: merged.length, tone: "default" }, { id: "verified" as Filter, label: "Verified", n: counts.verified, tone: "brand" }, { id: "review" as Filter, label: "Review", n: counts.review, tone: "med" }, { id: "failed" as Filter, label: "Failed", n: counts.failed, tone: "failed" }] as chip (chip.id)}
                {@const active = filter === chip.id}
                <button
                    type="button"
                    onclick={() => (filter = chip.id)}
                    class={cn(
                        "sleek inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap"
                    )}
                    style={active
                        ? chip.tone === "brand"
                            ? "background: var(--brand-soft); border-color: var(--brand-border); color: var(--brand);"
                            : chip.tone === "med"
                              ? "background: var(--tier-med-bg); border-color: var(--tier-med-border); color: var(--tier-med-foreground);"
                              : chip.tone === "failed"
                                ? "background: var(--tier-failed-bg); border-color: var(--tier-failed-border); color: var(--tier-failed-foreground);"
                                : "background: var(--brand-soft); border-color: var(--brand-border); color: var(--brand);"
                        : "border-color: var(--border-strong); color: var(--muted-foreground);"}
                >
                    {chip.label}{chip.id !== "all" ? ` · ${chip.n}` : ""}
                </button>
            {/each}
        </div>
    </div>

    <div class="border-border bg-card overflow-hidden rounded-lg border">
        <div class="border-border text-muted-fg border-b px-4 py-2.5 text-[10px] tracking-[0.12em] uppercase">
            Items
        </div>
        {#if filtered.length === 0}
            {#if isLive}
                <div class="text-muted-fg px-4 py-8 text-center text-xs">Awaiting first item…</div>
            {:else}
                <div class="text-muted-fg px-4 py-8 text-center text-xs">No items match this filter.</div>
            {/if}
        {:else}
            <div class="space-y-2 p-3">
                {#each filtered as item, idx (item.id)}
                    <ResultRow
                        index={idx}
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

                {#if isLive}
                    <div
                        class="border-brand-border bg-brand-soft fade-in flex items-center gap-3 rounded-lg border-2 border-dashed p-3"
                    >
                        <div
                            class="scan-line relative overflow-hidden rounded-md"
                            style="width: 48px; height: 48px; background: hsl(160 30% 15%);"
                        >
                            <div class="absolute inset-1.5 rounded-sm" style="background: hsl(160 30% 20%);"></div>
                        </div>
                        <div class="flex-1">
                            <p class="text-brand font-mono text-[11px] font-medium tracking-wider uppercase">
                                Now processing
                            </p>
                            <p class="font-mono text-sm text-zinc-200">
                                {stream?.state.items ? "Streaming…" : "Awaiting…"}
                            </p>
                            <p class="text-muted-fg text-xs">
                                Sending to <span class="font-mono">{job.vlmModel}</span>
                            </p>
                        </div>
                        <div
                            class="spin h-4 w-4 rounded-full"
                            style="border: 2px solid hsl(0 0% 100% / 0.10); border-top-color: var(--brand);"
                        ></div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>

    {#if stream?.state.error}
        <p class="text-tier-failed-fg text-xs text-pretty">Stream error: {stream.state.error}</p>
    {/if}
</main>

<RawResponseDialog open={rawOpen} jobId={job.id} stem={rawStem} onclose={() => (rawOpen = false)} />
