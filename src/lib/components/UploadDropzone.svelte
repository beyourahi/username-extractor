<script lang="ts">
    import { Image as ImageIcon, AlertTriangle, Check } from "@lucide/svelte";
    import Spinner from "./Spinner.svelte";
    import Button from "./Button.svelte";
    import Eyebrow from "./Eyebrow.svelte";
    import { cn } from "$lib/utils/cn";

    let {
        disabled = false,
        processing = false,
        onfiles,
        accept = ".png,.jpg,.jpeg,.webp,.bmp,.tiff,image/*"
    }: {
        disabled?: boolean;
        processing?: boolean;
        onfiles: (files: File[]) => void;
        accept?: string;
    } = $props();

    let dragOver = $state(false);
    let files = $state<File[]>([]);
    let error = $state<string | null>(null);
    let input: HTMLInputElement | undefined = $state();

    function commit(list: File[]) {
        files = list;
        onfiles(list);
    }

    function validate(list: File[]): File[] {
        return list.filter((f) => /\.(png|jpe?g|webp|bmp|tiff)$/i.test(f.name) || f.type.startsWith("image/"));
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        dragOver = false;
        if (disabled || processing || !e.dataTransfer) return;
        const dropped = validate(Array.from(e.dataTransfer.files));
        if (dropped.length === 0) {
            error = "Please drop image files (PNG, JPG, WebP, BMP, TIFF).";
            return;
        }
        error = null;
        commit([...files, ...dropped]);
    }

    function onDragOver(e: DragEvent) {
        e.preventDefault();
        if (!disabled && !processing) dragOver = true;
    }

    function onDragLeave() {
        dragOver = false;
    }

    function onSelect(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        if (!target.files) return;
        const picked = validate(Array.from(target.files));
        if (picked.length === 0) {
            error = "Please pick image files (PNG, JPG, WebP, BMP, TIFF).";
            return;
        }
        error = null;
        commit([...files, ...picked]);
    }

    function openPicker() {
        if (!disabled && !processing) input?.click();
    }

    function clearError(e: MouseEvent) {
        e.stopPropagation();
        error = null;
    }

    function clearFiles() {
        commit([]);
    }

    const totalMb = $derived(files.length > 0 ? (files.reduce((s, f) => s + f.size, 0) / 1_000_000).toFixed(1) : "0");
</script>

<div class="flex w-full flex-col gap-4">
    <div
        role="button"
        tabindex="0"
        onclick={openPicker}
        onkeydown={(e) => e.key === "Enter" && openPicker()}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        ondrop={onDrop}
        class={cn(
            "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200",
            "h-56 sm:h-72 lg:h-80",
            error ? "border-[hsl(0_62%_50%/0.55)]" : dragOver ? "border-brand-border" : "border-border-strong",
            (disabled || processing) && "cursor-not-allowed opacity-60"
        )}
        style="background: {dragOver ? 'hsl(160 84% 39% / 0.05)' : files.length ? 'var(--card)' : 'transparent'};"
        aria-disabled={disabled || processing}
    >
        <input
            bind:this={input}
            type="file"
            multiple
            {accept}
            class="hidden"
            onchange={onSelect}
            disabled={disabled || processing}
        />

        {#if error}
            <div class="flex flex-col items-center gap-3 px-4 text-center">
                <AlertTriangle size={28} class="text-destructive" />
                <p class="text-destructive text-sm text-pretty">{error}</p>
                <Button variant="ghost" size="sm" onclick={clearError}>Try again</Button>
            </div>
        {:else if processing}
            <div class="flex flex-col items-center gap-4">
                <Spinner size="lg" color="brand" />
                <p class="text-muted-fg text-sm">Creating job…</p>
            </div>
        {:else if files.length > 0}
            <div class="flex flex-col items-center gap-4 px-4 text-center">
                <div
                    class="border-brand-border bg-brand-soft inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
                >
                    <Check size={12} class="text-brand" />
                    <span class="text-brand font-mono text-xs font-medium">
                        {files.length} image{files.length !== 1 ? "s" : ""} ready
                    </span>
                </div>
                <p class="text-sm text-zinc-300">
                    Drop more, or hit <span class="font-semibold text-white">Run extraction</span>
                </p>
            </div>
        {:else}
            <div class="flex flex-col items-center gap-4 px-4 sm:gap-6">
                <ImageIcon size={40} class="text-zinc-500" strokeWidth={1.5} />
                <div class="flex flex-col items-center gap-1.5 text-center">
                    <p class="text-base font-medium text-zinc-300 sm:text-lg">Drop your screenshots here</p>
                    <p class="text-muted-fg text-xs sm:text-sm">or click to browse · PNG, JPG, WebP up to 50</p>
                </div>
            </div>
        {/if}
    </div>

    {#if files.length > 0 && !processing}
        <div class="border-border bg-card fade-in rounded-lg border p-3">
            <Eyebrow icon={ImageIcon}>
                {files.length} queued · {totalMb} MB
                {#snippet right()}
                    <button
                        type="button"
                        onclick={clearFiles}
                        class="sleek text-[11px] text-zinc-500 hover:text-zinc-300"
                    >
                        Clear
                    </button>
                {/snippet}
            </Eyebrow>
            <div class="mt-2.5 grid max-h-32 grid-cols-2 gap-1.5 overflow-auto sm:grid-cols-3">
                {#each files.slice(0, 9) as f, idx (f.name + idx)}
                    <div
                        class="border-border text-muted-fg flex items-center gap-1.5 truncate rounded border px-2 py-1 font-mono text-[11px]"
                    >
                        <ImageIcon size={10} />
                        <span class="truncate">{f.name}</span>
                    </div>
                {/each}
                {#if files.length > 9}
                    <div
                        class="border-border text-muted-fg flex items-center justify-center rounded border px-2 py-1 text-[11px]"
                    >
                        +{files.length - 9} more
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
