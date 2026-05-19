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
    class="border-border text-foreground-muted flex items-center justify-between border-t px-3 py-2 font-mono text-xs"
    aria-label="pagination"
>
    <span>
        page {page} / {totalPages} · {total} total
    </span>
    <div class="flex items-center gap-1">
        {#if page > 1}
            <a href={hrefFor(page - 1)} class="border-border hover:bg-surface-elevated rounded-sm border px-2 py-0.5"
                >prev</a
            >
        {/if}
        {#if page < totalPages}
            <a href={hrefFor(page + 1)} class="border-border hover:bg-surface-elevated rounded-sm border px-2 py-0.5"
                >next</a
            >
        {/if}
    </div>
</nav>
