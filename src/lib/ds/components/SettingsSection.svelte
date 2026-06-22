<script lang="ts">
	import type { Component, Snippet } from "svelte";
	import { cn } from "../utils";
	import { helperBase } from "./styles";
	import Heading from "./Heading.svelte";

	/**
	 * One canonical Settings section card — a hairline-bordered surface with a
	 * header (optional icon chip + title + muted subtitle) and a padded body.
	 * Shared across every product's Settings page so sections line up identically.
	 * Pass `header` for trailing header content (e.g. a status pill).
	 */
	let {
		title,
		subtitle = undefined,
		icon = undefined,
		header = undefined,
		class: className = "",
		children
	}: {
		title: string;
		subtitle?: string;
		icon?: Component<{ class?: string; size?: number }>;
		header?: Snippet;
		class?: string;
		children: Snippet;
	} = $props();

	const Icon = $derived(icon);
</script>

<section class={cn("border-hair bg-card overflow-hidden rounded-2xl border", className)}>
	<header class="border-hair flex items-center gap-3 border-b px-5 py-4 sm:px-6">
		{#if Icon}
			<span
				class="bg-ink-2 border-hair text-ink-muted flex size-8 shrink-0 items-center justify-center rounded-lg border"
			>
				<Icon class="size-4" />
			</span>
		{/if}
		<div class="flex min-w-0 flex-col gap-1">
			<Heading as="h2" size="title-sm">{title}</Heading>
			{#if subtitle}
				<span class={helperBase}>{subtitle}</span>
			{/if}
		</div>
		{#if header}
			<div class="ml-auto shrink-0">{@render header()}</div>
		{/if}
	</header>
	<div class="flex flex-col gap-6 px-5 py-6 sm:px-6">
		{@render children()}
	</div>
</section>
