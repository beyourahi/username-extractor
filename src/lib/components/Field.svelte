<script lang="ts">
    import type { Snippet } from "svelte";
    import { labelBase } from "$lib/ds";

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

<div class="space-y-1.5">
    {#if label}
        <label for={htmlFor} class={labelBase}>
            {label}{#if optional}<span class="text-ink-muted/70 ml-1 normal-case">(optional)</span>{/if}
            {#if !optional && error}<span class="text-destructive ml-1">*</span>{/if}
        </label>
    {/if}
    {@render children()}
    {#if hint && !error}
        <p class="text-ink-muted text-xs text-pretty">{hint}</p>
    {/if}
    {#if error}
        <p class="text-destructive text-xs text-pretty">{error}</p>
    {/if}
</div>
