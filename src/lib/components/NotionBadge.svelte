<script lang="ts">
    import Badge from "./Badge.svelte";
    import type { NotionStatus } from "$lib/types/messages";

    let { status }: { status: NotionStatus } = $props();

    const map: Record<string, { tone: "default" | "success" | "warning" | "danger" | "info"; label: string }> = {
        added: { tone: "success", label: "✓ ADDED" },
        invalid: { tone: "danger", label: "✗ INVALID" },
        pending: { tone: "warning", label: "⏳ PENDING" },
        unconfigured: { tone: "default", label: "— UNCONFIGURED" }
    };

    const cfg = $derived(
        status ? (map[status] ?? { tone: "default" as const, label: "—" }) : { tone: "default" as const, label: "—" }
    );
</script>

<Badge tone={cfg.tone}>{cfg.label}</Badge>
