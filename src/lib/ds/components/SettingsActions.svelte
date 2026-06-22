<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "../utils";

	/**
	 * The one in-section Settings save-footer language. Pure layout — it owns the
	 * rule: the save button sits BESIDE the status/content on desktop and goes
	 * FULL-WIDTH underneath on mobile. Replaces the old sticky `SettingsSaveBar`
	 * pattern — the save now lives INSIDE its own section (bottom-row), not floating
	 * beneath the page. `children` is the button(s) (typically a `Cta`); the cell
	 * forces them full-width + centered on mobile with NO consumer width classes.
	 * Pass `status` for the optional left-side hint (Saving… / Saved / unsaved note).
	 */
	let {
		status = undefined,
		class: className = "",
		children
	}: {
		status?: Snippet;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div
	class={cn(
		"border-hair flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center",
		status ? "sm:justify-between" : "sm:justify-end",
		className
	)}
>
	{#if status}
		<div class="text-ink-muted text-caption flex min-w-0 items-center gap-2 text-pretty">
			{@render status()}
		</div>
	{/if}
	<div
		class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row [&>*]:w-full [&>*]:justify-center sm:[&>*]:w-auto"
	>
		{@render children()}
	</div>
</div>
