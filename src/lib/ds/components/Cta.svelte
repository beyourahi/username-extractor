<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { tv, type VariantProps } from "tailwind-variants";
	import { cn } from "../utils";

	/**
	 * The one editorial CTA language, site-wide. Filled `signal` pill (primary),
	 * hairline outline (secondary), or compact navbar size. Always a mono
	 * uppercase pill with the ↗ glyph (page-navigation intent). Renders an
	 * `<a>` when `href` is set, otherwise a `<button>`.
	 */
	const cta = tv({
		base: "group relative inline-flex items-center gap-[10px] overflow-hidden rounded-full font-mono font-medium whitespace-nowrap uppercase outline-none transition-[background,color,border-color,box-shadow] duration-[450ms] ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-signal disabled:pointer-events-none disabled:opacity-50",
		variants: {
			variant: {
				primary: "bg-signal px-[28px] py-[14px] text-[13px] text-background hover:bg-signal/90",
				secondary:
					"border border-hair bg-transparent px-[28px] py-[14px] text-[13px] text-foreground hover:border-signal hover:bg-ink-2",
				compact: "h-9 bg-signal px-5 text-[12px] text-background shadow-lg hover:bg-signal/90"
			}
		},
		defaultVariants: {
			variant: "primary"
		}
	});

	type Variant = VariantProps<typeof cta>["variant"];

	type Props = HTMLButtonAttributes &
		HTMLAnchorAttributes & {
			variant?: Variant;
			href?: string;
			arrow?: boolean;
			dot?: boolean;
			class?: string;
			children: Snippet;
		};

	let {
		variant = "primary",
		href,
		arrow = true,
		dot = false,
		type = "button",
		class: className = "",
		children,
		...rest
	}: Props = $props();
</script>

{#snippet inner()}
	{#if dot}
		<span
			data-cta-dot
			aria-hidden="true"
			class="relative z-[2] size-[7px] shrink-0 animate-[ctaPulse_2.8s_var(--ease)_infinite] rounded-full bg-background"
		></span>
	{/if}
	<span class="relative z-[2]">{@render children()}</span>
	{#if arrow}
		<span
			aria-hidden="true"
			class="relative z-[2] inline-flex items-center transition-transform duration-[400ms] ease-[var(--ease)] group-hover:translate-x-1 group-hover:-translate-y-1"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.25"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				class="size-[1em]"
			>
				<path d="M7 17L17 7M7 7H17V17" />
			</svg>
		</span>
	{/if}
{/snippet}

{#if href}
	<a {href} class={cn(cta({ variant }), className)} {...rest}>
		{@render inner()}
	</a>
{:else}
	<button {type} class={cn(cta({ variant }), className)} {...rest}>
		{@render inner()}
	</button>
{/if}
