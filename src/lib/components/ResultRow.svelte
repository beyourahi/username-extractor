<script lang="ts">
    import { RefreshCw, FileText, Code2 } from "@lucide/svelte";
    import NotionBadge from "./NotionBadge.svelte";
    import TierBadge from "./TierBadge.svelte";
    import Button from "./Button.svelte";
    import { cn } from "$lib/utils/cn";
    import type { NotionStatus, ItemStatus, Tier } from "$lib/types/messages";

    interface ResultRowItem {
        filename: string;
        username: string | null;
        confidence: number | null;
        tier: Tier;
        status: ItemStatus;
        notionStatus?: NotionStatus;
        notionPageId?: string | null;
        isDuplicate?: boolean;
        isNearDuplicate?: boolean;
        similarTo?: string | null;
        editDistance?: number | null;
        error?: string | null;
    }

    let {
        item,
        index,
        onRetry,
        onViewRaw,
        appearAnimated = false
    }: {
        item: ResultRowItem;
        index?: number;
        onRetry?: (() => void | Promise<void>) | undefined;
        onViewRaw?: (() => void | Promise<void>) | undefined;
        appearAnimated?: boolean;
    } = $props();

    // Border accent color reflects tier; falls back to status semantics.
    const accentColor = $derived(
        item.tier === "HIGH"
            ? "var(--brand)"
            : item.tier === "MED"
              ? "var(--tier-med)"
              : item.status === "failed"
                ? "var(--tier-failed)"
                : item.status === "review"
                  ? "var(--tier-review)"
                  : "transparent"
    );

    const synthBadge = $derived(
        item.tier ? null : item.status === "review" ? "REVIEW" : item.status === "failed" ? "FAILED" : null
    );
</script>

<div
    class={cn(
        "status-transition sleek group border-hair bg-card hover:bg-ink-2/40 relative flex items-center gap-3 rounded-lg border p-3",
        appearAnimated && "slide-in"
    )}
>
    {#if accentColor !== "transparent"}
        <span class="absolute top-2 bottom-2 left-0 w-[3px] rounded-full" style="background: {accentColor};"></span>
    {/if}

    {#if index !== undefined}
        <span class="text-ink-muted text-micro w-6 shrink-0 font-mono tabular-nums">
            {String(index + 1).padStart(2, "0")}
        </span>
    {/if}

    <div
        class="border-hair bg-ink-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-md border"
        title={item.filename}
        aria-hidden="true"
    >
        <FileText size={16} class="text-ink-muted" />
    </div>

    <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
            {#if item.username}
                <a
                    href={`https://instagram.com/${item.username}`}
                    target="_blank"
                    rel="noreferrer"
                    class="text-foreground truncate font-mono text-sm font-semibold hover:underline"
                >
                    @{item.username}
                </a>
            {:else}
                <p class="text-ink-muted text-sm italic">— no username —</p>
            {/if}

            {#if item.tier}
                <TierBadge tier={item.tier} size="sm" />
            {:else if synthBadge}
                <TierBadge tier={synthBadge} size="sm" />
            {/if}

            {#if item.isDuplicate}
                <span
                    class="border-hair text-ink-muted text-micro rounded-full border px-1.5 py-px font-mono uppercase"
                >
                    duplicate
                </span>
            {:else if item.isNearDuplicate}
                <span
                    class="border-tier-med-border text-tier-med-fg text-micro rounded-full border px-1.5 py-px font-mono uppercase"
                >
                    near · ed{item.editDistance ?? "?"}
                </span>
            {/if}
        </div>
        <p class="text-ink-muted text-caption mt-0.5 truncate">
            <span class="font-mono">{item.filename}</span>
            {#if item.confidence !== null && item.confidence !== undefined && item.confidence > 0}
                · <span class="font-mono tabular-nums">{item.confidence.toFixed(0)}%</span> confidence
            {/if}
            {#if item.isNearDuplicate && item.similarTo}
                · matches <span class="font-mono">@{item.similarTo}</span>
            {/if}
            {#if item.error}
                · <span class="text-tier-failed-fg" title={item.error}>{item.error.slice(0, 80)}</span>
            {/if}
        </p>
    </div>

    <div class="ml-auto flex shrink-0 items-center gap-2">
        {#if item.notionStatus}
            <NotionBadge status={item.notionStatus} size="sm" />
        {/if}
        {#if onRetry}
            <Button variant="ghost" size="sm" onclick={onRetry} aria-label="Retry">
                <RefreshCw size={12} /> Retry
            </Button>
        {/if}
        {#if onViewRaw}
            <Button variant="ghost" size="sm" onclick={onViewRaw} aria-label="View raw response">
                <Code2 size={12} /> Raw
            </Button>
        {/if}
    </div>
</div>
