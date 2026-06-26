<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
	import { tv, type VariantProps } from "tailwind-variants";
	import { cn } from "../utils";

	/**
	 * The one circular icon-button language for the signed-in nav trio (Settings +
	 * Sign out). A `size-10` hairline circle that provides the `group` and motion;
	 * the CONSUMER supplies the icon and its color/transition (e.g.
	 * `class="text-ink-muted pointer-fine:group-hover:text-foreground size-[1.125rem] transition-colors"`).
	 * `tone="destructive"` shifts the hover affordance to the destructive ramp.
	 * Renders an `<a>` when `href` is set, otherwise a `<button>`. Spreads `...rest`
	 * onto the element, so a shadcn `Tooltip.Trigger` child `{...props}`, plus
	 * `onclick`/`disabled`/`aria-label`, all pass through. `children` renders the
	 * icon (and, for username-extractor, an optional absolute tooltip `<span>` sibling).
	 */
	const iconButton = tv({
		base: "sleek group relative flex size-10 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full backdrop-blur-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal active:scale-95 disabled:pointer-events-none disabled:opacity-60",
		variants: {
			tone: {
				default: "bg-card pointer-fine:hover:bg-ink-2",
				destructive:
					"bg-card pointer-fine:hover:bg-destructive/10 pointer-fine:hover:text-destructive"
			}
		},
		defaultVariants: {
			tone: "default"
		}
	});

	type Tone = VariantProps<typeof iconButton>["tone"];

	type Props = HTMLButtonAttributes &
		HTMLAnchorAttributes & {
			tone?: Tone;
			href?: string;
			class?: string;
			children: Snippet;
		};

	let {
		tone = "default",
		href,
		type = "button",
		class: className = "",
		children,
		...rest
	}: Props = $props();
</script>

{#if href}
	<a {href} class={cn(iconButton({ tone }), className)} {...rest}>
		{@render children()}
	</a>
{:else}
	<button {type} class={cn(iconButton({ tone }), className)} {...rest}>
		{@render children()}
	</button>
{/if}
