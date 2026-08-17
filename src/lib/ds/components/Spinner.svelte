<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn } from "../utils";

	let { class: className = "", ...rest }: HTMLAttributes<HTMLSpanElement> & { class?: string } = $props();
</script>

<span
	role="status"
	aria-label="Loading"
	class={cn(
		"inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none",
		className
	)}
	{...rest}
></span>
