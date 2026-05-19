<script lang="ts">
    import { Dialog } from "bits-ui";
    import { X } from "@lucide/svelte";

    let {
        open,
        onclose
    }: {
        open: boolean;
        onclose: () => void;
    } = $props();

    let step = $state<"extract" | "notion">("extract");
    let diagnosticsDefault = $state(false);
    let notionToken = $state("");
    let notionDatabaseId = $state("");

    function next() {
        step = "notion";
    }

    function handleOpenChange(v: boolean) {
        if (!v) onclose();
    }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
    <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
            class="border-border bg-surface fixed top-1/2 left-1/2 z-50 flex w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded border font-mono shadow-xl"
        >
            <div class="border-border flex items-center justify-between border-b px-4 py-2">
                <Dialog.Title class="text-foreground text-xs tracking-widest uppercase">
                    first-run setup · {step === "extract" ? "1 / 2 extraction" : "2 / 2 notion"}
                </Dialog.Title>
                <Dialog.Close class="border-border hover:bg-surface-elevated rounded-sm border px-2 py-0.5">
                    <X class="h-3 w-3" />
                </Dialog.Close>
            </div>

            <form method="POST" action="/settings?/save" class="flex flex-col gap-4 p-4 text-xs">
                {#if step === "extract"}
                    <p class="text-foreground-muted leading-relaxed">
                        Pick your default flags. You can change these any time from settings.
                    </p>
                    <label class="text-foreground flex items-center gap-2">
                        <input type="checkbox" name="diagnosticsDefault" bind:checked={diagnosticsDefault} />
                        <span>diagnostics by default · saves raw model response on every job</span>
                    </label>
                    <div class="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            class="border-border hover:bg-surface-elevated rounded-sm border px-3 py-1 tracking-widest uppercase"
                            onclick={onclose}
                        >
                            skip
                        </button>
                        <button
                            type="button"
                            class="border-accent bg-accent/10 text-accent rounded-sm border px-3 py-1 tracking-widest uppercase"
                            onclick={next}
                        >
                            next
                        </button>
                    </div>
                {:else}
                    <p class="text-foreground-muted leading-relaxed">
                        Optional. Connect a Notion database to auto-sync verified leads. Skip to extract locally only.
                    </p>
                    <label class="flex flex-col gap-1">
                        <span class="text-foreground-muted tracking-widest uppercase">integration token</span>
                        <input
                            type="password"
                            name="notionToken"
                            bind:value={notionToken}
                            placeholder="secret_…"
                            class="border-border bg-background text-foreground rounded-sm border px-2 py-1"
                        />
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="text-foreground-muted tracking-widest uppercase">database id</span>
                        <input
                            type="text"
                            name="notionDatabaseId"
                            bind:value={notionDatabaseId}
                            placeholder="32-char hex"
                            class="border-border bg-background text-foreground rounded-sm border px-2 py-1"
                        />
                    </label>
                    <input type="hidden" name="notionAutoSync" value={notionToken ? "true" : "false"} />
                    <input type="hidden" name="notionSkipValidation" value="false" />
                    <input type="hidden" name="notionValidationDelayMs" value="2000" />
                    <input type="hidden" name="dailyImageQuota" value="1000" />
                    <input type="hidden" name="diagnosticsDefault" value={diagnosticsDefault ? "true" : "false"} />

                    <div class="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            class="border-border hover:bg-surface-elevated rounded-sm border px-3 py-1 tracking-widest uppercase"
                            onclick={onclose}
                        >
                            skip
                        </button>
                        <button
                            type="submit"
                            class="border-accent bg-accent/10 text-accent rounded-sm border px-3 py-1 tracking-widest uppercase"
                        >
                            save
                        </button>
                    </div>
                {/if}
            </form>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
