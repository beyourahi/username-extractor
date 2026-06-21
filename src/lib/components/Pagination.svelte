<script lang="ts">
    let {
        page,
        pageSize,
        total,
        baseHref
    }: {
        page: number;
        pageSize: number;
        total: number;
        baseHref: string;
    } = $props();

    const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

    function hrefFor(p: number): string {
        const sep = baseHref.includes("?") ? "&" : "?";
        return `${baseHref}${sep}page=${p}`;
    }
</script>

<nav
    class="text-ink-muted border-hair flex items-center justify-between gap-3 border-t px-4 py-2.5"
    aria-label="Pagination"
>
    <span class="text-ink-muted text-caption font-mono whitespace-nowrap tabular-nums">
        Page {page} / {totalPages} · {total} total
    </span>
    <div class="flex items-center gap-1.5">
        {#if page > 1}
            <a
                href={hrefFor(page - 1)}
                class="sleek text-foreground border-hair hover:border-signal hover:bg-ink-2 text-caption inline-flex h-7 items-center rounded-md border px-2.5 font-medium"
            >
                Prev
            </a>
        {/if}
        {#if page < totalPages}
            <a
                href={hrefFor(page + 1)}
                class="sleek text-foreground border-hair hover:border-signal hover:bg-ink-2 text-caption inline-flex h-7 items-center rounded-md border px-2.5 font-medium"
            >
                Next
            </a>
        {/if}
    </div>
</nav>
