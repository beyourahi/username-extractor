<script lang="ts">
    import type { Snippet } from "svelte";
    import { labelBase, helperBase, cn } from "$lib/ds";

    let {
        label,
        htmlFor,
        children,
        hint,
        error,
        optional = false
    }: {
        label?: string;
        htmlFor?: string;
        children: Snippet;
        hint?: string;
        error?: string;
        optional?: boolean;
    } = $props();
</script>

<div class="flex flex-col gap-1.5">
    {#if label}
        <label for={htmlFor} class={cn(labelBase, "mb-0")}>
            {label}{#if optional}<span class="text-ink-muted/70 ml-1 normal-case">(optional)</span>{/if}
            {#if !optional && error}<span class="text-destructive ml-1">*</span>{/if}
        </label>
    {/if}
    {@render children()}
    {#if hint && !error}
        <p class={helperBase}>{hint}</p>
    {/if}
    {#if error}
        <p class={cn(helperBase, "text-destructive")}>{error}</p>
    {/if}
</div>
