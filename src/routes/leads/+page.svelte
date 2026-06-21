<script lang="ts">
    import { untrack } from "svelte";
    import { SvelteURLSearchParams } from "svelte/reactivity";
    import { toast } from "svelte-sonner";
    import { Trash2, RefreshCw, Send, Search, ExternalLink, Download } from "@lucide/svelte";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import EmptyState from "$lib/components/EmptyState.svelte";
    import Pagination from "$lib/components/Pagination.svelte";
    import NotionBadge from "$lib/components/NotionBadge.svelte";
    import TierBadge from "$lib/components/TierBadge.svelte";
    import Button from "$lib/components/Button.svelte";
    import TextInput from "$lib/components/TextInput.svelte";
    import Switch from "$lib/components/Switch.svelte";
    import type { NotionStatus, Tier } from "$lib/types/messages";

    let { data } = $props();

    function fmtDate(ms: number): string {
        const d = new Date(ms);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    async function archive(id: string) {
        try {
            const res = await fetch(`/api/leads/${id}/archive`, { method: "POST" });
            if (!res.ok) throw new Error(`${res.status}`);
            toast.success("Archived · refresh to update");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Archive failed");
        }
    }

    async function sendToNotion(id: string) {
        try {
            const res = await fetch(`/api/leads/${id}/notion-sync`, { method: "POST" });
            if (!res.ok) throw new Error(`${res.status}`);
            const body = (await res.json()) as { notionStatus?: string; error?: string | null };
            if (body.notionStatus === "added") toast.success("Notion · added");
            else if (body.notionStatus === "invalid") toast.error("Profile not found · marked invalid");
            else if (body.notionStatus === "pending") toast.error(`Notion pending · ${body.error ?? "retry later"}`);
            else if (body.notionStatus === "unconfigured")
                toast.error("Notion not configured · set token in /settings");
            else toast.success("Notion sync ran");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Sync failed");
        }
    }

    const baseQuery = $derived.by(() => {
        const params = new SvelteURLSearchParams();
        if (data.q) params.set("q", data.q);
        if (data.tier) params.set("tier", data.tier);
        if (data.notion) params.set("notion", data.notion);
        if (data.archived) params.set("archived", "1");
        const s = params.toString();
        return s ? `/leads?${s}` : "/leads";
    });

    // CSV export of the current filtered view. Content-Disposition on the endpoint
    // makes the browser download rather than navigate.
    const csvHref = $derived.by(() => {
        const params = new SvelteURLSearchParams();
        params.set("format", "csv");
        if (data.q) params.set("q", data.q);
        if (data.tier) params.set("tier", data.tier);
        if (data.notion) params.set("notion", data.notion);
        if (data.archived) params.set("archived", "1");
        return `/api/leads?${params.toString()}`;
    });

    // Local mirror of filter state for chip-based interaction. Form submission
    // updates the URL; server reload returns the matching slice.
    let queryLocal = $state(untrack(() => data.q ?? ""));
    let formEl: HTMLFormElement | undefined = $state();

    function chipNav(field: "tier" | "notion", value: string) {
        const url = new URL(window.location.href);
        if (value) url.searchParams.set(field, value);
        else url.searchParams.delete(field);
        url.searchParams.delete("page");
        window.location.href = url.pathname + url.search;
    }

    function setArchived(v: boolean) {
        const url = new URL(window.location.href);
        if (v) url.searchParams.set("archived", "1");
        else url.searchParams.delete("archived");
        url.searchParams.delete("page");
        window.location.href = url.pathname + url.search;
    }

    const tierChips = [
        { v: "", l: "All tiers", tone: "default" },
        { v: "HIGH", l: "HIGH", tone: "brand" },
        { v: "MED", l: "MED", tone: "med" }
    ] as const;

    const notionChips = [
        { v: "", l: "Any sync", tone: "default" },
        { v: "added", l: "Added", tone: "brand" },
        { v: "pending", l: "Pending", tone: "med" },
        { v: "invalid", l: "Invalid", tone: "failed" },
        { v: "unconfigured", l: "Unconfigured", tone: "default" }
    ] as const;

    function chipStyle(active: boolean, tone: "default" | "brand" | "med" | "failed"): string {
        if (!active) return "border-color: var(--border-strong); color: var(--muted-foreground);";
        if (tone === "brand")
            return "background: var(--brand-soft); border-color: var(--brand-border); color: var(--brand);";
        if (tone === "med")
            return "background: var(--tier-med-bg); border-color: var(--tier-med-border); color: var(--tier-med-foreground);";
        if (tone === "failed")
            return "background: var(--tier-failed-bg); border-color: var(--tier-failed-border); color: var(--tier-failed-foreground);";
        return "background: var(--secondary); border-color: var(--border-strong); color: white;";
    }
</script>

<div class="mx-auto flex w-full max-w-[var(--content-max)] flex-col gap-6 px-[var(--content-x)] pt-8 pb-8 sm:pt-10">
    <PageHeader
        title="Leads"
        subtitle={`${data.total} verified usernames, all-time. Duplicate removal uses this list as the source of truth.`}
    >
        {#snippet actions()}
            <Button
                variant="outline"
                size="sm"
                href={csvHref}
                download="leads.csv"
                title="Export current view as CSV"
                aria-label="Export leads as CSV"
            >
                <Download size={13} /> Export
            </Button>
            <Button variant="outline" size="sm" href="/settings"><RefreshCw size={13} /> Sync pending</Button>
        {/snippet}
    </PageHeader>

    <form bind:this={formEl} method="GET" class="border-hair bg-card rounded-lg border p-4 sm:p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div class="relative flex-1">
                <Search size={13} class="text-ink-muted absolute top-1/2 left-3 z-10 -translate-y-1/2" />
                <TextInput
                    type="search"
                    name="q"
                    bind:value={queryLocal}
                    placeholder="Search by username…"
                    class="pl-8"
                />
            </div>
            <div class="flex flex-wrap items-center gap-2">
                {#each tierChips as c (c.v)}
                    <button
                        type="button"
                        onclick={() => chipNav("tier", c.v)}
                        class="sleek text-caption inline-flex h-7 shrink-0 touch-manipulation items-center rounded-full border px-3 font-mono whitespace-nowrap uppercase"
                        style={chipStyle((data.tier ?? "") === c.v, c.tone as "default" | "brand" | "med" | "failed")}
                    >
                        {c.l}
                    </button>
                {/each}

                <div class="bg-hair mx-1 h-5 w-px"></div>

                {#each notionChips as c (c.v)}
                    <button
                        type="button"
                        onclick={() => chipNav("notion", c.v)}
                        class="sleek text-caption inline-flex h-7 shrink-0 touch-manipulation items-center rounded-full border px-3 font-mono whitespace-nowrap uppercase"
                        style={chipStyle((data.notion ?? "") === c.v, c.tone)}
                    >
                        {c.l}
                    </button>
                {/each}

                <div class="bg-hair mx-1 h-5 w-px"></div>
                <label class="text-ink-muted text-caption inline-flex items-center gap-2 font-mono">
                    <Switch
                        checked={Boolean(data.archived)}
                        onchange={(v) => setArchived(v)}
                        ariaLabel="Show archived"
                    />
                    <span>Show archived</span>
                </label>
            </div>
        </div>

        <!-- Hidden inputs to preserve current filter state across `q` submits -->
        {#if data.tier}<input type="hidden" name="tier" value={data.tier} />{/if}
        {#if data.notion}<input type="hidden" name="notion" value={data.notion} />{/if}
        {#if data.archived}<input type="hidden" name="archived" value="1" />{/if}
        <button type="submit" class="sr-only">Apply filters</button>
    </form>

    {#if data.leads.length === 0}
        <EmptyState title="No matches" description="Try clearing filters or searching with fewer characters.">
            {#snippet icon()}
                <Search class="h-7 w-7" />
            {/snippet}
            {#snippet action()}
                <Button variant="ghost" size="sm" href="/leads">Reset filters</Button>
            {/snippet}
        </EmptyState>
    {:else}
        <div class="border-hair bg-card overflow-hidden rounded-lg border">
            <div
                class="border-hair text-ink-muted text-micro hidden gap-3 border-b px-4 py-2.5 font-mono tracking-[0.14em] uppercase sm:grid sm:grid-cols-[minmax(180px,1fr)_80px_70px_150px_120px_80px]"
            >
                <span>Username</span>
                <span>Tier</span>
                <span class="text-right">Conf</span>
                <span>Source job</span>
                <span>Notion</span>
                <span class="text-right">Actions</span>
            </div>
            {#each data.leads as l, i (l.id)}
                <div
                    class="status-transition hover:bg-ink-2/50 flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[minmax(180px,1fr)_80px_70px_150px_120px_80px] sm:items-center sm:gap-3"
                    style={i ? "border-top: 1px solid var(--hair);" : undefined}
                >
                    <div class="flex min-w-0 items-center gap-2">
                        <ExternalLink size={13} class="text-ink-muted shrink-0" />
                        <a
                            href={l.igUrl}
                            target="_blank"
                            rel="noreferrer"
                            class="text-foreground min-w-0 truncate font-mono text-sm font-semibold hover:underline"
                        >
                            @{l.username}
                        </a>
                    </div>
                    <TierBadge tier={l.tier as Tier} size="sm" />
                    <span class="text-ink-muted font-mono text-xs tabular-nums sm:text-right"
                        >{l.confidence.toFixed(0)}%</span
                    >
                    {#if l.sourceJobId}
                        <a
                            href={`/jobs/${l.sourceJobId}`}
                            class="sleek text-ink-muted hover:text-foreground text-caption truncate text-left font-mono whitespace-nowrap"
                        >
                            {l.sourceJobId.slice(0, 18)}
                        </a>
                    {:else}
                        <span class="text-ink-muted text-caption font-mono">—</span>
                    {/if}
                    <NotionBadge status={l.notionStatus as NotionStatus} size="sm" />
                    <div class="flex items-center gap-1 sm:justify-end">
                        {#if l.notionStatus === "pending" || l.notionStatus === "invalid"}
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Retry Notion sync"
                                onclick={() => sendToNotion(l.id)}
                                title="Retry Notion sync"
                            >
                                <RefreshCw size={12} />
                            </Button>
                        {:else if !l.notionStatus || l.notionStatus === "unconfigured"}
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Send to Notion"
                                onclick={() => sendToNotion(l.id)}
                                title="Send to Notion"
                            >
                                <Send size={12} />
                            </Button>
                        {/if}
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Archive"
                            onclick={() => archive(l.id)}
                            title="Archive"
                        >
                            <Trash2 size={12} />
                        </Button>
                    </div>
                    {#if l.createdAt}
                        <p class="text-ink-muted text-micro col-span-full -mt-1 font-mono tabular-nums sm:hidden">
                            {fmtDate(l.createdAt)}
                        </p>
                    {/if}
                </div>
            {/each}
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} baseHref={baseQuery} />
        </div>
        <p class="text-ink-muted text-caption text-center font-mono tabular-nums">
            Showing {data.leads.length} of {data.total} leads.
        </p>
    {/if}
</div>
