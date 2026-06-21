<!--
    Public /changelog — a plain-language history of user-facing updates, sourced from
    CHANGELOG_ENTRIES ($lib/data/changelog). Mirrors the sibling tools' changelog
    (day-zero / invoice-generator / order-processor): newest-first, grouped by date,
    the newest day tagged "Latest". Absolute dates only — relative dates ("x days ago")
    would mismatch the SSR render and trip hydration. Reachable signed-out via the
    isPublicPath allowlist in hooks.server.ts; inherits the AppBar + Footer from +layout.svelte.
-->
<script lang="ts">
    import { CHANGELOG_ENTRIES, type ChangelogEntry } from "$lib/data/changelog";
    import { Heading, Eyebrow } from "$lib/ds";

    type ChangelogGroup = {
        date: string;
        label: string;
        entries: ChangelogEntry[];
    };

    const dateFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" });

    // Parse as UTC midnight so the displayed day never shifts by timezone.
    function formatDate(iso: string): string {
        return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
    }

    // Entries arrive newest-first; fold consecutive same-date entries into one group
    // so each calendar day renders under a single header.
    function groupByDate(entries: ChangelogEntry[]): ChangelogGroup[] {
        const groups: ChangelogGroup[] = [];
        for (const entry of entries) {
            const last = groups.at(-1);
            if (last && last.date === entry.date) {
                last.entries.push(entry);
            } else {
                groups.push({ date: entry.date, label: formatDate(entry.date), entries: [entry] });
            }
        }
        return groups;
    }

    const groups = groupByDate(CHANGELOG_ENTRIES);
</script>

<svelte:head>
    <title>Changelog · Username Extractor</title>
    <meta
        name="description"
        content="What's new in Username Extractor — a plain-language history of features, improvements, and fixes."
    />
</svelte:head>

<div class="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6 sm:py-20">
    <header class="slide-in flex flex-col gap-4 sm:gap-5">
        <Eyebrow>What's new</Eyebrow>
        <Heading as="h1" size="title" weight={560} class="lowercase">changelog</Heading>
        <p class="text-ink-muted text-label sm:text-body max-w-md text-pretty">
            Every meaningful update to Username Extractor, written in plain language.
        </p>
    </header>

    <div class="border-hair my-12 border-t sm:my-16"></div>

    <div class="space-y-14 sm:space-y-20">
        {#each groups as group, groupIndex (group.date)}
            <section class="space-y-6">
                <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                    <span class="text-ink-muted text-micro font-mono tracking-[0.28em] uppercase tabular-nums">
                        {group.label}
                    </span>
                    {#if groupIndex === 0}
                        <span
                            class="border-hair text-ink-muted text-micro rounded-full border px-2 py-0.5 font-mono tracking-[0.18em] whitespace-nowrap uppercase"
                        >
                            Latest
                        </span>
                    {/if}
                </div>

                <div class="border-hair space-y-8 border-l pl-5 sm:pl-6">
                    {#each group.entries as entry (entry.title)}
                        <article class="space-y-2.5">
                            <span class="text-ink-muted text-micro block font-mono tracking-[0.22em] uppercase">
                                {entry.category}
                            </span>
                            <Heading as="h2" size="lead" weight={560} class="text-balance">
                                {entry.title}
                            </Heading>
                            <p class="text-ink-muted text-label leading-relaxed text-pretty">
                                {entry.summary}
                            </p>
                        </article>
                    {/each}
                </div>
            </section>
        {/each}
    </div>
</div>
