<script lang="ts">
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils/cn";

    let {
        filters,
        actions,
        class: className = ""
    }: {
        filters?: Snippet;
        actions?: Snippet;
        class?: string;
    } = $props();
</script>

<div
    class={cn(
        "border-border bg-surface/40 flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2 font-mono text-xs",
        className
    )}
>
    <div class="flex flex-wrap items-center gap-2">
        {#if filters}{@render filters()}{/if}
    </div>
    <div class="flex items-center gap-2">
        {#if actions}{@render actions()}{/if}
    </div>
</div>
