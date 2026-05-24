<script lang="ts">
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils/cn";

    let {
        title,
        subtitle,
        actions,
        class: className = ""
    }: {
        title: string;
        subtitle?: string;
        actions?: Snippet;
        class?: string;
    } = $props();
</script>

<header class={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
    <div>
        <h1 class="text-2xl font-black tracking-tight sm:text-3xl" style="letter-spacing: -0.02em;">
            {title}
        </h1>
        {#if subtitle}
            <p class="text-muted-fg mt-1 max-w-prose text-xs sm:text-sm">
                {subtitle}
            </p>
        {/if}
    </div>
    {#if actions}
        <div class="flex flex-wrap items-center gap-2">
            {@render actions()}
        </div>
    {/if}
</header>
