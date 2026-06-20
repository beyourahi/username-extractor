<script lang="ts">
    import type { Job, JobItem } from "$lib/server/schema";

    let {
        job,
        items,
        running = false,
        processed
    }: {
        job: Job;
        items: JobItem[];
        running?: boolean;
        processed?: number;
    } = $props();

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

    const processedCount = $derived(processed ?? items.filter((it) => it.status !== "pending").length);
    const pct = $derived(job.imageCount > 0 ? Math.round((processedCount / job.imageCount) * 100) : 0);

    type Tile = {
        label: string;
        value: string | number;
        tone?: "default" | "brand" | "med" | "failed" | "muted";
        mono?: boolean;
        showProgress?: boolean;
    };

    const tiles: Tile[] = $derived([
        {
            label: "Processed",
            value: `${processedCount}/${job.imageCount}`,
            tone: "default",
            mono: true,
            showProgress: true
        },
        { label: "Verified", value: counts.verified, tone: "brand" },
        { label: "Review", value: counts.review, tone: "med" },
        { label: "Failed", value: counts.failed, tone: "failed" },
        { label: "Duplicates", value: counts.duplicate, tone: "muted" },
        { label: "Notion ✓", value: counts.notionAdded, tone: "brand" },
        { label: "Notion ⏳", value: counts.notionPending, tone: "med" }
    ]);

    const toneColor: Record<string, string> = {
        default: "hsl(0 0% 80%)",
        brand: "var(--brand)",
        med: "var(--tier-med-foreground)",
        failed: "var(--tier-failed-foreground)",
        muted: "var(--muted-foreground)"
    };
</script>

<div class="flex flex-col gap-3">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {#each tiles as tile (tile.label)}
            <div class="border-hair bg-card rounded-[var(--radius)] border p-3">
                <p class="text-ink-muted text-micro font-mono tracking-[0.14em] whitespace-nowrap uppercase">
                    {tile.label}
                </p>
                <p
                    class="mt-1.5 text-xl font-bold tabular-nums"
                    style="font-family: {tile.mono ? 'var(--font-mono)' : 'inherit'}; color: {toneColor[
                        tile.tone ?? 'default'
                    ]};{tile.mono ? ' font-size: 19px;' : ''}"
                >
                    {tile.value}
                </p>
                {#if tile.showProgress}
                    <div class="bg-ink-2 mt-2 h-1 w-full overflow-hidden rounded-full">
                        <div
                            class="h-full transition-all duration-500"
                            style="width: {pct}%; background: var(--brand);"
                        ></div>
                    </div>
                {/if}
            </div>
        {/each}
    </div>

    {#if dedup}
        <div
            class="border-hair bg-card text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius)] border px-3 py-2 font-mono text-xs"
        >
            <span class="text-foreground">Dedup ▸</span>
            <span>groups <span class="text-foreground tabular-nums">{dedup.duplicate_groups ?? 0}</span></span>
            <span>found <span class="text-foreground tabular-nums">{dedup.duplicates_found ?? 0}</span></span>
            <span>removed <span class="text-foreground tabular-nums">{dedup.duplicates_removed ?? 0}</span></span>
            {#if dedup.errors}
                <span class="text-tier-failed-fg">errors <span class="tabular-nums">{dedup.errors}</span></span>
            {/if}
        </div>
    {/if}
    {#if running}
        <p class="text-ink-muted text-center text-[11px]">
            Live updates via WebSocket · results stream in as they're processed.
        </p>
    {/if}
</div>
