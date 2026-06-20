<script lang="ts">
    import { Dialog } from "bits-ui";
    import { X, Copy } from "@lucide/svelte";
    import Button from "./Button.svelte";

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
        <Dialog.Overlay class="fade-in bg-background/60 fixed inset-0 z-50" style="backdrop-filter: blur(6px);" />
        <Dialog.Content
            class="border-hair bg-card slide-in fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[min(90vw,800px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[var(--radius)] border shadow-xl"
        >
            <div class="border-hair flex items-start justify-between gap-3 border-b p-5">
                <div class="min-w-0">
                    <Dialog.Title class="text-sm font-semibold tracking-tight">Raw model response</Dialog.Title>
                    <p class="text-ink-muted mt-1 truncate font-mono text-xs">{stem}</p>
                </div>
                <div class="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onclick={copy} disabled={!raw}>
                        <Copy size={12} /> Copy
                    </Button>
                    <Dialog.Close
                        class="sleek text-ink-muted hover:text-foreground -m-1 rounded p-1"
                        aria-label="Close"
                    >
                        <X size={16} />
                    </Dialog.Close>
                </div>
            </div>
            <div class="overflow-auto p-5">
                {#if loading}
                    <p class="text-ink-muted text-xs">Loading…</p>
                {:else if error}
                    <p class="text-tier-failed-fg text-xs text-pretty">Error: {error}</p>
                {:else if raw}
                    <pre
                        class="border-hair bg-ink-2 text-foreground text-caption rounded-lg border p-4 leading-relaxed break-words whitespace-pre-wrap">{raw}</pre>
                {:else}
                    <p class="text-ink-muted text-xs">No data.</p>
                {/if}
            </div>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
