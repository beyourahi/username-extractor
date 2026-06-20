<script lang="ts">
    import { Plus, ChevronRight, Check, X, Search } from "@lucide/svelte";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import EmptyState from "$lib/components/EmptyState.svelte";
    import Pagination from "$lib/components/Pagination.svelte";
    import Button from "$lib/components/Button.svelte";
    import Spinner from "$lib/components/Spinner.svelte";

    let { data } = $props();

    function relTime(ts: number): string {
        const diff = Date.now() - ts;
        const m = Math.floor(diff / 60_000);
        if (m < 1) return "just now";
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        const d = Math.floor(h / 24);
        return `${d}d ago`;
    }

    function elapsedFmt(ms: number | null | undefined): string {
        if (!ms || ms <= 0) return "—";
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60_000).toFixed(1)}m`;
    }

    const live = $derived(data.jobs.filter((j) => j.status === "pending" || j.status === "running"));
    const past = $derived(data.jobs.filter((j) => j.status !== "pending" && j.status !== "running"));
</script>

<main class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-[var(--shell-x)] pt-8 pb-8 sm:pt-10">
    <PageHeader title="Jobs" subtitle="Every extraction batch you've run, newest first.">
        {#snippet actions()}
            <Button variant="brand" size="default" href="/">
                <Plus size={13} /> New job
            </Button>
        {/snippet}
    </PageHeader>

    {#if data.jobs.length === 0}
        <EmptyState title="No jobs yet" description="Upload screenshots from the home page to start your first job.">
            {#snippet icon()}
                <Search class="h-7 w-7" />
            {/snippet}
            {#snippet action()}
                <Button variant="brand" size="sm" href="/">
                    <Plus size={13} /> New job
                </Button>
            {/snippet}
        </EmptyState>
    {:else}
        {#each live as j (j.id)}
            <div class="border-brand-border bg-brand-soft fade-in rounded-[var(--radius)] border">
                <a href={`/jobs/${j.id}`} class="flex w-full items-center gap-3 p-4 text-left">
                    <div class="bg-brand-soft flex h-10 w-10 items-center justify-center rounded-full">
                        <Spinner size="sm" color="brand" />
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <p class="text-body text-foreground font-semibold">Currently running</p>
                            <span
                                class="border-brand-border text-brand inline-flex items-center gap-1.5 rounded-full border px-2 py-[1px] font-mono text-[10px] uppercase"
                            >
                                <span class="status-dot-pulse bg-status-active h-1.5 w-1.5 rounded-full"></span>
                                LIVE
                            </span>
                        </div>
                        <p class="text-ink-muted mt-0.5 font-mono text-xs">
                            {j.id} · {j.counts.verified}/{j.imageCount} processed
                        </p>
                    </div>
                    <ChevronRight size={16} class="text-ink-muted" />
                </a>
            </div>
        {/each}

        <div class="border-hair bg-card overflow-hidden rounded-[var(--radius)] border">
            <div
                class="border-hair text-ink-muted text-micro hidden gap-3 border-b px-4 py-2.5 font-mono tracking-[0.14em] uppercase sm:grid sm:grid-cols-[minmax(220px,1fr)_80px_110px_120px_90px_24px]"
            >
                <span>Job</span>
                <span class="text-right">Images</span>
                <span class="text-right">Verified</span>
                <span class="text-right">Status</span>
                <span class="text-right">Elapsed</span>
                <span></span>
            </div>
            <div>
                {#each past as job, i (job.id)}
                    <a
                        href={`/jobs/${job.id}`}
                        class="status-transition hover:bg-ink-2/40 flex w-full flex-col gap-2 px-4 py-3 text-left sm:grid sm:grid-cols-[minmax(220px,1fr)_80px_110px_120px_90px_24px] sm:items-center sm:gap-3"
                        style={i ? "border-top: 1px solid var(--hair);" : undefined}
                    >
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="text-foreground font-mono text-sm font-semibold whitespace-nowrap"
                                    >{job.id.slice(0, 18)}</span
                                >
                                {#if job.status === "completed"}
                                    <span
                                        class="border-status-active-border bg-status-active-bg text-status-active-fg inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px] font-mono text-[10px] uppercase"
                                    >
                                        <Check size={9} /> done
                                    </span>
                                {:else if job.status === "cancelled"}
                                    <span
                                        class="border-status-inactive-border bg-status-inactive-bg text-status-inactive-fg inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px] font-mono text-[10px] uppercase"
                                    >
                                        <X size={9} /> cancelled
                                    </span>
                                {:else if job.status === "failed"}
                                    <span
                                        class="border-tier-failed-border bg-tier-failed-bg text-tier-failed-fg inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px] font-mono text-[10px] uppercase"
                                    >
                                        <X size={9} /> failed
                                    </span>
                                {/if}
                            </div>
                            <p class="text-ink-muted mt-0.5 truncate text-[11px]">
                                {relTime(job.createdAt)} · <span class="font-mono">{job.vlmModel}</span>
                            </p>
                        </div>
                        <p class="text-ink-muted font-mono tabular-nums sm:text-right">{job.imageCount}</p>
                        <div class="font-mono whitespace-nowrap sm:text-right">
                            <span class="text-brand tabular-nums">{job.counts.verified ?? 0}</span>
                            <span class="text-ink-muted tabular-nums">/{job.imageCount}</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-1.5 sm:justify-end">
                            {#if (job.counts.review ?? 0) > 0}
                                <span class="text-tier-med-fg font-mono text-[11px] tabular-nums" title="Review">
                                    ↻{job.counts.review}
                                </span>
                            {/if}
                            {#if (job.counts.failed ?? 0) > 0}
                                <span class="text-tier-failed-fg font-mono text-[11px] tabular-nums" title="Failed">
                                    ✗{job.counts.failed}
                                </span>
                            {/if}
                            {#if (job.counts.verified ?? 0) === job.imageCount && job.imageCount > 0}
                                <span
                                    class="text-status-active-fg font-mono text-[11px] tabular-nums"
                                    title="All verified"
                                >
                                    ✓all
                                </span>
                            {/if}
                        </div>
                        <p class="text-ink-muted font-mono text-xs whitespace-nowrap tabular-nums sm:text-right">
                            {elapsedFmt(job.completedAt ? job.completedAt - job.createdAt : null)}
                        </p>
                        <ChevronRight size={14} class="text-ink-muted hidden sm:inline" />
                    </a>
                {/each}
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} baseHref="/jobs" />
        </div>
    {/if}
</main>
