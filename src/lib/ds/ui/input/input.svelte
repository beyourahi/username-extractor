<script lang="ts">
	import { cn, type WithElementRef } from "../../utils";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"field-control placeholder:text-ink-muted focus:border-ring focus:surface-hover aria-invalid:border-destructive lg:text-label file:text-foreground w-full min-w-0 border-2 border-transparent text-base leading-6 file:border-0 file:bg-transparent file:font-medium focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 lg:leading-5",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"field-control placeholder:text-ink-muted focus:border-ring focus:surface-hover aria-invalid:border-destructive lg:text-label file:text-foreground w-full min-w-0 border-2 border-transparent text-base leading-6 file:border-0 file:bg-transparent file:font-medium focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 lg:leading-5",
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
