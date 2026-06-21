<script lang="ts">
    import { cn, Heading } from "$lib/ds";

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

<div class={cn("w-full text-center", s ? "space-y-2" : "space-y-4 sm:space-y-6")}>
    <p class={s ? "text-3xl" : "text-4xl sm:text-5xl"}>{emoji}</p>
    <div class="space-y-1.5">
        <Heading
            as="h1"
            size={s ? "title-sm" : "title"}
            weight={600}
            class={cn("tracking-tight text-balance", s ? "" : "sm:text-title-lg")}
        >
            {title}
        </Heading>
        <p class={cn("text-ink-muted text-pretty", s ? "text-caption" : "text-body sm:text-lead")}>
            {tagline}
        </p>
    </div>
</div>
