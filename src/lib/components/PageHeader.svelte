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

<header class={cn("border-border flex items-end justify-between gap-4 border-b pb-4", className)}>
    <div class="flex flex-col gap-1">
        <h1 class="font-mono text-2xl font-medium tracking-tight text-balance">
            <span class="text-foreground-muted select-none">::</span>
            {title}
        </h1>
        {#if subtitle}
            <p class="text-foreground-muted max-w-prose font-mono text-xs text-pretty">
                {subtitle}
            </p>
        {/if}
        <span class="text-foreground-muted/40 font-mono text-xs leading-none select-none" aria-hidden="true">
            ······································
        </span>
    </div>
    {#if actions}
        <div class="flex items-center gap-2">
            {@render actions()}
        </div>
    {/if}
</header>
