<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "../utils";

	let {
		title,
		variant = "info",
		class: className = "",
		children
	}: { title?: string; variant?: "info" | "success" | "destructive"; class?: string; children: Snippet } = $props();
</script>

<div
	role={variant === "destructive" ? "alert" : "status"}
	class={cn(
		"text-label rounded-lg border p-4",
		variant === "destructive"
			? "border-destructive/60 bg-destructive/10 text-foreground"
			: variant === "success"
				? "border-hair surface-1 text-foreground"
				: "border-hair surface-1 text-foreground",
		className
	)}
>
	{#if title}<p class="font-semibold">{title}</p>{/if}
	<div class={cn(title && "mt-1", "text-pretty opacity-80")}>{@render children()}</div>
</div>
