<script lang="ts">
    import { Select } from "bits-ui";
    import { Check, ChevronsUpDown } from "@lucide/svelte";
    import { cn, inputBase } from "$lib/ds";

    type Item = { value: string; label: string; description?: string; disabled?: boolean };

    type Props = {
        value?: string;
        items: Item[];
        name?: string;
        placeholder?: string;
        disabled?: boolean;
        id?: string;
        class?: string;
        onValueChange?: (value: string) => void;
    };

    let {
        value = $bindable(),
        items,
        name,
        placeholder = "Select…",
        disabled = false,
        id,
        class: className,
        onValueChange
    }: Props = $props();

    const selectedLabel = $derived(items.find((it) => it.value === value)?.label ?? "");

    // exactOptionalPropertyTypes forbids passing an explicit `undefined` to optional
    // props, so only include name/id when actually provided.
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
        <span class="truncate">{selectedLabel || placeholder}</span>
        <ChevronsUpDown size={14} class="text-ink-muted shrink-0" aria-hidden="true" />
    </Select.Trigger>
    <Select.Portal>
        <Select.Content
            sideOffset={6}
            class="border-hair bg-card z-50 max-h-64 min-w-[var(--bits-select-anchor-width)] overflow-hidden rounded-[11px] border shadow-lg outline-none motion-safe:data-[state=open]:animate-[ds-fade-in_150ms_var(--ease)]"
        >
            <Select.Viewport class="overflow-y-auto p-1">
                {#each items as item (item.value)}
                    <Select.Item
                        value={item.value}
                        label={item.label}
                        disabled={item.disabled ?? false}
                        class="text-foreground hover:bg-ink-2 data-[highlighted]:bg-ink-2 flex cursor-pointer items-start gap-2 rounded-[8px] px-2.5 py-2 text-xs transition-colors duration-150 ease-[var(--ease)] outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
                    >
                        {#snippet children({ selected })}
                            <span class="flex w-4 shrink-0 items-center justify-center pt-0.5">
                                {#if selected}
                                    <Check size={13} class="text-brand" aria-hidden="true" />
                                {/if}
                            </span>
                            <span class="min-w-0 flex-1">
                                <span class="block truncate font-mono">{item.label}</span>
                                {#if item.description}
                                    <span class="text-ink-muted mt-0.5 block text-[11px] text-pretty"
                                        >{item.description}</span
                                    >
                                {/if}
                            </span>
                        {/snippet}
                    </Select.Item>
                {/each}
            </Select.Viewport>
        </Select.Content>
    </Select.Portal>
</Select.Root>
