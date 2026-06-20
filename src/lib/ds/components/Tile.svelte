<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";
	import { cn } from "../utils";
	import { tileBase, tileSelected, tileUnselected } from "./styles";

	/** Selectable surface tile. `selected` swaps the hairline + fill treatment. */
	let {
		selected = false,
		class: className = "",
		type = "button",
		children,
		...rest
	}: HTMLButtonAttributes & { selected?: boolean; class?: string; children: Snippet } = $props();
</script>

<button
	{type}
	aria-pressed={selected}
	class={cn(tileBase, selected ? tileSelected : tileUnselected, className)}
	{...rest}
>
	{@render children()}
</button>
