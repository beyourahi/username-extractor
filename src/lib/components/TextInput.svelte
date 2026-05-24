<script lang="ts">
    import { cn } from "$lib/utils/cn";

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
        "status-transition w-full rounded-lg border px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:ring-2 focus:outline-none disabled:opacity-50",
        className
    )}
    style="background: var(--card); border-color: {error ? 'hsl(0 70% 60% / 0.55)' : 'var(--border-strong)'};"
    onfocus={(e) => {
        const t = e.currentTarget;
        t.style.borderColor = "var(--brand)";
        t.style.boxShadow = "0 0 0 3px var(--brand-soft)";
    }}
    onblur={(e) => {
        const t = e.currentTarget;
        t.style.borderColor = error ? "hsl(0 70% 60% / 0.55)" : "var(--border-strong)";
        t.style.boxShadow = "none";
    }}
    {...rest}
/>
