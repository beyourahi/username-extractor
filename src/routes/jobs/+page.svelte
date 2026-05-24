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

<main class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-8 pb-8 sm:px-6 sm:pt-10">
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
            <div class="border-brand-border bg-brand-soft fade-in rounded-lg border-2">
                <a href={`/jobs/${j.id}`} class="flex w-full items-center gap-3 p-4 text-left">
                    <div class="bg-brand-soft flex h-10 w-10 items-center justify-center rounded-full">
                        <Spinner size="sm" color="brand" />
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <p class="text-sm font-semibold text-zinc-100">Currently running</p>
                            <span
                                class="border-brand-border text-brand inline-flex items-center gap-1.5 rounded-full border px-2 py-[1px] text-[10px]"
                            >
                                <span class="status-dot-pulse bg-brand h-1.5 w-1.5 rounded-full"></span>
                                LIVE
                            </span>
                        </div>
                        <p class="text-muted-fg mt-0.5 font-mono text-xs">
                            {j.id} · {j.counts.verified}/{j.imageCount} processed
                        </p>
                    </div>
                    <ChevronRight size={16} class="text-zinc-500" />
                </a>
            </div>
        {/each}

        <div class="border-border bg-card overflow-hidden rounded-lg border">
            <div
                class="border-border text-muted-fg hidden gap-3 border-b px-4 py-2.5 sm:grid sm:grid-cols-[minmax(220px,1fr)_80px_110px_120px_90px_24px]"
            >
                <span class="text-[10px] tracking-[0.12em] uppercase">Job</span>
                <span class="text-right text-[10px] tracking-[0.12em] uppercase">Images</span>
                <span class="text-right text-[10px] tracking-[0.12em] uppercase">Verified</span>
                <span class="text-right text-[10px] tracking-[0.12em] uppercase">Status</span>
                <span class="text-right text-[10px] tracking-[0.12em] uppercase">Elapsed</span>
                <span></span>
            </div>
            <div>
                {#each past as job, i (job.id)}
                    <a
                        href={`/jobs/${job.id}`}
                        class="status-transition hover:bg-secondary/50 flex w-full flex-col gap-2 px-4 py-3 text-left sm:grid sm:grid-cols-[minmax(220px,1fr)_80px_110px_120px_90px_24px] sm:items-center sm:gap-3"
                        style={i ? "border-top: 1px solid var(--border);" : undefined}
                    >
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="font-mono text-sm font-semibold whitespace-nowrap text-zinc-100"
                                    >{job.id.slice(0, 18)}</span
                                >
                                {#if job.status === "completed"}
                                    <span
                                        class="border-status-active-border text-status-active-fg inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px]"
                                    >
                                        <Check size={9} /> done
                                    </span>
                                {:else if job.status === "cancelled"}
                                    <span
                                        class="border-status-inactive-border text-status-inactive-fg inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px]"
                                    >
                                        <X size={9} /> cancelled
                                    </span>
                                {:else if job.status === "failed"}
                                    <span
                                        class="border-tier-failed-border text-tier-failed-fg inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px]"
                                    >
                                        <X size={9} /> failed
                                    </span>
                                {/if}
                            </div>
                            <p class="text-muted-fg mt-0.5 truncate text-[11px]">
                                {relTime(job.createdAt)} · <span class="font-mono">{job.vlmModel}</span>
                            </p>
                        </div>
                        <p class="font-mono text-zinc-300 tabular-nums sm:text-right">{job.imageCount}</p>
                        <div class="font-mono whitespace-nowrap sm:text-right">
                            <span class="text-brand tabular-nums">{job.counts.verified ?? 0}</span>
                            <span class="text-zinc-600 tabular-nums">/{job.imageCount}</span>
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
                        <p class="font-mono text-xs whitespace-nowrap text-zinc-400 tabular-nums sm:text-right">
                            {elapsedFmt(job.completedAt ? job.completedAt - job.createdAt : null)}
                        </p>
                        <ChevronRight size={14} class="hidden text-zinc-600 sm:inline" />
                    </a>
                {/each}
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} baseHref="/jobs" />
        </div>
    {/if}
</main>
