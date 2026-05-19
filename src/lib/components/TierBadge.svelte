<script lang="ts">
    import Badge from "./Badge.svelte";

    let { tier }: { tier: "HIGH" | "MED" | null } = $props();

    const tone = $derived(tier === "HIGH" ? "success" : tier === "MED" ? "info" : "default");
    const label = $derived(tier ?? "—");
</script>

<Badge {tone}>{label}</Badge>
