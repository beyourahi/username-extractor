<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from "../../utils";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		"field-control placeholder:text-ink-muted focus:border-ring focus:surface-hover aria-invalid:border-destructive lg:text-label min-h-28 w-full min-w-0 resize-y border-2 border-transparent text-base leading-6 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 lg:leading-5",
		className
	)}
	bind:value
	{...restProps}></textarea>
