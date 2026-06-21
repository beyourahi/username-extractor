<script lang="ts">
    import { Check, X, Hourglass, AlertTriangle } from "@lucide/svelte";
    import Spinner from "./Spinner.svelte";
    import { cn } from "$lib/utils/cn";
    import type { NotionStatus } from "$lib/types/messages";

    let {
        status,
        size = "default"
    }: {
        status: NotionStatus | "syncing" | null;
        size?: "sm" | "default";
    } = $props();

    type Variant = { label: string; icon: typeof Check | null; fg: string; bg: string; bd: string };

    const variants = {
        added: {
            label: "Added",
            icon: Check,
            fg: "var(--status-active-foreground)",
            bg: "var(--status-active-bg)",
            bd: "var(--status-active-border)"
        },
        pending: {
            label: "Pending",
            icon: Hourglass,
            fg: "var(--tier-med-foreground)",
            bg: "var(--tier-med-bg)",
            bd: "var(--tier-med-border)"
        },
        invalid: {
            label: "Invalid",
            icon: X,
            fg: "var(--status-inactive-foreground)",
            bg: "var(--status-inactive-bg)",
            bd: "var(--status-inactive-border)"
        },
        unconfigured: {
            label: "Unconfigured",
            icon: AlertTriangle,
            fg: "var(--muted-foreground)",
            bg: "transparent",
            bd: "var(--border-strong)"
        },
        syncing: {
            label: "Syncing",
            icon: null,
            fg: "var(--brand)",
            bg: "var(--brand-soft)",
            bd: "var(--brand-border)"
        }
    } satisfies Record<string, Variant>;

    const v = $derived<Variant>(
        status && status in variants ? variants[status as keyof typeof variants] : variants.unconfigured
    );
    const s = $derived(size === "sm");
</script>

<span
    class={cn(
        "inline-flex items-center rounded-full border font-mono tracking-[0.04em] uppercase transition-colors ease-[var(--ease)]",
        s ? "text-micro gap-1 px-1.5 py-0.5" : "text-caption gap-1.5 px-2 py-0.5"
    )}
    style="background: {v.bg}; color: {v.fg}; border-color: {v.bd};"
>
    {#if status === "syncing"}
        <Spinner size="sm" color="brand" />
    {:else if v.icon}
        {@const Ic = v.icon}
        <Ic size={s ? 9 : 11} />
    {/if}
    {v.label}
</span>
