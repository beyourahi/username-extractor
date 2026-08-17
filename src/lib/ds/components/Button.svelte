<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { tv, type VariantProps } from "tailwind-variants";
	import { cn } from "../utils";
	import Spinner from "./Spinner.svelte";

	const button = tv({
		base: "inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg px-4 text-button leading-5 font-semibold transition-[background,color,opacity,transform] duration-fast ease-standard active:scale-95 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
		variants: {
			variant: {
				primary: "bg-primary text-primary-foreground hover:bg-primary/90",
				secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
				ghost: "text-foreground hover:bg-ink-2",
				destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
				icon: "size-11 rounded-full p-0 text-foreground hover:bg-ink-2"
			}
		},
		defaultVariants: { variant: "primary" }
	});

	type Variant = VariantProps<typeof button>["variant"];
	type Props = HTMLButtonAttributes &
		HTMLAnchorAttributes & {
			variant?: Variant;
			href?: string;
			loading?: boolean;
			class?: string;
			children: Snippet;
		};

	let {
		variant = "primary",
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
		aria-busy={loading}
		onclick={handleAnchorClick}
		class={cn(button({ variant }), className)}
		{...rest}
	>
		{#if loading}<Spinner />{/if}{@render children()}
	</a>
{:else}
	<button {type} disabled={inactive} aria-busy={loading} class={cn(button({ variant }), className)} {...rest}>
		{#if loading}<Spinner />{/if}{@render children()}
	</button>
{/if}
