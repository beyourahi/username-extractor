<script lang="ts">
	import { Combobox as BitsCombobox } from "bits-ui";
	import Check from "@lucide/svelte/icons/check";
	import ChevronsUpDown from "@lucide/svelte/icons/chevrons-up-down";
	import type { Snippet } from "svelte";
	import { cn } from "../utils";
	import type { ComboboxItem } from "./Combobox.svelte";

	let {
		value = $bindable<string[]>([]),
		open = $bindable(false),
		items = [],
		name,
		id,
		label,
		placeholder = "Select options…",
		filterPlaceholder = "Filter…",
		noResults = "No results",
		disabled = false,
		class: className = "",
		contentClass = "",
		"aria-label": ariaLabel,
		"aria-describedby": ariaDescribedby,
		onValueChange,
		children
	}: {
		value?: string[];
		open?: boolean;
		items?: ComboboxItem[];
		name?: string;
		id?: string;
		label?: string;
		placeholder?: string;
		filterPlaceholder?: string;
		noResults?: string;
		disabled?: boolean;
		class?: string;
		contentClass?: string;
		"aria-label"?: string;
		"aria-describedby"?: string;
		onValueChange?: (value: string[]) => void;
		children?: Snippet;
	} = $props();

	const uid = $props.id();
	let searchValue = $state("");
	const triggerId = $derived(id ?? `multi-select-${uid}`);
	const filteredItems = $derived(
		searchValue ? items.filter(item => item.label.toLowerCase().includes(searchValue.toLowerCase())) : items
	);
	const selectedLabels = $derived(
		items
			.filter(item => value.includes(item.value))
			.map(item => item.label)
			.join(", ")
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
	{#if label}<label for={triggerId} class="text-foreground text-label">{label}</label>{/if}
	<BitsCombobox.Root
		type="multiple"
		{items}
		bind:value={value as never}
		bind:open
		{...name !== undefined ? { name } : {}}
		{disabled}
		onValueChange={onValueChange as never}
		onOpenChange={handleOpenChange}
	>
		<BitsCombobox.Trigger
			id={triggerId}
			aria-label={ariaLabel ?? label}
			aria-describedby={ariaDescribedby}
			class="field-control focus:border-ring focus:surface-hover lg:text-label flex w-full min-w-0 items-center justify-between gap-2 border-2 border-transparent text-start text-base leading-6 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 lg:leading-5"
		>
			<span class={cn("min-w-0 truncate", !selectedLabels && "text-ink-muted")}
				>{selectedLabels || placeholder}</span
			>
			<ChevronsUpDown size={16} class="text-ink-muted shrink-0" aria-hidden="true" />
		</BitsCombobox.Trigger>
		<BitsCombobox.Portal>
			<BitsCombobox.Content
				class={cn(
					"surface-3 rounded-control border-hair z-50 max-h-[min(18rem,var(--bits-combobox-content-available-height))] w-[var(--bits-combobox-anchor-width)] min-w-[var(--bits-combobox-anchor-width)] overflow-hidden border outline-none",
					contentClass
				)}
			>
				<BitsCombobox.Input
					placeholder={filterPlaceholder}
					oninput={handleInput}
					class="field-control border-hair text-label focus:border-ring h-10 min-h-10 w-full border-0 border-b px-3 focus:outline-none"
				/>
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
