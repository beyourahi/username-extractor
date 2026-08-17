<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "../utils";

	/**
	 * The uppercase, wide-tracked section label that opens nearly every
	 * Dropout section. Defaults to a `<span>`; pass `as` for semantics.
	 */
	let {
		children,
		as = "span",
		class: className = ""
	}: {
		children: Snippet;
		as?: string;
		class?: string;
	} = $props();
</script>

<svelte:element this={as} class={cn("text-micro text-ink-muted tracking-[0.28em] uppercase", className)}>
	{@render children()}
</svelte:element>
