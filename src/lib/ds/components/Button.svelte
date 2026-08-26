<script module lang="ts">
	import { tv } from "tailwind-variants";
	import { twMergeConfig } from "../utils";

	export const buttonVariants = tv(
		{
			base: "inline-flex touch-manipulation items-center justify-center gap-2 rounded-lg text-button leading-5 font-semibold no-underline transition-[background,color,border-color,opacity,transform] duration-fast ease-standard hover:no-underline focus:no-underline active:scale-95 active:no-underline visited:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_[data-icon]]:size-4 [&_[data-icon]]:shrink-0",
			variants: {
				variant: {
					primary: "bg-primary text-primary-foreground hover:bg-primary/90",
					secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
					outline: "border border-hair bg-transparent text-foreground hover:bg-ink-2",
					ghost: "text-foreground hover:bg-ink-2",
					destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
					icon: "relative size-10 shrink-0 rounded-full p-0 text-foreground hover:bg-ink-2 after:absolute after:content-[''] pointer-coarse:after:size-11",
					nav: "rounded-full bg-card text-foreground hover:bg-ink-2"
				},
				size: {
					sm: "h-9 px-3 pointer-coarse:min-h-11",
					md: "h-10 px-4 pointer-coarse:min-h-11",
					lg: "h-11 px-5"
				}
			},
			defaultVariants: { variant: "primary", size: "md" }
		},
		{ twMergeConfig }
	);
</script>

<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import type { VariantProps } from "tailwind-variants";
	import { cn } from "../utils";
	import Spinner from "./Spinner.svelte";

	type Variant = VariantProps<typeof buttonVariants>["variant"];
	type Size = VariantProps<typeof buttonVariants>["size"];
	type Props = HTMLButtonAttributes &
		HTMLAnchorAttributes & {
			variant?: Variant;
			size?: Size;
			href?: string | undefined;
			loading?: boolean;
			class?: string;
			children: Snippet;
		};

	let {
		variant = "primary",
		size = "md",
		href,
		loading = false,
		disabled = false,
		onclick,
		tabindex,
		type = "button",
		class: className = "",
		children,
		...rest
	}: Props = $props();
	const inactive = $derived(disabled || loading);
	const handleAnchorClick: HTMLAnchorAttributes["onclick"] = event => {
		if (inactive) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		onclick?.(event);
	};
</script>

{#if href !== undefined}
	<a
		href={inactive ? undefined : href}
		tabindex={inactive ? -1 : tabindex}
		aria-disabled={inactive}
		aria-busy={loading || undefined}
		onclick={handleAnchorClick}
		class={cn(buttonVariants({ variant, size }), className)}
		{...rest}
	>
		{#if loading}<Spinner />{/if}{@render children()}
	</a>
{:else}
	<button
		{type}
		disabled={inactive}
		aria-busy={loading || undefined}
		{onclick}
		class={cn(buttonVariants({ variant, size }), className)}
		{...rest}
	>
		{#if loading}<Spinner />{/if}{@render children()}
	</button>
{/if}
