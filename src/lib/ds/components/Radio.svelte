<script lang="ts" generics="T extends string | number">
	import type { HTMLInputAttributes } from "svelte/elements";
	import { cn } from "../utils";
	import { helperBase } from "./styles";

	let {
		group = $bindable(),
		value,
		label,
		description,
		class: className = "",
		...rest
	}: Omit<HTMLInputAttributes, "type" | "value"> & {
		group?: T;
		value: T;
		label: string;
		description?: string;
		class?: string;
	} = $props();
</script>

<label class={cn("flex min-h-11 items-start gap-3", className)}>
	<input type="radio" bind:group {value} class="mt-1 size-4 accent-current" {...rest} />
	<span class="text-label text-foreground flex flex-col gap-1"
		><span>{label}</span>{#if description}<span class={helperBase}>{description}</span>{/if}</span
	>
</label>
