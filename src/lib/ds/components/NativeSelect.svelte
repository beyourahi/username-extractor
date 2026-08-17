<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLSelectAttributes } from "svelte/elements";
	import { cn } from "../utils";
	import { inputBase } from "./styles";

	let {
		value = $bindable(),
		class: className = "",
		children,
		...rest
	}: HTMLSelectAttributes & { class?: string; children: Snippet } = $props();
</script>

<select bind:value class={cn(inputBase, "appearance-auto", className)} {...rest}>{@render children()}</select>
