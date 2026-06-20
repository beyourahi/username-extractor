<script lang="ts">
    import { cn, inputBase } from "$lib/ds";

    type AutoComplete = HTMLInputElement["autocomplete"];

    let {
        value = $bindable(),
        type = "text",
        placeholder,
        name,
        id,
        error = false,
        disabled = false,
        readonly = false,
        class: className = "",
        min,
        max,
        step,
        autocomplete,
        oninput,
        onchange,
        onkeydown,
        ...rest
    }: {
        value?: string | number;
        type?: "text" | "password" | "email" | "number" | "search" | "url";
        placeholder?: string;
        name?: string;
        id?: string;
        error?: boolean;
        disabled?: boolean;
        readonly?: boolean;
        class?: string;
        min?: number;
        max?: number;
        step?: number;
        autocomplete?: AutoComplete;
        oninput?: (e: Event) => void;
        onchange?: (e: Event) => void;
        onkeydown?: (e: KeyboardEvent) => void;
        [k: string]: unknown;
    } = $props();
</script>

<input
    {type}
    {name}
    {id}
    {placeholder}
    {disabled}
    {readonly}
    {min}
    {max}
    {step}
    {autocomplete}
    bind:value
    {oninput}
    {onchange}
    {onkeydown}
    class={cn(
        inputBase,
        "disabled:opacity-50",
        error && "border-tier-failed-border focus:border-tier-failed-border focus-visible:outline-tier-failed",
        className
    )}
    {...rest}
/>
