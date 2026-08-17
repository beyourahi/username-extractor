<script lang="ts">
	import type { HTMLTextareaAttributes } from "svelte/elements";
	import { cn } from "../utils";
	import { inputBase } from "./styles";

	let {
		value = $bindable(""),
		class: className = "",
		...rest
	}: HTMLTextareaAttributes & { class?: string } = $props();
</script>

<textarea bind:value class={cn(inputBase, "min-h-28 resize-y", className)} {...rest}></textarea>
