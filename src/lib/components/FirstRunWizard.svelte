<script lang="ts">
    import { Dialog } from "bits-ui";
    import { X, Check, Cloud } from "@lucide/svelte";
    import Button from "./Button.svelte";
    import Switch from "./Switch.svelte";
    import Field from "./Field.svelte";
    import TextInput from "./TextInput.svelte";
    import NotionBadge from "./NotionBadge.svelte";

    let {
        open,
        onclose
    }: {
        open: boolean;
        onclose: () => void;
    } = $props();

    let step = $state<0 | 1 | 2>(0);
    let diagnosticsDefault = $state(false);
    let notionToken = $state("");
    let notionDatabaseId = $state("");

    function next() {
        step = step < 2 ? ((step + 1) as 0 | 1 | 2) : step;
    }

    function back() {
        step = step > 0 ? ((step - 1) as 0 | 1 | 2) : step;
    }

    function handleOpenChange(v: boolean) {
        if (!v) onclose();
    }

    const titles = ["Welcome to Username Extractor", "Welcome to Username Extractor", "All set"];
    const descriptions = [
        "Two quick questions before your first job.",
        "Connect Notion (optional — you can skip).",
        "You're ready to extract."
    ];
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
    <Dialog.Portal>
        <Dialog.Overlay
            class="fade-in fixed inset-0 z-50"
            style="background: hsl(0 0% 0% / 0.6); backdrop-filter: blur(6px);"
        />
        <Dialog.Content
            class="border-border-strong bg-card slide-in fixed top-1/2 left-1/2 z-50 flex w-[min(90vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border shadow-2xl"
            style="box-shadow: 0 20px 60px hsl(0 0% 0% / 0.6);"
        >
            <div class="border-border flex items-start justify-between gap-3 border-b p-5">
                <div>
                    <Dialog.Title class="text-sm font-semibold tracking-tight">
                        {titles[step]}
                    </Dialog.Title>
                    <p class="text-muted-fg mt-1 text-xs text-pretty">{descriptions[step]}</p>
                </div>
                <Dialog.Close class="sleek -m-1 rounded p-1 text-zinc-400 hover:text-white" aria-label="Close">
                    <X size={16} />
                </Dialog.Close>
            </div>

            <div class="p-5">
                {#if step === 0}
                    <div class="space-y-4">
                        <p class="text-muted-fg text-xs text-pretty">
                            Extraction defaults — change anytime in Settings.
                        </p>
                        <div class="border-border flex items-start justify-between gap-3 rounded-md border p-3">
                            <div>
                                <p class="text-sm font-medium">Diagnostics by default</p>
                                <p class="text-muted-fg mt-1 text-xs text-pretty">
                                    Save raw model responses for replay.
                                </p>
                            </div>
                            <Switch
                                checked={diagnosticsDefault}
                                onchange={(v) => (diagnosticsDefault = v)}
                                ariaLabel="Diagnostics"
                            />
                        </div>
                        <div class="border-border flex items-start justify-between gap-3 rounded-md border p-3">
                            <div>
                                <p class="text-sm font-medium">Bring your own Cloudflare</p>
                                <p class="text-muted-fg mt-1 text-xs text-pretty">
                                    Extractions run on your Cloudflare account (billed to you). Connect it and pick a
                                    model in Settings before your first job.
                                </p>
                            </div>
                            <Cloud size={16} class="text-muted-fg mt-0.5 shrink-0" />
                        </div>
                    </div>
                {:else if step === 1}
                    <form method="POST" action="/settings?/save" class="space-y-4">
                        <Field
                            label="Notion integration token"
                            optional
                            hint="Stored encrypted. Leave blank to set up later."
                        >
                            <TextInput
                                type="password"
                                name="notionToken"
                                bind:value={notionToken}
                                placeholder="secret_…"
                                autocomplete="off"
                            />
                        </Field>
                        <Field label="Database ID" optional>
                            <TextInput name="notionDatabaseId" bind:value={notionDatabaseId} placeholder="1a3b4c5d-…" />
                        </Field>
                        <p class="text-muted-fg text-[11px] text-pretty">
                            Without Notion, verified handles still save to your Leads table. You'll see
                            <NotionBadge status="unconfigured" size="sm" /> badges until you connect.
                        </p>
                        <input type="hidden" name="notionAutoSync" value={notionToken ? "true" : "false"} />
                        <input type="hidden" name="notionSkipValidation" value="false" />
                        <input type="hidden" name="notionValidationDelayMs" value="2000" />
                        <input type="hidden" name="dailyImageQuota" value="0" />
                        <input type="hidden" name="diagnosticsDefault" value={diagnosticsDefault ? "true" : "false"} />
                    </form>
                {:else}
                    <div class="space-y-3 py-2 text-center">
                        <div
                            class="bg-brand-soft mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full"
                        >
                            <Check size={20} class="text-brand" />
                        </div>
                        <p class="text-sm font-semibold">You're ready</p>
                        <p class="text-muted-fg mx-auto max-w-xs text-xs text-pretty">
                            Drop a batch of Instagram screenshots on the home screen to start your first extraction.
                        </p>
                    </div>
                {/if}
            </div>

            <div class="border-border flex items-center justify-between border-t p-4">
                <div class="flex items-center gap-1">
                    {#each [0, 1, 2] as i (i)}
                        <span
                            class="h-1.5 w-1.5 rounded-full"
                            style="background: {i <= step ? 'var(--brand)' : 'var(--border-strong)'};"
                        ></span>
                    {/each}
                </div>
                <div class="flex items-center gap-2">
                    {#if step > 0 && step < 2}
                        <Button variant="ghost" size="sm" onclick={back}>Back</Button>
                    {/if}
                    {#if step === 0}
                        <Button variant="brand" size="sm" onclick={next}>Continue</Button>
                    {:else if step === 1}
                        {#if notionToken}
                            <Button
                                variant="brand"
                                size="sm"
                                onclick={() => {
                                    const form = document.querySelector(
                                        "form[action='/settings?/save']"
                                    ) as HTMLFormElement | null;
                                    form?.requestSubmit();
                                    next();
                                }}
                            >
                                Save & continue
                            </Button>
                        {:else}
                            <Button variant="brand" size="sm" onclick={next}>Skip for now</Button>
                        {/if}
                    {:else}
                        <Button variant="brand" size="sm" onclick={onclose}>Get started</Button>
                    {/if}
                </div>
            </div>
        </Dialog.Content>
    </Dialog.Portal>
</Dialog.Root>
