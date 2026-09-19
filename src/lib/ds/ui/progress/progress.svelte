<script lang="ts">
	import { Progress as ProgressPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "../../utils";

	type ProgressProps = Omit<WithoutChildrenOrChild<ProgressPrimitive.RootProps>, "value" | "max" | "ref"> & {
		value?: number | null | undefined;
		max?: number | undefined;
	};

	let { class: className, max = 100, value, ...restProps }: ProgressProps = $props();
</script>

<ProgressPrimitive.Root
	data-slot="progress"
	class={cn("bg-muted relative flex h-1 w-full items-center overflow-x-hidden rounded-full", className)}
	value={value ?? null}
	{max}
	{...restProps}
>
	<div
		data-slot="progress-indicator"
		class="bg-primary size-full flex-1 transition-all"
		style="transform: translateX(-{100 - (100 * (value ?? 0)) / (max ?? 1)}%)"
	></div>
</ProgressPrimitive.Root>
