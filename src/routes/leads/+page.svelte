<script lang="ts">
    import { SvelteURLSearchParams } from "svelte/reactivity";
    import { toast } from "svelte-sonner";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import EmptyState from "$lib/components/EmptyState.svelte";
    import Toolbar from "$lib/components/Toolbar.svelte";
    import Pagination from "$lib/components/Pagination.svelte";
    import NotionBadge from "$lib/components/NotionBadge.svelte";
    import TierBadge from "$lib/components/TierBadge.svelte";
    import { Archive, RefreshCw, Send, Search } from "@lucide/svelte";
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
            toast.success("archived · refresh to update");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "archive failed");
        }
    }

    async function sendToNotion(id: string) {
        try {
            const res = await fetch(`/api/leads/${id}/notion`, { method: "POST" });
            if (!res.ok) throw new Error(`${res.status}`);
            toast.success("notion sync queued");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "sync failed");
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
</script>

<div class="flex flex-col gap-6">
    <PageHeader title="leads" subtitle="lifetime verified usernames · search, filter, sync" />

    <form method="GET" class="contents">
        <Toolbar>
            {#snippet filters()}
                <input
                    name="q"
                    value={data.q}
                    placeholder="search username…"
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1 font-mono text-xs"
                />
                <select
                    name="tier"
                    value={data.tier}
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1 font-mono text-xs"
                >
                    <option value="">all tiers</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MED">MED</option>
                </select>
                <select
                    name="notion"
                    value={data.notion}
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1 font-mono text-xs"
                >
                    <option value="">all notion</option>
                    <option value="added">added</option>
                    <option value="invalid">invalid</option>
                    <option value="pending">pending</option>
                    <option value="unconfigured">unconfigured</option>
                </select>
                <label class="text-foreground-muted flex cursor-pointer items-center gap-1 whitespace-nowrap">
                    <input type="checkbox" class="cursor-pointer" name="archived" value="1" checked={data.archived} />
                    archived
                </label>
            {/snippet}
            {#snippet actions()}
                <button
                    type="submit"
                    class="border-accent/40 text-accent pointer-fine:hover:bg-accent/10 cursor-pointer rounded-sm border px-3 py-1 tracking-widest whitespace-nowrap uppercase"
                >
                    apply
                </button>
                <a
                    href="/leads"
                    class="border-border text-foreground-muted pointer-fine:hover:bg-surface cursor-pointer rounded-sm border px-3 py-1 tracking-widest whitespace-nowrap uppercase"
                >
                    reset
                </a>
            {/snippet}
        </Toolbar>
    </form>

    {#if data.leads.length === 0}
        <EmptyState title="no leads match" description="adjust the filters above or upload more screenshots.">
            {#snippet icon()}
                <Search class="h-8 w-8" />
            {/snippet}
        </EmptyState>
    {:else}
        <div class="border-border bg-surface/40 overflow-hidden rounded border font-mono text-xs">
            <table class="w-full">
                <thead class="text-foreground-muted border-border border-b text-left tracking-widest uppercase">
                    <tr>
                        <th class="px-3 py-2">username</th>
                        <th class="px-3 py-2">tier</th>
                        <th class="px-3 py-2 text-right">conf</th>
                        <th class="px-3 py-2">notion</th>
                        <th class="px-3 py-2">created</th>
                        <th class="px-3 py-2"></th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.leads as lead (lead.id)}
                        <tr class="border-border/40 pointer-fine:hover:bg-surface border-b last:border-b-0">
                            <td class="px-3 py-2">
                                <a
                                    href={lead.igUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="text-foreground cursor-pointer whitespace-nowrap pointer-fine:hover:underline"
                                >
                                    @{lead.username}
                                </a>
                            </td>
                            <td class="px-3 py-2">
                                <TierBadge tier={lead.tier as Tier} />
                            </td>
                            <td class="text-foreground-muted px-3 py-2 text-right whitespace-nowrap"
                                >{lead.confidence.toFixed(0)}</td
                            >
                            <td class="px-3 py-2">
                                <NotionBadge status={lead.notionStatus as NotionStatus} />
                            </td>
                            <td class="text-foreground-muted px-3 py-2 whitespace-nowrap">{fmtDate(lead.createdAt)}</td>
                            <td class="px-3 py-2">
                                <div class="flex items-center justify-end gap-1">
                                    {#if lead.notionStatus === "invalid" || lead.notionStatus === "pending"}
                                        <button
                                            type="button"
                                            class="border-border pointer-fine:hover:bg-surface-elevated cursor-pointer rounded-sm border px-2 py-0.5 tracking-widest uppercase"
                                            onclick={() => sendToNotion(lead.id)}
                                            title="retry notion sync"
                                        >
                                            <RefreshCw class="inline h-3 w-3" />
                                        </button>
                                    {:else if !lead.notionStatus || lead.notionStatus === "unconfigured"}
                                        <button
                                            type="button"
                                            class="border-border pointer-fine:hover:bg-surface-elevated cursor-pointer rounded-sm border px-2 py-0.5 tracking-widest uppercase"
                                            onclick={() => sendToNotion(lead.id)}
                                            title="send to notion"
                                        >
                                            <Send class="inline h-3 w-3" />
                                        </button>
                                    {/if}
                                    <button
                                        type="button"
                                        class="border-border pointer-fine:hover:bg-surface-elevated cursor-pointer rounded-sm border px-2 py-0.5 tracking-widest uppercase"
                                        onclick={() => archive(lead.id)}
                                        title="archive"
                                    >
                                        <Archive class="inline h-3 w-3" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} baseHref={baseQuery} />
        </div>
    {/if}
</div>
