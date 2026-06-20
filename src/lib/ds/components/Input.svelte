<script lang="ts">
	import type { HTMLInputAttributes } from "svelte/elements";
	import { cn } from "../utils";
	import { inputBase } from "./styles";

	/** Hairline text input on the dark canonical surface system. */
	let { value = $bindable(""), class: className = "", ...rest }: HTMLInputAttributes & { class?: string } = $props();
</script>

<input bind:value class={cn(inputBase, className)} {...rest} />
