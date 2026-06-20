<script lang="ts">
    let {
        size = "sm",
        color = "white"
    }: {
        size?: "sm" | "md" | "lg";
        color?: "white" | "brand" | string;
    } = $props();

    const dims = $derived({ sm: 14, md: 22, lg: 32 }[size]);
    const borderTop = $derived(color === "brand" ? "var(--brand)" : color === "white" ? "currentColor" : color);
</script>

<span
    class="spin text-ink-muted inline-block rounded-full"
    style="width: {dims}px; height: {dims}px; border: 2px solid var(--hair); border-top-color: {borderTop};"
></span>
