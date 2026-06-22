<!--
    Invisible top navbar: transparent (no background, border, blur, or shadow) and in normal document
    flow, so the main section starts cleanly BELOW it instead of under a floating overlay. Holds the
    profile/settings/logout trio (or the guest sign-in pill) at the right content edge. No AI copilot
    rail in this tool, so there's no rail-offset logic.
-->
<script lang="ts">
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();
</script>

<header class="flex w-full items-center justify-end px-[var(--content-x)] pt-4 sm:pt-6">
    {@render children()}
</header>
