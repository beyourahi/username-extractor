<script lang="ts">
    let {
        checked = false,
        onchange,
        ariaLabel,
        disabled = false,
        id,
        name
    }: {
        checked?: boolean;
        onchange?: (v: boolean) => void;
        ariaLabel?: string;
        disabled?: boolean;
        id?: string;
        name?: string;
    } = $props();

    function toggle() {
        if (disabled) return;
        onchange?.(!checked);
    }
</script>

<button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    aria-disabled={disabled || undefined}
    {id}
    onclick={toggle}
    class="focus-visible:outline-signal inline-flex h-5 w-9 shrink-0 touch-manipulation items-center rounded-full p-0.5 transition-colors duration-[250ms] ease-[var(--ease)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {checked
        ? 'bg-brand'
        : 'bg-ink-2'}"
    {disabled}
>
    <span
        class="block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-[250ms] ease-[var(--ease)] motion-reduce:transition-none {checked
            ? 'translate-x-4'
            : 'translate-x-0'}"
    ></span>
</button>
{#if name}<input type="hidden" {name} value={checked ? "true" : "false"} />{/if}
