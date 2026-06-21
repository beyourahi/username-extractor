<script lang="ts">
    import type { Snippet } from "svelte";
    import { Heading } from "$lib/ds";
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
        <Heading as="h1" size="title-sm" class="text-balance">
            {title}
        </Heading>
        {#if subtitle}
            <p class="text-ink-muted mt-1 max-w-prose text-sm text-pretty">
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
