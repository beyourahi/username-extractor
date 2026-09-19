<script lang="ts">
	import Check from "@lucide/svelte/icons/check";
	import Minus from "@lucide/svelte/icons/minus";
	import type { HTMLInputAttributes } from "svelte/elements";
	import { cn } from "../utils";
	import { helperBase } from "../styles/recipes";

	/**
	 * The canonical checkbox: one native control with a branded indicator, native
	 * form submission, and a 44px target for pointer and keyboard interaction.
	 */
	const uid = $props.id();

	let {
		checked = $bindable(false),
		indeterminate = $bindable(false),
		label,
		description,
		class: className = "",
		id,
		value,
		"aria-label": ariaLabel,
		"aria-labelledby": ariaLabelledby,
		"aria-describedby": ariaDescribedby,
		"aria-invalid": ariaInvalid,
		required = false,
		disabled = false,
		readonly = false,
		onclick,
		...rest
	}: Omit<HTMLInputAttributes, "type" | "checked" | "value" | "required" | "disabled" | "readonly"> & {
		checked?: boolean;
		indeterminate?: boolean;
		required?: boolean | null;
		disabled?: boolean | null;
		readonly?: boolean | null;
		label?: string;
		description?: string;
		class?: string;
		value?: string | number | boolean;
	} = $props();

	const checkboxId = $derived(id ?? `checkbox-${uid}`);
	const descriptionId = $derived(description ? `${checkboxId}-description` : undefined);
	const describedBy = $derived([ariaDescribedby, descriptionId].filter(Boolean).join(" ") || undefined);
	const invalid = $derived(ariaInvalid === true || ariaInvalid === "true");
	const inputClass =
		"peer absolute inset-0 z-10 size-11 cursor-pointer appearance-none rounded-control opacity-0 disabled:cursor-not-allowed";
	const indicatorClass =
		"pointer-events-none flex size-5 items-center justify-center rounded-[5px] border-2 motion-safe:transition-colors motion-safe:duration-fast motion-safe:ease-standard peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[14px] peer-focus-visible:outline-ring peer-disabled:opacity-50 motion-safe:peer-active:scale-95 peer-active:opacity-80";
	const indicatorClassFor = (isChecked: boolean, isIndeterminate: boolean) =>
		cn(
			indicatorClass,
			invalid
				? "border-destructive bg-destructive/10 text-destructive"
				: isChecked || isIndeterminate
					? "border-signal bg-signal text-background"
					: "border-input bg-transparent text-transparent peer-hover:border-ring"
		);
	const handleClick: NonNullable<HTMLInputAttributes["onclick"]> = event => {
		if (readonly) event.preventDefault();
		onclick?.(event);
	};
</script>

{#snippet checkboxInput()}
	<span class={cn("relative flex size-11 shrink-0 items-center justify-center", label ? "" : className)}>
		<input
			{...rest}
			bind:checked
			bind:indeterminate
			id={checkboxId}
			type="checkbox"
			value={value == null ? undefined : String(value)}
			required={required ?? false}
			disabled={disabled ?? false}
			aria-label={ariaLabel ?? label}
			aria-labelledby={ariaLabelledby}
			aria-describedby={describedBy}
			aria-invalid={ariaInvalid}
			aria-checked={indeterminate ? "mixed" : checked}
			aria-required={required ? "true" : undefined}
			aria-readonly={readonly ? "true" : undefined}
			data-state={indeterminate ? "indeterminate" : checked ? "checked" : "unchecked"}
			data-readonly={readonly ? "" : undefined}
			onclick={handleClick}
			class={inputClass}
		/>
		<span class={indicatorClassFor(checked, indeterminate)} aria-hidden="true">
			{#if indeterminate}<Minus size={13} strokeWidth={2.5} />{:else if checked}<Check
					size={13}
					strokeWidth={2.5}
				/>{/if}
		</span>
	</span>
{/snippet}

{#if label}
	<div class={cn("flex min-h-11 items-start", className)}>
		{@render checkboxInput()}
		<label
			for={checkboxId}
			class="text-label text-foreground flex min-h-11 flex-1 cursor-pointer flex-col gap-1 pl-3"
		>
			<span>{label}</span>
			{#if description}<span id={descriptionId} class={helperBase}>{description}</span>{/if}
		</label>
	</div>
{:else}{@render checkboxInput()}{/if}
