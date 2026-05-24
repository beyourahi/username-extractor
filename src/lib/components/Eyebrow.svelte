<script lang="ts">
    import type { Snippet, Component } from "svelte";

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
            <IconC size={13} class="text-muted-fg" />
        {/if}
        <p class="text-muted-fg text-[11px] font-medium tracking-[0.12em] uppercase">
            {@render children()}
        </p>
    </div>
    {#if right}{@render right()}{/if}
</div>
