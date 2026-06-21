<script lang="ts">
    import type { Snippet } from "svelte";
    import { tv } from "tailwind-variants";

    type Tone = "default" | "success" | "warning" | "danger" | "info" | "brand";

    let {
        tone = "default",
        children,
        class: className = ""
    }: {
        tone?: Tone;
        children: Snippet;
        class?: string;
    } = $props();

    const badge = tv({
        base: "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-caption font-medium uppercase tracking-[0.10em]",
        variants: {
            tone: {
                default: "border-hair bg-transparent text-ink-muted",
                success: "border-status-active-border bg-status-active-bg text-status-active-fg",
                warning: "border-tier-med-border bg-tier-med-bg text-tier-med-fg",
                danger: "border-tier-failed-border bg-tier-failed-bg text-tier-failed-fg",
                info: "border-brand-border bg-brand-soft text-brand",
                brand: "border-brand-border bg-brand-soft text-brand"
            }
        }
    });
</script>

<span class={badge({ tone, class: className })}>{@render children()}</span>
