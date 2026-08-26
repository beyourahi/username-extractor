<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { cn } from "../utils";
	import Button from "./Button.svelte";

	type Props = HTMLButtonAttributes &
		HTMLAnchorAttributes & {
			variant?: "primary" | "secondary" | "compact";
			size?: "md" | "sm";
			href?: string | undefined;
			loading?: boolean;
			arrow?: boolean;
			dot?: boolean;
			class?: string;
			children: Snippet;
		};

	let {
		variant = "primary",
		size = "md",
		href,
		loading = false,
		arrow = true,
		dot = false,
		type = "button",
		class: className = "",
		children,
		...rest
	}: Props = $props();

	const foundationSize = $derived(variant === "compact" ? "sm" : size === "sm" ? "md" : "lg");
	const foundationVariant = $derived(variant === "secondary" ? "secondary" : "primary");
</script>

<Button
	{href}
	{type}
	{loading}
	variant={foundationVariant}
	size={foundationSize}
	class={cn(
		"group duration-editorial ease-standard relative overflow-hidden rounded-full text-center whitespace-nowrap uppercase transition-[background,color,border-color,box-shadow]",
		variant === "primary" && "bg-signal text-background hover:bg-signal/90",
		variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
		variant === "compact" && "bg-signal text-background hover:bg-signal/90 shadow-lg",
		className
	)}
	{...rest}
>
	{#if dot}
		<span
			data-cta-dot
			aria-hidden="true"
			class="bg-background relative z-[2] size-[7px] shrink-0 animate-[ctaPulse_2.8s_var(--ease)_infinite] rounded-full"
		></span>
	{/if}
	<span class="relative z-[2]">{@render children()}</span>
	{#if arrow}
		<span
			aria-hidden="true"
			class="relative z-[2] inline-flex items-center transition-transform duration-[400ms] ease-[var(--ease)] group-hover:translate-x-1 group-hover:-translate-y-1"
		>
			<svg
				data-icon="inline-end"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.25"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M7 17L17 7M7 7H17V17" />
			</svg>
		</span>
	{/if}
</Button>
