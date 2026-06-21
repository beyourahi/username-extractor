<script lang="ts">
    import { Image as ImageIcon, AlertTriangle, Check, FolderOpen } from "@lucide/svelte";
    import Spinner from "./Spinner.svelte";
    import Button from "./Button.svelte";
    import Eyebrow from "./Eyebrow.svelte";
    import { cn } from "$lib/utils/cn";

    let {
        disabled = false,
        processing = false,
        progressLabel = "Creating job…",
        onfiles,
        accept = ".png,.jpg,.jpeg,.webp,.bmp,.tiff,.avif,image/*"
    }: {
        disabled?: boolean;
        processing?: boolean;
        progressLabel?: string;
        onfiles: (files: File[]) => void;
        accept?: string;
    } = $props();

    let dragOver = $state(false);
    let files = $state<File[]>([]);
    let error = $state<string | null>(null);
    let input: HTMLInputElement | undefined = $state();
    let folderInput: HTMLInputElement | undefined = $state();

    function commit(list: File[]) {
        files = list;
        onfiles(list);
    }

    function validate(list: File[]): File[] {
        return list.filter((f) => /\.(png|jpe?g|webp|bmp|tiff|avif)$/i.test(f.name) || f.type.startsWith("image/"));
    }

    // Recursively collect File objects from a dropped directory entry. webkitGetAsEntry
    // must be called synchronously in the drop handler (see onDrop) before any await.
    async function readEntryFiles(entry: FileSystemEntry, out: File[]): Promise<void> {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) =>
                (entry as FileSystemFileEntry).file(resolve, reject)
            );
            out.push(file);
        } else if (entry.isDirectory) {
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            const readBatch = () =>
                new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
            let batch = await readBatch();
            while (batch.length > 0) {
                for (const e of batch) await readEntryFiles(e, out);
                batch = await readBatch(); // readEntries returns in batches; loop until empty.
            }
        }
    }

    async function onDrop(e: DragEvent) {
        e.preventDefault();
        dragOver = false;
        if (disabled || processing || !e.dataTransfer) return;

        // Grab directory entries synchronously — the DataTransfer is invalidated after await.
        const entries: FileSystemEntry[] = [];
        const items = e.dataTransfer.items;
        if (items && items.length && typeof items[0]?.webkitGetAsEntry === "function") {
            for (const it of Array.from(items)) {
                const entry = it.webkitGetAsEntry?.();
                if (entry) entries.push(entry);
            }
        }

        let collected: File[] = [];
        if (entries.length > 0) {
            for (const entry of entries) await readEntryFiles(entry, collected);
        } else {
            collected = Array.from(e.dataTransfer.files);
        }

        const dropped = validate(collected);
        if (dropped.length === 0) {
            error = "No images found. Drop image files or a folder of them (PNG, JPG, WebP, AVIF, BMP, TIFF).";
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
            error = "Please pick image files (PNG, JPG, WebP, AVIF, BMP, TIFF).";
            return;
        }
        error = null;
        commit([...files, ...picked]);
        target.value = ""; // allow re-selecting the same files/folder
    }

    function openPicker() {
        if (!disabled && !processing) input?.click();
    }

    function openFolderPicker(e: MouseEvent) {
        e.stopPropagation();
        if (!disabled && !processing) folderInput?.click();
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
            "flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200 ease-[var(--ease)]",
            "h-56 sm:h-72 lg:h-80",
            error
                ? "border-destructive/55 bg-card/30"
                : dragOver
                  ? "border-brand-border bg-brand-soft"
                  : files.length
                    ? "border-hair bg-card"
                    : "border-hair bg-card/30",
            (disabled || processing) && "cursor-not-allowed opacity-60"
        )}
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
        <!-- Second input: whole-folder selection. webkitdirectory ignores `accept`,
             so validate() filters the result down to images. -->
        <input
            bind:this={folderInput}
            type="file"
            multiple
            webkitdirectory
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
                <p class="text-ink-muted text-sm tabular-nums">{progressLabel}</p>
            </div>
        {:else if files.length > 0}
            <div class="flex flex-col items-center gap-4 px-4 text-center">
                <div
                    class="border-brand-border bg-brand-soft text-status-active-fg inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
                >
                    <Check size={12} class="text-status-active-fg" />
                    <span class="font-mono text-xs font-medium">
                        {files.length} image{files.length !== 1 ? "s" : ""} ready
                    </span>
                </div>
                <p class="text-ink-muted text-sm">
                    Drop more, or hit <span class="text-foreground font-semibold">Run extraction</span>
                </p>
                <button
                    type="button"
                    onclick={openFolderPicker}
                    class="sleek text-ink-muted hover:text-foreground inline-flex items-center gap-1.5 text-xs"
                >
                    <FolderOpen size={12} /> Add a folder
                </button>
            </div>
        {:else}
            <div class="flex flex-col items-center gap-4 px-4 sm:gap-6">
                <ImageIcon size={40} class="text-ink-muted" strokeWidth={1.5} />
                <div class="flex flex-col items-center gap-1.5 text-center">
                    <p class="text-foreground text-base font-medium sm:text-lg">Drop screenshots or a whole folder</p>
                    <p class="text-ink-muted text-xs sm:text-sm">click to browse files · PNG · JPG · WebP · AVIF</p>
                </div>
                <button
                    type="button"
                    onclick={openFolderPicker}
                    class="sleek border-hair text-ink-muted hover:border-signal hover:text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
                >
                    <FolderOpen size={13} /> Select a folder
                </button>
            </div>
        {/if}
    </div>

    {#if files.length > 0 && !processing}
        <div class="border-hair bg-card fade-in rounded-lg border p-4 sm:p-5">
            <Eyebrow icon={ImageIcon}>
                {files.length} queued · {totalMb} MB
                {#snippet right()}
                    <button
                        type="button"
                        onclick={clearFiles}
                        class="sleek text-ink-muted hover:text-foreground text-caption"
                    >
                        Clear
                    </button>
                {/snippet}
            </Eyebrow>
            <div class="mt-2.5 grid max-h-32 grid-cols-2 gap-1.5 overflow-auto sm:grid-cols-3">
                {#each files.slice(0, 9) as f, idx (f.name + idx)}
                    <div
                        class="border-hair text-ink-muted text-caption flex items-center gap-1.5 truncate rounded-lg border px-2 py-1 font-mono"
                    >
                        <ImageIcon size={10} />
                        <span class="truncate">{f.name}</span>
                    </div>
                {/each}
                {#if files.length > 9}
                    <div
                        class="border-hair text-ink-muted text-caption flex items-center justify-center rounded-lg border px-2 py-1"
                    >
                        +{files.length - 9} more
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>
