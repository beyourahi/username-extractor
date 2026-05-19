<script lang="ts">
    import type { Snippet } from "svelte";
    import { cn } from "$lib/utils/cn";

    let {
        icon,
        title,
        description,
        action,
        class: className = ""
    }: {
        icon?: Snippet;
        title: string;
        description: string;
        action?: Snippet;
        class?: string;
    } = $props();
</script>

<div
    class={cn(
        "border-border bg-surface/40 flex flex-col items-center justify-center gap-3 rounded border border-dashed px-6 py-16 text-center",
        className
    )}
>
    {#if icon}
        <div class="text-foreground-muted">{@render icon()}</div>
    {/if}
    <h2 class="font-mono text-sm font-medium tracking-widest uppercase">
        {title}
    </h2>
    <p class="text-foreground-muted max-w-md font-mono text-xs leading-relaxed">
        {description}
    </p>
    {#if action}
        <div class="pt-2">{@render action()}</div>
    {/if}
</div>
