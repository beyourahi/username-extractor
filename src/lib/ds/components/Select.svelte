<script lang="ts">
	import { Select } from "bits-ui";
	import { onMount, type Snippet } from "svelte";
	import Check from "@lucide/svelte/icons/check";
	import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
	import type { HTMLSelectAttributes } from "svelte/elements";
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
		children,
		name,
		id,
		required = false,
		autocomplete,
		placeholder = "Select…",
		disabled = false,
		class: className = "",
		contentClass = "",
		"aria-label": ariaLabel,
		"aria-labelledby": ariaLabelledby,
		"aria-describedby": ariaDescribedby,
		"aria-invalid": ariaInvalid,
		onchange,
		onValueChange
	}: {
		value?: string;
		items?: Item[];
		children?: Snippet;
		name?: string;
		id?: string;
		required?: boolean;
		autocomplete?: HTMLSelectAttributes["autocomplete"];
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		contentClass?: string;
		"aria-label"?: string;
		"aria-labelledby"?: string;
		"aria-describedby"?: string;
		"aria-invalid"?: boolean | "true" | "false";
		onchange?: HTMLSelectAttributes["onchange"];
		onValueChange?: (value: string) => void;
	} = $props();

	let nativeSelect = $state<HTMLSelectElement>();
	let enhanced = $state(false);
	let nativeItems = $state<Item[]>([]);
	const resolvedItems = $derived(items ?? nativeItems);
	const selectedLabel = $derived(resolvedItems.find(it => it.value === value)?.label ?? "");

	// exactOptionalPropertyTypes forbids handing bits-ui an explicit `undefined`, so
	// only include name/id when actually provided.
	const triggerRest = $derived(id !== undefined ? { id } : {});
	const changeValue = (next: string) => {
		value = next;
		onValueChange?.(next);
		nativeSelect?.dispatchEvent(new Event("change", { bubbles: true }));
	};
	onMount(() => {
		if (!children) return;
		if (!nativeSelect) return;
		const element = nativeSelect;
		const sync = () => {
			nativeItems = [...element.options].map(option => ({
				value: option.value,
				label: option.textContent,
				disabled: option.disabled
			}));
		};
		sync();
		enhanced = true;
		const observer = new MutationObserver(sync);
		observer.observe(element, { childList: true, subtree: true, characterData: true, attributes: true });
		return () => observer.disconnect();
	});
</script>

{#if items || enhanced}
	<Select.Root
		type="single"
		bind:value={value as never}
		{disabled}
		items={resolvedItems}
		onValueChange={changeValue as never}
	>
		<Select.Trigger
			{...triggerRest}
			aria-label={ariaLabel}
			aria-labelledby={ariaLabelledby}
			aria-describedby={ariaDescribedby}
			aria-invalid={ariaInvalid}
			class={cn(
				inputBase,
				"data-[placeholder]:text-ink-muted flex items-center justify-center gap-2 text-center disabled:cursor-not-allowed disabled:opacity-50",
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
					{#each resolvedItems as item (item.value)}
						<Select.Item
							value={item.value}
							label={item.label}
							disabled={item.disabled ?? false}
							class="text-ink-muted data-highlighted:bg-ink-2 data-highlighted:text-foreground data-[state=checked]:text-foreground rounded-choice duration-fast ease-standard flex cursor-pointer items-center justify-between gap-2 px-2.5 py-2.5 text-xs transition-colors select-none data-disabled:pointer-events-none data-disabled:opacity-40 pointer-coarse:py-3"
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
{/if}
{#if children}
	<select
		bind:this={nativeSelect}
		{name}
		{id}
		{required}
		{disabled}
		{autocomplete}
		aria-label={ariaLabel}
		aria-labelledby={ariaLabelledby}
		aria-describedby={ariaDescribedby}
		aria-invalid={ariaInvalid}
		{onchange}
		bind:value
		class={cn(inputBase, enhanced && "hidden", className)}
	>
		{@render children()}
	</select>
{:else if name}
	<select
		{name}
		{id}
		{required}
		{disabled}
		{autocomplete}
		aria-label={ariaLabel}
		aria-labelledby={ariaLabelledby}
		aria-describedby={ariaDescribedby}
		aria-invalid={ariaInvalid}
		bind:value
		class="sr-only"
		tabindex={-1}
	>
		{#if placeholder}<option value="" disabled={required}>{placeholder}</option>{/if}
		{#each resolvedItems as item (item.value)}<option value={item.value} disabled={item.disabled}
				>{item.label}</option
			>{/each}
	</select>
{/if}
{#if !children}<noscript>
		<select
			{name}
			{id}
			{required}
			{disabled}
			{autocomplete}
			aria-label={ariaLabel}
			aria-labelledby={ariaLabelledby}
			aria-describedby={ariaDescribedby}
			aria-invalid={ariaInvalid}
			class={cn(inputBase, className)}
		>
			{#if placeholder}<option value="" disabled={required} selected={!value}>{placeholder}</option>{/if}
			{#each resolvedItems as item (item.value)}<option
					value={item.value}
					disabled={item.disabled}
					selected={item.value === value}>{item.label}</option
				>{/each}
		</select>
	</noscript>{/if}
