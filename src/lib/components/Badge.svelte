<script lang="ts">
    import type { Snippet } from "svelte";
    import { tv } from "tailwind-variants";

    type Tone = "default" | "success" | "warning" | "danger" | "info";

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
        base: "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest",
        variants: {
            tone: {
                default: "border-border bg-surface text-foreground-muted",
                success: "border-accent/40 bg-accent/10 text-accent",
                warning: "border-warning/40 bg-warning/10 text-warning",
                danger: "border-danger/40 bg-danger/10 text-danger",
                info: "border-info/40 bg-info/10 text-info"
            }
        }
    });
</script>

<span class={badge({ tone, class: className })}>{@render children()}</span>
