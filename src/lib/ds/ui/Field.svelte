<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "../utils";
	import { helperBase, labelBase } from "../styles/recipes";

	type ControlProps = {
		id: string;
		"aria-describedby"?: string | undefined;
		"aria-invalid"?: "true" | undefined;
		"aria-required"?: "true" | undefined;
		required?: boolean | undefined;
		disabled?: boolean | undefined;
	};

	const uid = $props.id();
	let {
		label,
		id,
		htmlFor = id,
		description,
		error,
		required = false,
		disabled = false,
		class: className = "",
		control,
		children
	}: {
		label: string;
		id?: string;
		htmlFor?: string;
		description?: string;
		error?: string;
		required?: boolean;
		disabled?: boolean;
		class?: string;
		control?: Snippet<[ControlProps]>;
		children?: Snippet;
	} = $props();

	const controlId = $derived(id ?? htmlFor ?? `field-${uid}`);
	const descriptionId = $derived(description ? `${controlId}-description` : undefined);
	const errorId = $derived(error ? `${controlId}-error` : undefined);
	const describedBy = $derived([descriptionId, errorId].filter(Boolean).join(" ") || undefined);
	const controlProps = $derived<ControlProps>({
		id: controlId,
		"aria-describedby": describedBy,
		"aria-invalid": error ? "true" : undefined,
		"aria-required": required ? "true" : undefined,
		required,
		disabled
	});
	let legacyRoot = $state<HTMLElement>();

	$effect(() => {
		if (control || !legacyRoot) return;
		const wireControl = () => {
			const element = legacyRoot?.querySelector<HTMLElement>(
				"input, textarea, select, button, [role='combobox'], [data-select-trigger], [contenteditable='true']"
			);
			if (!element) return;
			if (!element.id) element.id = controlId;
			const ownedIds = [descriptionId, errorId].filter(Boolean);
			const existingIds = (element.getAttribute("aria-describedby") ?? "")
				.split(/\s+/)
				.filter(Boolean)
				.filter(value => !ownedIds.includes(value));
			const nextIds = [...existingIds, descriptionId, errorId].filter(Boolean).join(" ");
			if (nextIds) element.setAttribute("aria-describedby", nextIds);
			else element.removeAttribute("aria-describedby");
			if (error) element.setAttribute("aria-invalid", "true");
			else element.removeAttribute("aria-invalid");
			if (required) element.setAttribute("aria-required", "true");
			else element.removeAttribute("aria-required");
			if (disabled) element.setAttribute("disabled", "");
		};
		wireControl();
		const observer = new MutationObserver(wireControl);
		observer.observe(legacyRoot, { childList: true, subtree: true });
		return () => observer.disconnect();
	});
</script>

<div
	bind:this={legacyRoot}
	class={cn("flex flex-col gap-2", disabled && "opacity-50", className)}
	data-invalid={error ? "true" : undefined}
>
	<label for={controlId} class={cn(labelBase, "text-foreground mb-0")}
		>{label}{#if required}<span aria-hidden="true"> *</span>{/if}</label
	>
	{#if control}
		{@render control(controlProps)}
	{:else if children}
		{@render children()}
	{/if}
	{#if description}<p id={descriptionId} class={helperBase}>{description}</p>{/if}
	{#if error}<p id={errorId} class="text-caption text-destructive" aria-live="polite">{error}</p>{/if}
</div>
