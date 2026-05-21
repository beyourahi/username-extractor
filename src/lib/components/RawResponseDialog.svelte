<script lang="ts">
    import { Dialog } from "bits-ui";
    import { X, Copy } from "@lucide/svelte";

    let {
        open,
        jobId,
        stem,
        onclose
    }: {
        open: boolean;
        jobId: string;
        stem: string;
        onclose: () => void;
    } = $props();

    let raw = $state<string | null>(null);
    let loading = $state(false);
    let error = $state<string | null>(null);

    $effect(() => {
        if (!open || !jobId || !stem) return;
        let cancelled = false;
        loading = true;
        error = null;
        raw = null;
        (async () => {
            try {
                const res = await fetch(`/api/debug/${jobId}/${encodeURIComponent(stem)}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const text = await res.text();
                if (!cancelled) raw = text;
            } catch (e) {
                if (!cancelled) error = e instanceof Error ? e.message : String(e);
            } finally {
                if (!cancelled) loading = false;
            }
        })();
        return () => {
            cancelled = true;
        };
    });

    function copy() {
        if (raw) navigator.clipboard?.writeText(raw);
    }

    function handleOpenChange(v: boolean) {
        if (!v) onclose();
    }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
    <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
            class="border-border bg-surface fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[min(90vw,800px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded border font-mono shadow-xl"
        >
            <div class="border-border flex items-center justify-between border-b px-4 py-2">
                <Dialog.Title class="text-foreground text-xs tracking-widest text-balance uppercase">
                    raw model response · {stem}
                </Dialog.Title>
                <div class="flex items-center gap-1">
                    <button
                        type="button"
                        class="border-border pointer-fine:hover:bg-surface-elevated cursor-copy rounded-sm border px-2 py-0.5 text-[10px] tracking-widest whitespace-nowrap uppercase disabled:cursor-not-allowed"
                        onclick={copy}
                        disabled={!raw}
                    >
                        <Copy class="inline h-3 w-3" /> copy
                    </button>
                    <Dialog.Close
                        class="border-border pointer-fine:hover:bg-surface-elevated cursor-pointer rounded-sm border px-2 py-0.5"
                        aria-label="close"
                    >
                        <X class="h-3 w-3" />
                    </Dialog.Close>
                </div>
            </div>
            <div class="overflow-auto p-4 text-xs">
                {#if loading}
                    <p class="text-foreground-muted">loading…</p>
                {:else if error}
                    <p class="text-danger text-pretty">error: {error}</p>
                {:else if raw}
                    <pre class="text-foreground break-words whitespace-pre-wrap">{raw}</pre>
                {:else}
                    <p class="text-foreground-muted">no data</p>
                {/if}
            </div>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
