<script lang="ts">
	import { Combobox as BitsCombobox } from "bits-ui";
	import Check from "@lucide/svelte/icons/check";
	import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
	import type { Snippet } from "svelte";
	import { cn } from "../utils";

	export type ComboboxItem = { value: string; label: string; disabled?: boolean };

	let {
		value = $bindable<string | undefined>(),
		open = $bindable(false),
		items = [],
		name,
		id,
		label,
		placeholder = "Search…",
		noResults = "No results",
		openLabel = "Open suggestions",
		closeLabel = "Close suggestions",
		disabled = false,
		class: className = "",
		contentClass = "",
		"aria-label": ariaLabel,
		"aria-describedby": ariaDescribedby,
		onValueChange,
		children
	}: {
		value?: string;
		open?: boolean;
		items?: ComboboxItem[];
		name?: string;
		id?: string;
		label?: string;
		placeholder?: string;
		noResults?: string;
		openLabel?: string;
		closeLabel?: string;
		disabled?: boolean;
		class?: string;
		contentClass?: string;
		"aria-label"?: string;
		"aria-describedby"?: string;
		onValueChange?: (value: string | undefined) => void;
		children?: Snippet;
	} = $props();

	const uid = $props.id();
	let searchValue = $state("");
	const inputId = $derived(id ?? `combobox-${uid}`);
	const filteredItems = $derived(
		searchValue ? items.filter(item => item.label.toLowerCase().includes(searchValue.toLowerCase())) : items
	);
	const handleInput = (event: Event & { currentTarget: HTMLInputElement }) => {
		searchValue = event.currentTarget.value;
	};
	const handleOpenChange = (next: boolean) => {
		open = next;
		if (!next) searchValue = "";
	};
</script>

<div class={cn("flex min-w-0 flex-col gap-2", className)}>
	{#if label}<label for={inputId} class="text-foreground text-label">{label}</label>{/if}
	<BitsCombobox.Root
		type="single"
		{items}
		bind:value={value as never}
		bind:open
		{...name !== undefined ? { name } : {}}
		{disabled}
		onValueChange={onValueChange as never}
		onOpenChange={handleOpenChange}
	>
		<div class="relative">
			<BitsCombobox.Input
				id={inputId}
				{placeholder}
				aria-label={ariaLabel ?? label}
				aria-describedby={ariaDescribedby}
				oninput={handleInput}
				class="field-control placeholder:text-ink-muted focus:border-ring focus:surface-hover lg:text-label w-full border-2 border-transparent pr-10 text-base leading-6 focus:outline-none lg:leading-5"
			/>
			<BitsCombobox.Trigger
				aria-label={open ? closeLabel : openLabel}
				class="text-ink-muted absolute inset-y-0 end-0 inline-flex min-h-11 w-11 items-center justify-center"
			>
				<ChevronsUpDown size={16} aria-hidden="true" />
			</BitsCombobox.Trigger>
		</div>
		<BitsCombobox.Portal>
			<BitsCombobox.Content
				class={cn(
					"surface-3 rounded-control border-hair z-50 max-h-[min(18rem,var(--bits-combobox-content-available-height))] w-[var(--bits-combobox-anchor-width)] min-w-[var(--bits-combobox-anchor-width)] overflow-hidden border outline-none",
					contentClass
				)}
			>
				<BitsCombobox.Viewport class="max-h-[inherit] overflow-y-auto overscroll-contain p-1">
					{#each filteredItems as item (item.value)}
						<BitsCombobox.Item
							value={item.value}
							label={item.label}
							disabled={item.disabled ?? false}
							class="text-ink-muted data-highlighted:bg-ink-2 data-highlighted:text-foreground data-[state=checked]:text-foreground rounded-choice text-label flex min-h-11 cursor-pointer items-center justify-between gap-2 px-2.5 py-2.5 select-none data-disabled:pointer-events-none data-disabled:opacity-40"
						>
							{#snippet children({ selected })}
								<span class="min-w-0 truncate">{item.label}</span>
								{#if selected}<Check size={16} class="text-signal shrink-0" aria-hidden="true" />{/if}
							{/snippet}
						</BitsCombobox.Item>
					{:else}
						<div class="text-muted-foreground text-label px-2.5 py-3" role="status">{noResults}</div>
					{/each}
				</BitsCombobox.Viewport>
			</BitsCombobox.Content>
		</BitsCombobox.Portal>
	</BitsCombobox.Root>
	{#if children}{@render children()}{/if}
</div>
