<script lang="ts">
    import type { Job, JobItem } from "$lib/server/schema";

    let { job, items }: { job: Job; items: JobItem[] } = $props();

    const counts = $derived.by(() => {
        const c = {
            verified: 0,
            review: 0,
            failed: 0,
            duplicate: 0,
            notionAdded: 0,
            notionInvalid: 0,
            notionPending: 0
        };
        for (const it of items) {
            if (it.status === "verified") c.verified++;
            else if (it.status === "review") c.review++;
            else if (it.status === "failed") c.failed++;
            else if (it.status === "duplicate") c.duplicate++;
        }
        return c;
    });

    const dedup = $derived.by(() => {
        if (!job.dedupSummary) return null;
        try {
            return JSON.parse(job.dedupSummary) as {
                duplicate_groups?: number;
                duplicates_found?: number;
                duplicates_removed?: number;
                errors?: number;
            };
        } catch {
            return null;
        }
    });

    const elapsed = $derived.by(() => {
        if (!job.completedAt) return null;
        const ms = job.completedAt - job.createdAt;
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    });

    interface Tile {
        label: string;
        value: string | number;
        tone?: "default" | "success" | "warning" | "danger" | "info";
    }

    const tiles: Tile[] = $derived([
        { label: "images", value: job.imageCount },
        { label: "verified", value: counts.verified, tone: "success" },
        { label: "review", value: counts.review, tone: "warning" },
        { label: "failed", value: counts.failed, tone: "danger" },
        { label: "duplicate", value: counts.duplicate, tone: "info" },
        { label: "notion.add", value: counts.notionAdded, tone: "success" },
        { label: "notion.inv", value: counts.notionInvalid, tone: "danger" },
        { label: "notion.pen", value: counts.notionPending, tone: "warning" },
        { label: "elapsed", value: elapsed ?? "—" }
    ]);

    const toneClass: Record<string, string> = {
        default: "text-foreground",
        success: "text-accent",
        warning: "text-warning",
        danger: "text-danger",
        info: "text-info"
    };
</script>

<div class="border-border bg-border grid grid-cols-3 gap-px border md:grid-cols-5 lg:grid-cols-9">
    {#each tiles as tile (tile.label)}
        <div class="bg-surface flex flex-col gap-1 px-3 py-3 font-mono">
            <span class="text-foreground-muted text-[10px] tracking-widest whitespace-nowrap uppercase"
                >{tile.label}</span
            >
            <span class={`text-lg font-medium whitespace-nowrap ${toneClass[tile.tone ?? "default"]}`}
                >{tile.value}</span
            >
        </div>
    {/each}
</div>

{#if dedup}
    <div class="border-border bg-surface/40 mt-3 rounded border px-3 py-2 font-mono text-xs">
        <span class="text-foreground-muted whitespace-nowrap">dedup ▸</span>
        <span class="text-foreground ml-2 whitespace-nowrap">groups={dedup.duplicate_groups ?? 0}</span>
        <span class="text-foreground ml-3 whitespace-nowrap">found={dedup.duplicates_found ?? 0}</span>
        <span class="text-foreground ml-3 whitespace-nowrap">removed={dedup.duplicates_removed ?? 0}</span>
        {#if dedup.errors}
            <span class="text-danger ml-3 whitespace-nowrap">errors={dedup.errors}</span>
        {/if}
    </div>
{/if}
