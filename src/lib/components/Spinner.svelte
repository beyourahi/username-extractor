<script lang="ts">
    let {
        size = "sm",
        color = "white"
    }: {
        size?: "sm" | "md" | "lg";
        color?: "white" | "brand" | string;
    } = $props();

    const dims = $derived({ sm: 14, md: 22, lg: 32 }[size]);
    const borderTop = $derived(color === "brand" ? "var(--brand)" : color === "white" ? "white" : color);
</script>

<span
    class="spin inline-block rounded-full"
    style="width: {dims}px; height: {dims}px; border: 2px solid hsl(0 0% 100% / 0.10); border-top-color: {borderTop};"
></span>
