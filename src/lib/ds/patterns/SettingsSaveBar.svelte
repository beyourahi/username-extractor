<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "../utils";

	/**
	 * Sticky save bar for a single page-spanning Settings form: status snippet on
	 * the left (Saving… / Saved / hint), action snippet (the submit Cta/Button) on
	 * the right. For pages with multiple INDEPENDENT forms, use an inline footer
	 * row instead — this bar can only submit the one form it lives inside.
	 */
	let {
		status = undefined,
		action,
		class: className = ""
	}: {
		status?: Snippet;
		action: Snippet;
		class?: string;
	} = $props();
</script>

<div
	class={cn(
		"border-hair bg-card/85 sticky bottom-4 z-30 flex items-center justify-between gap-3 rounded-2xl border p-3 backdrop-blur-md",
		className
	)}
>
	<div class="text-ink-muted text-caption flex min-w-0 items-center gap-2">
		{#if status}{@render status()}{/if}
	</div>
	<div class="flex shrink-0 items-center gap-2">
		{@render action()}
	</div>
</div>
