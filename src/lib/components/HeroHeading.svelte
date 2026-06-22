<script lang="ts">
    import { cn, Heading, bodyBase, helperBase } from "$lib/ds";

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

<div class={cn("flex w-full flex-col text-center", s ? "gap-2" : "gap-4 sm:gap-6")}>
    <p class={s ? "text-3xl" : "text-4xl sm:text-5xl"}>{emoji}</p>
    <div class="flex flex-col gap-1.5">
        <Heading as="h1" size={s ? "title-sm" : "title-lg"} weight={600} class="tracking-tight text-balance">
            {title}
        </Heading>
        <p class={s ? helperBase : cn(bodyBase, "text-ink-muted")}>
            {tagline}
        </p>
    </div>
</div>
