<script lang="ts">
	import type { HTMLInputAttributes } from "svelte/elements";
	import { cn } from "../utils";
	import { helperBase } from "./styles";

	let {
		checked = $bindable(false),
		label,
		description,
		class: className = "",
		...rest
	}: Omit<HTMLInputAttributes, "type"> & {
		checked?: boolean;
		label: string;
		description?: string;
		class?: string;
	} = $props();
</script>

<label class={cn("flex min-h-11 items-start gap-3", className)}>
	<input type="checkbox" bind:checked class="mt-1 size-4 rounded-sm accent-current" {...rest} />
	<span class="text-label text-foreground flex flex-col gap-1"
		><span>{label}</span>{#if description}<span class={helperBase}>{description}</span>{/if}</span
	>
</label>
