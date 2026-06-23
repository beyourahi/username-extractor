<script lang="ts">
    import { cn } from "$lib/utils/cn";
    import { PLATFORM_LABELS, type Platform } from "$lib/social/platform";

    let {
        platform,
        size = "default"
    }: {
        platform: Platform | null;
        size?: "sm" | "default";
    } = $props();

    type Variant = { bg: string; fg: string; bd: string; dot: string };

    const variants: Record<Platform, Variant> = {
        instagram: {
            bg: "var(--platform-ig-bg)",
            fg: "var(--platform-ig-foreground)",
            bd: "var(--platform-ig-border)",
            dot: "var(--platform-ig)"
        },
        facebook: {
            bg: "var(--platform-fb-bg)",
            fg: "var(--platform-fb-foreground)",
            bd: "var(--platform-fb-border)",
            dot: "var(--platform-fb)"
        },
        tiktok: {
            bg: "var(--platform-tt-bg)",
            fg: "var(--platform-tt-foreground)",
            bd: "var(--platform-tt-border)",
            dot: "var(--platform-tt)"
        },
        youtube: {
            bg: "var(--platform-yt-bg)",
            fg: "var(--platform-yt-foreground)",
            bd: "var(--platform-yt-border)",
            dot: "var(--platform-yt)"
        },
        other: {
            bg: "var(--platform-other-bg)",
            fg: "var(--platform-other-foreground)",
            bd: "var(--platform-other-border)",
            dot: "var(--platform-other)"
        }
    };

    const v = $derived(platform && platform in variants ? variants[platform] : null);
    const label = $derived(platform ? PLATFORM_LABELS[platform] : "");
    const s = $derived(size === "sm");
</script>

{#if v}
    <span
        class={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-mono font-semibold tracking-[0.08em] whitespace-nowrap uppercase transition-colors ease-[var(--ease)]",
            s ? "text-micro px-2 py-0.5" : "text-caption px-2.5 py-0.5"
        )}
        style="background: {v.bg}; color: {v.fg}; border-color: {v.bd};"
    >
        <span class={cn("shrink-0 rounded-full", s ? "h-1.5 w-1.5" : "h-2 w-2")} style="background: {v.dot};"></span>
        {label}
    </span>
{:else}
    <span class="text-ink-muted text-micro font-mono">—</span>
{/if}
