<script lang="ts">
    import PageHeader from "$lib/components/PageHeader.svelte";
    import EmptyState from "$lib/components/EmptyState.svelte";
    import Badge from "$lib/components/Badge.svelte";
    import Pagination from "$lib/components/Pagination.svelte";
    import { Search } from "@lucide/svelte";

    let { data } = $props();

    function fmtDate(ms: number): string {
        const d = new Date(ms);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
    <PageHeader title="jobs" subtitle="extraction history · most recent first" />

    {#if data.jobs.length === 0}
        <EmptyState title="no jobs yet" description="upload screenshots from the upload tab to start a job.">
            {#snippet icon()}
                <Search class="h-8 w-8" />
            {/snippet}
            {#snippet action()}
                <a
                    href="/"
                    class="border-accent bg-accent/10 text-accent cursor-pointer rounded-sm border px-3 py-1 font-mono text-[10px] tracking-widest whitespace-nowrap uppercase"
                >
                    new job
                </a>
            {/snippet}
        </EmptyState>
    {:else}
        <div class="border-border bg-surface/40 overflow-hidden rounded border font-mono text-xs">
            <table class="w-full">
                <thead class="text-foreground-muted border-border border-b text-left tracking-widest uppercase">
                    <tr>
                        <th class="px-3 py-2">created</th>
                        <th class="px-3 py-2">status</th>
                        <th class="px-3 py-2 text-right">images</th>
                        <th class="px-3 py-2 text-right">verified</th>
                        <th class="px-3 py-2 text-right">review</th>
                        <th class="px-3 py-2 text-right">failed</th>
                        <th class="px-3 py-2">model</th>
                        <th class="px-3 py-2"></th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.jobs as job (job.id)}
                        <tr class="border-border/40 pointer-fine:hover:bg-surface border-b last:border-b-0">
                            <td class="text-foreground-muted px-3 py-2 whitespace-nowrap">{fmtDate(job.createdAt)}</td>
                            <td class="px-3 py-2">
                                <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                            </td>
                            <td class="text-foreground px-3 py-2 text-right">{job.imageCount}</td>
                            <td class="text-accent px-3 py-2 text-right">{job.counts.verified ?? 0}</td>
                            <td class="text-warning px-3 py-2 text-right">{job.counts.review ?? 0}</td>
                            <td class="text-danger px-3 py-2 text-right">{job.counts.failed ?? 0}</td>
                            <td class="text-foreground-muted truncate px-3 py-2">{job.vlmModel}</td>
                            <td class="px-3 py-2 text-right">
                                <a
                                    href={`/jobs/${job.id}`}
                                    class="border-border pointer-fine:hover:bg-surface-elevated cursor-pointer rounded-sm border px-2 py-0.5 tracking-widest whitespace-nowrap uppercase"
                                >
                                    open
                                </a>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} baseHref="/jobs" />
        </div>
    {/if}
</div>
