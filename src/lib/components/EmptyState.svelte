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
        "border-border-strong grid place-items-center rounded-lg border border-dashed px-6 py-16 text-center",
        className
    )}
>
    <div class="flex max-w-md flex-col items-center gap-3">
        {#if icon}
            <div class="text-zinc-600">{@render icon()}</div>
        {/if}
        <h2 class="text-sm font-semibold tracking-tight text-zinc-200">
            {title}
        </h2>
        <p class="text-muted-fg text-xs leading-relaxed text-pretty">
            {description}
        </p>
        {#if action}
            <div class="pt-2">{@render action()}</div>
        {/if}
    </div>
</div>
