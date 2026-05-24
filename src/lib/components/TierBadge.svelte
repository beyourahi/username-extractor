<script lang="ts">
    import { cn } from "$lib/utils/cn";

    type Tier = "HIGH" | "MED" | "REVIEW" | "FAILED" | null;

    let {
        tier,
        size = "default"
    }: {
        tier: Tier | "HIGH" | "MED" | null;
        size?: "sm" | "default";
    } = $props();

    const variants = {
        HIGH: {
            label: "HIGH",
            bg: "var(--tier-high-bg)",
            fg: "var(--tier-high-foreground)",
            bd: "var(--tier-high-border)",
            dot: "var(--tier-high)",
            pulse: true
        },
        MED: {
            label: "MED",
            bg: "var(--tier-med-bg)",
            fg: "var(--tier-med-foreground)",
            bd: "var(--tier-med-border)",
            dot: "var(--tier-med)",
            pulse: false
        },
        REVIEW: {
            label: "REVIEW",
            bg: "var(--tier-review-bg)",
            fg: "var(--tier-review-foreground)",
            bd: "var(--tier-review-border)",
            dot: "var(--tier-review)",
            pulse: false
        },
        FAILED: {
            label: "FAILED",
            bg: "var(--tier-failed-bg)",
            fg: "var(--tier-failed-foreground)",
            bd: "var(--tier-failed-border)",
            dot: "var(--tier-failed)",
            pulse: false
        }
    } as const;

    const v = $derived(tier ? (variants[tier as keyof typeof variants] ?? variants.REVIEW) : null);
    const s = $derived(size === "sm");
</script>

{#if v}
    <span
        class={cn(
            "status-transition inline-flex shrink-0 items-center rounded-full border font-mono font-semibold tracking-[0.10em] uppercase",
            s ? "gap-1.5 px-2 py-[2px] text-[10px]" : "gap-1.5 px-2.5 py-0.5 text-[11px]"
        )}
        style="background: {v.bg}; color: {v.fg}; border-color: {v.bd};"
    >
        <span
            class={cn("shrink-0 rounded-full", s ? "h-[6px] w-[6px]" : "h-2 w-2", v.pulse && "status-dot-pulse")}
            style="background: {v.dot};"
        ></span>
        {v.label}
    </span>
{:else}
    <span class="text-muted-fg font-mono text-[10px]">—</span>
{/if}
