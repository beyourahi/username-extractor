<script lang="ts">
    import type { Snippet } from "svelte";

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
        <label for={htmlFor} class="text-muted-fg block text-xs font-medium">
            {label}{#if optional}<span class="ml-1 text-zinc-600">(optional)</span>{/if}
            {#if !optional && error}<span class="text-destructive ml-1">*</span>{/if}
        </label>
    {/if}
    {@render children()}
    {#if hint && !error}
        <p class="text-muted-fg text-xs text-pretty">{hint}</p>
    {/if}
    {#if error}
        <p class="text-destructive text-xs text-pretty">{error}</p>
    {/if}
</div>
