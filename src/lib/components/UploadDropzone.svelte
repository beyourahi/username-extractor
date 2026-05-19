<script lang="ts">
    import { Upload, X } from "@lucide/svelte";
    import { cn } from "$lib/utils/cn";

    let {
        disabled = false,
        onfiles,
        accept = ".jpg,.jpeg,.png,.bmp,.tiff,.webp"
    }: {
        disabled?: boolean;
        onfiles: (files: File[]) => void;
        accept?: string;
    } = $props();

    let dragOver = $state(false);
    let files = $state<File[]>([]);
    let input: HTMLInputElement | undefined = $state();

    function commit(list: File[]) {
        files = list;
        onfiles(list);
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        dragOver = false;
        if (disabled || !e.dataTransfer) return;
        const dropped = Array.from(e.dataTransfer.files);
        commit([...files, ...dropped]);
    }

    function onDragOver(e: DragEvent) {
        e.preventDefault();
        if (!disabled) dragOver = true;
    }

    function onDragLeave() {
        dragOver = false;
    }

    function onSelect(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        if (!target.files) return;
        commit([...files, ...Array.from(target.files)]);
    }

    function removeAt(idx: number) {
        commit(files.filter((_, i) => i !== idx));
    }

    function openPicker() {
        input?.click();
    }
</script>

<div class="flex flex-col gap-3">
    <button
        type="button"
        class={cn(
            "border-border bg-surface/40 hover:bg-surface flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded border border-dashed px-6 py-12 font-mono text-sm transition-colors",
            dragOver && "border-accent bg-accent/10",
            disabled && "cursor-not-allowed opacity-50"
        )}
        ondrop={onDrop}
        ondragover={onDragOver}
        ondragleave={onDragLeave}
        onclick={openPicker}
        {disabled}
    >
        <Upload class="text-foreground-muted h-8 w-8" />
        <span class="text-foreground text-sm">drop screenshots here</span>
        <span class="text-foreground-muted text-xs">or click to browse · {accept.replaceAll(".", "")}</span>
    </button>

    <input bind:this={input} type="file" multiple {accept} class="hidden" onchange={onSelect} {disabled} />

    {#if files.length > 0}
        <div class="border-border bg-surface/40 rounded border">
            <div
                class="border-border flex items-center justify-between border-b px-3 py-2 font-mono text-[10px] tracking-widest uppercase"
            >
                <span class="text-foreground-muted">queued · {files.length}</span>
                <button type="button" class="text-foreground-muted hover:text-foreground" onclick={() => commit([])}>
                    clear
                </button>
            </div>
            <ul class="max-h-60 overflow-y-auto">
                {#each files as file, idx (file.name + idx)}
                    <li
                        class="border-border/40 flex items-center justify-between border-b px-3 py-1.5 font-mono text-xs last:border-b-0"
                    >
                        <span class="text-foreground-muted truncate">{file.name}</span>
                        <button
                            type="button"
                            class="text-foreground-muted hover:text-danger ml-2 shrink-0"
                            onclick={() => removeAt(idx)}
                            aria-label="remove"
                        >
                            <X class="h-3 w-3" />
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</div>
