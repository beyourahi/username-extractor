<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";

	type RadioGroupProps = {
		value?: string | undefined;
		class?: string;
		id?: string;
		"aria-label"?: string;
		"aria-labelledby"?: string;
		onValueChange?: (value: string) => void;
	};

	let {
		value = $bindable(""),
		class: className,
		id,
		"aria-label": ariaLabel,
		"aria-labelledby": ariaLabelledby,
		onValueChange
	}: RadioGroupProps = $props();
</script>

<DropdownMenuPrimitive.RadioGroup
	bind:value
	data-slot="dropdown-menu-radio-group"
	class={className}
	{...id !== undefined ? { id } : {}}
	{...ariaLabel !== undefined ? { "aria-label": ariaLabel } : {}}
	{...ariaLabelledby !== undefined ? { "aria-labelledby": ariaLabelledby } : {}}
	{...onValueChange ? { onValueChange } : {}}
/>
