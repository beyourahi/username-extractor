<script lang="ts">
    import NotionBadge from "./NotionBadge.svelte";
    import TierBadge from "./TierBadge.svelte";
    import Badge from "./Badge.svelte";
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
        onRetry,
        onViewRaw,
        appearAnimated = false
    }: {
        item: ResultRowItem;
        onRetry?: (() => void | Promise<void>) | undefined;
        onViewRaw?: (() => void | Promise<void>) | undefined;
        appearAnimated?: boolean;
    } = $props();

    const statusTone = $derived(
        item.status === "verified"
            ? "success"
            : item.status === "review"
              ? "warning"
              : item.status === "failed"
                ? "danger"
                : item.status === "duplicate"
                  ? "info"
                  : "default"
    );
</script>

<div
    class={cn(
        "border-border/60 pointer-fine:hover:bg-surface/60 grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b px-3 py-2 font-mono text-xs",
        appearAnimated && "scan-in"
    )}
>
    <div class="flex items-center gap-2">
        <Badge tone={statusTone}>{item.status.toUpperCase()}</Badge>
    </div>

    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden">
        <span class="text-foreground-muted cursor-help truncate" title={item.filename}>{item.filename}</span>
        <span class="text-foreground-muted/40 select-none">▸</span>

        {#if item.username}
            <span class="text-foreground font-medium whitespace-nowrap">@{item.username}</span>
        {:else if item.error}
            <span class="text-danger cursor-help text-pretty" title={item.error}>{item.error.slice(0, 80)}</span>
        {:else}
            <span class="text-foreground-muted/60">—</span>
        {/if}

        {#if item.confidence !== null && item.confidence !== undefined}
            <span class="text-foreground-muted whitespace-nowrap">conf={item.confidence.toFixed(0)}</span>
        {/if}

        <TierBadge tier={item.tier ?? null} />

        {#if item.isDuplicate}
            <Badge tone="info">DUP</Badge>
        {:else if item.isNearDuplicate}
            <Badge tone="info"
                >~DUP{item.editDistance !== null && item.editDistance !== undefined
                    ? ` Δ${item.editDistance}`
                    : ""}</Badge
            >
        {/if}

        <span class="text-foreground-muted/60">notion=</span>
        <NotionBadge status={item.notionStatus ?? null} />
    </div>

    <div class="flex items-center gap-1">
        {#if onRetry && item.status === "failed"}
            <button
                type="button"
                class="border-border pointer-fine:hover:bg-surface-elevated pointer-fine:hover:text-foreground cursor-pointer rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-widest whitespace-nowrap uppercase"
                onclick={onRetry}
            >
                retry
            </button>
        {/if}
        {#if onViewRaw}
            <button
                type="button"
                class="border-border pointer-fine:hover:bg-surface-elevated pointer-fine:hover:text-foreground cursor-pointer rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-widest whitespace-nowrap uppercase"
                onclick={onViewRaw}
            >
                raw
            </button>
        {/if}
    </div>
</div>
