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
        "border-hair bg-card flex flex-col gap-3 rounded-[var(--radius)] border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className
    )}
>
    <div class="flex flex-wrap items-center gap-2">
        {#if filters}{@render filters()}{/if}
    </div>
    <div class="flex flex-wrap items-center gap-2">
        {#if actions}{@render actions()}{/if}
    </div>
</div>
