<script lang="ts">
    import { untrack } from "svelte";
    import { superForm } from "sveltekit-superforms";
    import { toast } from "svelte-sonner";
    import { enhance } from "$app/forms";
    import { Sparkles, RefreshCw, Upload, Trash2, FileText, Check, AlertTriangle } from "@lucide/svelte";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import Button from "$lib/components/Button.svelte";
    import Switch from "$lib/components/Switch.svelte";
    import Field from "$lib/components/Field.svelte";
    import TextInput from "$lib/components/TextInput.svelte";
    import Spinner from "$lib/components/Spinner.svelte";
    import type { Component, Snippet } from "svelte";

    let { data } = $props();

    const maskedToken = $derived(data.maskedToken ?? "");

    const {
        form,
        errors,
        enhance: enhanceForm,
        message,
        submitting
    } = superForm(
        untrack(() => data.form),
        {
            resetForm: false,
            onUpdated({ form: f }) {
                if (f.message) toast.success(f.message);
            }
        }
    );

    let legacyMarkdown = $state("");
    let legacyNotionToken = $state("");
    let legacyNotionDatabaseId = $state("");
    let legacyMarkdownSubmitting = $state(false);
    let legacyNotionSubmitting = $state(false);
</script>

{#snippet section(icon: Component<{ size?: number; class?: string }>, title: string, subtitle: string, body: Snippet)}
    {@const Ic = icon}
    <section class="border-border bg-card overflow-hidden rounded-lg border">
        <header class="border-border border-b p-4">
            <div class="flex items-center gap-2.5">
                <span class="bg-secondary flex h-7 w-7 items-center justify-center rounded-md">
                    <Ic size={13} class="text-zinc-300" />
                </span>
                <div>
                    <h2 class="text-sm font-semibold tracking-tight">{title}</h2>
                    <p class="text-muted-fg mt-0.5 text-[11px]">{subtitle}</p>
                </div>
            </div>
        </header>
        <div class="px-4">{@render body()}</div>
    </section>
{/snippet}

<main class="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-8 pb-8 sm:px-6 sm:pt-10">
    <PageHeader title="Settings" subtitle="Extraction defaults, Notion credentials, and maintenance tools." />

    <form method="POST" action="?/save" use:enhanceForm class="flex flex-col gap-8">
        {#snippet extractionBody()}
            <div class="flex items-start justify-between gap-3 py-3">
                <div>
                    <p class="text-sm font-medium text-zinc-200">Diagnostics by default</p>
                    <p class="text-muted-fg mt-1 text-xs text-pretty">
                        Save the raw model response to R2 alongside the parsed result.
                    </p>
                </div>
                <Switch
                    checked={$form.diagnosticsDefault}
                    onchange={(v) => ($form.diagnosticsDefault = v)}
                    ariaLabel="Diagnostics"
                />
                <input type="hidden" name="diagnosticsDefault" value={$form.diagnosticsDefault ? "true" : "false"} />
            </div>
            <div class="bg-border h-px"></div>
            <div class="flex items-center justify-between py-3">
                <div>
                    <p class="text-sm font-medium text-zinc-200">Vision model</p>
                    <p class="text-muted-fg mt-0.5 font-mono text-[11px] whitespace-nowrap">@cf/moonshotai/kimi-k2.6</p>
                </div>
                <span class="border-border-strong text-muted-fg rounded-full border px-2 py-0.5 font-mono text-[10px]">
                    locked
                </span>
            </div>
            <div class="bg-border h-px"></div>
            <div class="flex items-center justify-between gap-3 py-3">
                <div>
                    <p class="text-sm font-medium text-zinc-200">Daily image quota</p>
                    <p class="text-muted-fg mt-0.5 text-xs">Per-user upper bound applied to new jobs.</p>
                </div>
                <div class="w-28">
                    <TextInput
                        type="number"
                        name="dailyImageQuota"
                        bind:value={$form.dailyImageQuota}
                        min={0}
                        max={100000}
                        class="text-right"
                    />
                    {#if $errors.dailyImageQuota}
                        <p class="text-tier-failed-fg mt-1 text-[11px] text-pretty">{$errors.dailyImageQuota}</p>
                    {/if}
                </div>
            </div>
        {/snippet}

        {@render section(Sparkles, "Extraction", "Defaults applied to every new job.", extractionBody)}

        {#snippet notionBody()}
            <div class="space-y-4 py-3">
                <Field
                    label="Integration token"
                    hint={maskedToken
                        ? `Stored: ${maskedToken} — leave blank to keep.`
                        : "Encrypted at rest. Masked after save."}
                >
                    <TextInput
                        type="password"
                        name="notionToken"
                        bind:value={$form.notionToken}
                        placeholder={maskedToken || "secret_…"}
                        autocomplete="off"
                    />
                </Field>
                <Field label="Database ID" hint="Found in the URL of your Notion database.">
                    <TextInput name="notionDatabaseId" bind:value={$form.notionDatabaseId} />
                </Field>
            </div>
            <div class="bg-border h-px"></div>
            <div class="flex items-start justify-between gap-3 py-3">
                <div>
                    <p class="text-sm font-medium text-zinc-200">Auto-sync verified leads</p>
                    <p class="text-muted-fg mt-1 text-xs text-pretty">
                        HIGH and MED tiers get pushed automatically as a job runs.
                    </p>
                </div>
                <Switch
                    checked={$form.notionAutoSync}
                    onchange={(v) => ($form.notionAutoSync = v)}
                    ariaLabel="Auto sync"
                />
                <input type="hidden" name="notionAutoSync" value={$form.notionAutoSync ? "true" : "false"} />
            </div>
            <div class="bg-border h-px"></div>
            <div class="flex items-start justify-between gap-3 py-3">
                <div>
                    <p class="text-sm font-medium text-zinc-200">Skip Instagram profile validation</p>
                    <p class="text-muted-fg mt-1 text-xs text-pretty">
                        Trust extracted handles without an HTTP check — faster but allows 404s through.
                    </p>
                </div>
                <Switch
                    checked={$form.notionSkipValidation}
                    onchange={(v) => ($form.notionSkipValidation = v)}
                    ariaLabel="Skip validation"
                />
                <input
                    type="hidden"
                    name="notionSkipValidation"
                    value={$form.notionSkipValidation ? "true" : "false"}
                />
            </div>
            <div class="bg-border h-px"></div>
            <div class="flex items-center justify-between gap-3 py-3">
                <div>
                    <p class="text-sm font-medium text-zinc-200">Validation delay (ms)</p>
                    <p class="text-muted-fg mt-0.5 text-xs">Throttle between Instagram HEAD requests.</p>
                </div>
                <div class="w-28">
                    <TextInput
                        type="number"
                        name="notionValidationDelayMs"
                        bind:value={$form.notionValidationDelayMs}
                        min={0}
                        max={60000}
                        class="text-right"
                    />
                </div>
            </div>
            <div class="bg-border h-px"></div>
            <div class="flex items-center justify-between gap-3 py-3">
                <div>
                    <p class="text-sm font-medium text-zinc-200">Dedup keep-strategy</p>
                    <p class="text-muted-fg mt-0.5 text-xs text-pretty">
                        Which page survives when collapsing duplicate handles in Notion.
                    </p>
                </div>
                <div class="w-36">
                    <select
                        name="dedupKeepStrategy"
                        bind:value={$form.dedupKeepStrategy}
                        class="border-border-strong bg-background w-full rounded-md border px-2.5 py-2 text-xs text-zinc-200 focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)] focus:outline-none"
                    >
                        <option value="best">Best score</option>
                        <option value="oldest">Oldest</option>
                        <option value="newest">Newest</option>
                    </select>
                </div>
            </div>
        {/snippet}

        {@render section(FileText, "Notion", "Credentials used to push verified handles into your CRM.", notionBody)}

        <div
            class="border-border-strong sticky bottom-4 z-30 flex items-center justify-between gap-3 rounded-lg border p-3 backdrop-blur-md"
            style="background: hsl(240 5.9% 10% / 0.85);"
        >
            <div class="text-muted-fg flex items-center gap-2 text-xs">
                {#if $submitting}
                    <Spinner size="sm" color="brand" /> Saving…
                {:else if $message}
                    <Check size={12} class="text-brand" />
                    <span class="text-brand">Saved</span>
                {:else}
                    <span>Changes apply to subsequent jobs.</span>
                {/if}
            </div>
            <div class="flex items-center gap-2">
                <Button type="submit" variant="brand" size="sm" disabled={$submitting}>
                    {$submitting ? "Saving…" : "Save changes"}
                </Button>
            </div>
        </div>
    </form>

    {#snippet maintenanceBody()}
        <div class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p class="text-sm font-medium text-zinc-200">Notion deduplication</p>
                <p class="text-muted-fg mt-1 text-xs text-pretty">
                    Scans your full database and archives losers using the keep-strategy.
                </p>
            </div>
            <form method="POST" action="?/dedup" use:enhance class="flex items-center gap-2">
                <label class="text-muted-fg inline-flex cursor-pointer items-center gap-1.5 text-[11px]">
                    <input type="checkbox" name="dryRun" value="true" checked class="cursor-pointer" />
                    Dry run
                </label>
                <Button type="submit" variant="brand" size="sm">Run dedup</Button>
            </form>
        </div>
        <div class="bg-border h-px"></div>
        <form
            method="POST"
            action="?/importLegacy"
            class="flex flex-col gap-3 py-3"
            use:enhance={() => {
                legacyMarkdownSubmitting = true;
                return async ({ result, update }) => {
                    legacyMarkdownSubmitting = false;
                    if (result.type === "success" && result.data?.importLegacyResult) {
                        const r = result.data.importLegacyResult as {
                            imported_markdown: number;
                            imported_notion: number;
                            skipped: number;
                        };
                        toast.success(`Imported ${r.imported_markdown + r.imported_notion} · skipped ${r.skipped}`);
                        legacyMarkdown = "";
                    } else if (result.type === "failure") {
                        const err = (result.data?.error as string | undefined) ?? "Import failed";
                        toast.error(err);
                    }
                    await update({ reset: false });
                };
            }}
        >
            <div>
                <p class="text-sm font-medium text-zinc-200">Legacy markdown import</p>
                <p class="text-muted-fg mt-1 text-xs text-pretty">
                    Paste the contents of <span class="font-mono">verified_usernames.md</span> from the Python CLI.
                </p>
            </div>
            <textarea
                name="markdown"
                rows="5"
                bind:value={legacyMarkdown}
                placeholder="Paste markdown…"
                class="border-border-strong bg-background w-full rounded-lg border px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)] focus:outline-none"
            ></textarea>
            <div class="flex justify-end">
                <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={legacyMarkdownSubmitting || legacyMarkdown.trim().length === 0}
                >
                    <Upload size={13} />
                    {legacyMarkdownSubmitting ? "Importing…" : "Import markdown"}
                </Button>
            </div>
        </form>
        <div class="bg-border h-px"></div>
        <form
            method="POST"
            action="?/importLegacy"
            class="flex flex-col gap-3 py-3"
            use:enhance={() => {
                legacyNotionSubmitting = true;
                return async ({ result, update }) => {
                    legacyNotionSubmitting = false;
                    if (result.type === "success" && result.data?.importLegacyResult) {
                        const r = result.data.importLegacyResult as {
                            imported_markdown: number;
                            imported_notion: number;
                            skipped: number;
                        };
                        toast.success(`Imported ${r.imported_markdown + r.imported_notion} · skipped ${r.skipped}`);
                        legacyNotionToken = "";
                        legacyNotionDatabaseId = "";
                    } else if (result.type === "failure") {
                        const err = (result.data?.error as string | undefined) ?? "Import failed";
                        toast.error(err);
                    }
                    await update({ reset: false });
                };
            }}
        >
            <div>
                <p class="text-sm font-medium text-zinc-200">Legacy Notion import</p>
                <p class="text-muted-fg mt-1 text-xs text-pretty">
                    Scan an existing Notion database into Leads. Idempotent — re-running is safe.
                </p>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
                <TextInput
                    type="password"
                    name="notionToken"
                    bind:value={legacyNotionToken}
                    placeholder="secret_…"
                    autocomplete="off"
                />
                <TextInput name="notionDatabaseId" bind:value={legacyNotionDatabaseId} placeholder="database id" />
            </div>
            <div class="flex justify-end">
                <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={legacyNotionSubmitting ||
                        legacyNotionToken.trim().length === 0 ||
                        legacyNotionDatabaseId.trim().length === 0}
                >
                    <Upload size={13} />
                    {legacyNotionSubmitting ? "Importing…" : "Import Notion"}
                </Button>
            </div>
        </form>
    {/snippet}

    {@render section(RefreshCw, "Maintenance", "One-shot tools for cleaning historical state.", maintenanceBody)}

    {#snippet resetBody()}
        <div class="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <p class="text-tier-failed-fg text-sm font-medium">Reset to defaults</p>
                <p class="text-muted-fg mt-1 text-xs text-pretty">
                    Wipes settings only (including encrypted Notion token). Jobs and leads are unaffected.
                </p>
            </div>
            <form
                method="POST"
                action="?/reset"
                use:enhance
                onsubmit={(e) => {
                    if (!confirm("Reset settings? This cannot be undone.")) e.preventDefault();
                }}
            >
                <Button type="submit" variant="destructive" size="sm">
                    <Trash2 size={13} /> Reset settings
                </Button>
            </form>
        </div>
    {/snippet}

    {@render section(AlertTriangle, "Danger zone", "Destructive — confirm before clicking.", resetBody)}
</main>
