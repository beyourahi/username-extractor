<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "../utils";

	/**
	 * The mono, uppercase, wide-tracked section label that opens nearly every
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

<svelte:element this={as} class={cn("font-mono text-micro tracking-[0.28em] text-ink-muted uppercase", className)}>
	{@render children()}
</svelte:element>
