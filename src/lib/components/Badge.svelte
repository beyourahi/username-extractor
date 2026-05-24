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
        base: "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[2px] font-mono text-[10px] font-medium uppercase tracking-[0.10em]",
        variants: {
            tone: {
                default: "border-border-strong text-muted-fg bg-transparent",
                success:
                    "border-[color:var(--status-active-border)] bg-[color:var(--status-active-bg)] text-[color:var(--status-active-fg)]",
                warning:
                    "border-[color:var(--tier-med-border)] bg-[color:var(--tier-med-bg)] text-[color:var(--tier-med-fg)]",
                danger: "border-[color:var(--tier-failed-border)] bg-[color:var(--tier-failed-bg)] text-[color:var(--tier-failed-fg)]",
                info: "border-[color:var(--brand-border)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
                brand: "border-[color:var(--brand-border)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]"
            }
        }
    });
</script>

<span class={badge({ tone, class: className })}>{@render children()}</span>
