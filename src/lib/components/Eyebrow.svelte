<script lang="ts">
    import type { Snippet, Component } from "svelte";
    import { cn } from "$lib/ds";

    let {
        icon: IconC,
        children,
        right
    }: {
        icon?: Component<{ size?: number; class?: string }>;
        children: Snippet;
        right?: Snippet;
    } = $props();
</script>

<div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
        {#if IconC}
            <IconC size={13} class="text-ink-muted" />
        {/if}
        <p class={cn("text-micro text-ink-muted font-mono tracking-[0.28em] whitespace-nowrap uppercase")}>
            {@render children()}
        </p>
    </div>
    {#if right}{@render right()}{/if}
</div>
