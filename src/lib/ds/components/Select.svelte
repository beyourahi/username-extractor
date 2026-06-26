<script lang="ts">
	import { Select } from "bits-ui";
	import Check from "@lucide/svelte/icons/check";
	import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
	import { cn } from "../utils";
	import { inputBase } from "./styles";

	/**
	 * The one canonical select, site-wide. A bits-ui (type single) combobox styled
	 * to match `inputBase` so it sits flush beside text inputs in a form. The panel
	 * is a portalled `bg-card` surface that locks to the trigger width
	 * (`--bits-select-anchor-width`) — so it never overflows on mobile — and caps its
	 * height to the available viewport space, scrolling within. The `signal` accent
	 * marks the selected row's check only; the resting surface stays monochrome.
	 *
	 * Open/close motion is gated behind `motion-safe:`; reduced-motion users get an
	 * instant snap. Form submission rides the hidden input via the `name` prop.
	 */
	type Item = { value: string; label: string; disabled?: boolean };

	let {
		value = $bindable(),
		items,
		name,
		id,
		placeholder = "Select…",
		disabled = false,
		class: className = "",
		contentClass = "",
		onValueChange
	}: {
		value?: string;
		items: Item[];
		name?: string;
		id?: string;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		contentClass?: string;
		onValueChange?: (value: string) => void;
	} = $props();

	const selectedLabel = $derived(items.find((it) => it.value === value)?.label ?? "");

	// exactOptionalPropertyTypes forbids handing bits-ui an explicit `undefined`, so
	// only include name/id when actually provided.
	const rootRest = $derived(name !== undefined ? { name } : {});
	const triggerRest = $derived(id !== undefined ? { id } : {});
</script>

<Select.Root type="single" bind:value={value as never} {disabled} onValueChange={onValueChange as never} {...rootRest}>
	<Select.Trigger
		{...triggerRest}
		aria-label={placeholder}
		class={cn(
			inputBase,
			"data-[placeholder]:text-ink-muted flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
	>
		<span class="min-w-0 truncate">{selectedLabel || placeholder}</span>
		<ChevronsUpDown size={14} class="text-ink-muted shrink-0" aria-hidden="true" />
	</Select.Trigger>
	<Select.Portal>
		<Select.Content
			sideOffset={6}
			class={cn(
				"border-hair bg-card z-50 max-h-[min(18rem,var(--bits-select-content-available-height))] w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] overflow-hidden rounded-[11px] border shadow-xl outline-none",
				"motion-safe:data-[state=open]:animate-[ds-fade-in_150ms_var(--ease)]",
				contentClass
			)}
		>
			<Select.Viewport class="overflow-y-auto overscroll-contain p-1">
				{#each items as item (item.value)}
					<Select.Item
						value={item.value}
						label={item.label}
						disabled={item.disabled ?? false}
						class="text-ink-muted data-highlighted:bg-ink-2 data-highlighted:text-foreground data-[state=checked]:text-foreground ease-[var(--ease)] flex cursor-pointer items-center justify-between gap-2 rounded-[9px] px-2.5 py-2.5 font-mono text-xs transition-colors duration-150 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-40 pointer-coarse:py-3"
					>
						{#snippet children({ selected })}
							<span class="min-w-0 truncate">{item.label}</span>
							{#if selected}
								<Check size={14} class="text-signal shrink-0" aria-hidden="true" />
							{/if}
						{/snippet}
					</Select.Item>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>
