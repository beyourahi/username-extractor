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
        "border-hair bg-card/40 grid w-full place-items-center rounded-[var(--radius)] border border-dashed px-6 py-16 text-center",
        className
    )}
>
    <div class="flex max-w-md flex-col items-center gap-3">
        {#if icon}
            <div class="bg-ink-2 text-ink-muted grid size-11 place-items-center rounded-lg">
                {@render icon()}
            </div>
        {/if}
        <h2 class="text-foreground text-sm font-semibold tracking-tight">
            {title}
        </h2>
        <p class="text-ink-muted text-xs leading-relaxed text-pretty">
            {description}
        </p>
        {#if action}
            <div class="pt-2">{@render action()}</div>
        {/if}
    </div>
</div>
