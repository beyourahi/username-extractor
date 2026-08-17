<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { tv, type VariantProps } from "tailwind-variants";
	import { cn, twMergeConfig } from "../utils";

	/**
	 * The one editorial CTA language, site-wide. Filled `signal` pill (primary),
	 * hairline outline (secondary), or compact navbar size. Always an
	 * uppercase pill with the ↗ glyph (page-navigation intent). Renders an
	 * `<a>` when `href` is set, otherwise a `<button>`.
	 */
	const cta = tv(
		{
			base: "group relative inline-flex touch-manipulation items-center gap-2.5 overflow-hidden rounded-full font-semibold whitespace-nowrap uppercase transition-[background,color,border-color,box-shadow] duration-editorial ease-standard disabled:pointer-events-none disabled:opacity-50",
			variants: {
				variant: {
					primary: "bg-signal px-7 py-3.5 text-button text-background hover:bg-signal/90",
					secondary:
						"bg-secondary px-[28px] py-[14px] text-button text-secondary-foreground hover:bg-secondary/80",
					compact:
						"h-9 bg-signal px-5 text-button leading-5 text-background shadow-lg hover:bg-signal/90 pointer-coarse:min-h-11"
				},
				// Orthogonal sizing. `md` = the canonical site-wide pill (inherits the
				// variant's padding/font). `sm` = the tighter Settings-page size — smaller
				// padding + caption font; tailwind-merge lets it override the variant.
				size: {
					md: "",
					sm: "px-5 py-2.5 text-button leading-5 pointer-coarse:min-h-11"
				}
			},
			defaultVariants: {
				variant: "primary",
				size: "md"
			}
		},
		{ twMergeConfig }
	);

	type Variant = VariantProps<typeof cta>["variant"];
	type Size = VariantProps<typeof cta>["size"];

	type Props = HTMLButtonAttributes &
		HTMLAnchorAttributes & {
			variant?: Variant;
			size?: Size;
			href?: string;
			arrow?: boolean;
			dot?: boolean;
			class?: string;
			children: Snippet;
		};

	let {
		variant = "primary",
		size = "md",
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
	<a {href} class={cn(cta({ variant, size }), className)} {...rest}>
		{@render inner()}
	</a>
{:else}
	<button {type} class={cn(cta({ variant, size }), className)} {...rest}>
		{@render inner()}
	</button>
{/if}
