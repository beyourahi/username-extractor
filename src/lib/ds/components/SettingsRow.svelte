<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "../utils";
	import { labelBase, helperBase } from "./styles";

	/**
	 * One settings field row. Stacks on mobile; on md+ becomes a two-column
	 * label|control grid with a fixed label column so controls align down the
	 * page, and the control FILLS its cell (no fixed widths — that was the
	 * "tiny control far right" bug). Use `stacked` for genuinely full-width
	 * inputs (API tokens, IDs): single column at every width, control below label.
	 * Controls passed as children should be `w-full`.
	 */
	let {
		label,
		hint = undefined,
		htmlFor = undefined,
		stacked = false,
		class: className = "",
		children
	}: {
		label: string;
		hint?: string;
		htmlFor?: string;
		stacked?: boolean;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div
	class={cn(
		"grid gap-x-8 gap-y-2.5",
		stacked ? "grid-cols-1" : "md:grid-cols-[15rem_minmax(0,1fr)] md:items-center",
		className
	)}
>
	<div class="flex min-w-0 flex-col gap-1">
		<label for={htmlFor} class={cn(labelBase, "mb-0")}>{label}</label>
		{#if hint}
			<span class={helperBase}>{hint}</span>
		{/if}
	</div>
	<div class="w-full min-w-0">
		{@render children()}
	</div>
</div>
