<script lang="ts">
	import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { cn } from "../utils";
	import Button from "../ui/button/button.svelte";

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
			class="bg-background relative z-[2] size-[7px] shrink-0 animate-[ctaPulse_var(--motion-cta-pulse)_var(--ease)_infinite] rounded-full"
		></span>
	{/if}
	<span class="relative z-[2]">{@render children()}</span>
	{#if arrow}
		<span
			aria-hidden="true"
			class="duration-editorial ease-standard relative z-[2] inline-flex items-center transition-transform group-hover:translate-x-1 group-hover:-translate-y-1"
		>
			<ArrowUpRight data-icon="inline-end" strokeWidth={2.25} aria-hidden="true" />
		</span>
	{/if}
</Button>
