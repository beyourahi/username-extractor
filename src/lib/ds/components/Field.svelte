<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "../utils";
	import { helperBase, labelBase } from "./styles";

	let {
		label,
		htmlFor,
		description,
		error,
		required = false,
		disabled = false,
		class: className = "",
		children
	}: {
		label: string;
		htmlFor: string;
		description?: string;
		error?: string;
		required?: boolean;
		disabled?: boolean;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div class={cn("flex flex-col gap-2", disabled && "opacity-50", className)} data-invalid={error ? "true" : undefined}>
	<label for={htmlFor} class={cn(labelBase, "text-foreground mb-0")}
		>{label}{#if required}<span aria-hidden="true"> *</span>{/if}</label
	>
	{#if description}<p id={`${htmlFor}-description`} class={helperBase}>{description}</p>{/if}
	{@render children()}
	{#if error}<p id={`${htmlFor}-error`} class="text-caption text-destructive" role="alert">{error}</p>{/if}
</div>
