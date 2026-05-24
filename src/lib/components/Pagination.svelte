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
    class="border-border text-muted-fg flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs"
    aria-label="Pagination"
>
    <span class="font-mono whitespace-nowrap tabular-nums">
        Page {page} / {totalPages} · {total} total
    </span>
    <div class="flex items-center gap-1.5">
        {#if page > 1}
            <a
                href={hrefFor(page - 1)}
                class="sleek border-border-strong hover:bg-secondary inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium text-zinc-300 hover:text-white"
            >
                Prev
            </a>
        {/if}
        {#if page < totalPages}
            <a
                href={hrefFor(page + 1)}
                class="sleek border-border-strong hover:bg-secondary inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium text-zinc-300 hover:text-white"
            >
                Next
            </a>
        {/if}
    </div>
</nav>
