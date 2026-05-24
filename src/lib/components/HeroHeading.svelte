<script lang="ts">
    import { cn } from "$lib/utils/cn";

    let {
        emoji = "🔎",
        title = "Username Extractor",
        tagline = "Screenshots in, usernames out.",
        size = "default"
    }: {
        emoji?: string;
        title?: string;
        tagline?: string;
        size?: "sm" | "default";
    } = $props();

    const s = $derived(size === "sm");
</script>

<div class={cn("text-center", s ? "space-y-2" : "space-y-4 sm:space-y-6")}>
    <p class={s ? "text-3xl" : "text-4xl sm:text-5xl"}>{emoji}</p>
    <div class="space-y-1.5">
        <h1
            class={cn("font-black tracking-tight", s ? "text-xl" : "text-2xl sm:text-3xl lg:text-4xl")}
            style="font-weight: 900; letter-spacing: -0.02em;"
        >
            {title}
        </h1>
        <p class={cn("text-muted-fg", s ? "text-xs" : "text-xs sm:text-sm lg:text-base")}>
            {tagline}
        </p>
    </div>
</div>
