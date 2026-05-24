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
    class="status-transition inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 disabled:opacity-50"
    style="background: {checked ? 'var(--brand)' : 'var(--secondary)'};"
    {disabled}
>
    <span
        class="status-transition block h-4 w-4 rounded-full bg-white shadow"
        style="transform: translateX({checked ? '16px' : '0px'});"
    ></span>
</button>
{#if name}<input type="hidden" {name} value={checked ? "true" : "false"} />{/if}
