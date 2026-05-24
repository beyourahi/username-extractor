<script lang="ts">
    import { untrack } from "svelte";
    import { superForm } from "sveltekit-superforms";
    import { toast } from "svelte-sonner";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import { enhance } from "$app/forms";

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

<div class="flex flex-col gap-6">
    <PageHeader title="settings" subtitle="extraction defaults · notion · maintenance" />

    <form method="POST" action="?/save" use:enhanceForm class="flex flex-col gap-6 font-mono text-xs">
        <!-- Extraction -->
        <section class="border-border bg-surface/40 flex flex-col gap-3 rounded border p-4">
            <h2 class="text-foreground-muted text-[10px] tracking-widest text-balance uppercase">extraction</h2>
            <label class="flex cursor-pointer items-center gap-2">
                <input
                    type="checkbox"
                    class="cursor-pointer"
                    name="diagnosticsDefault"
                    bind:checked={$form.diagnosticsDefault}
                />
                <span>save raw model response on every job</span>
            </label>
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest whitespace-nowrap uppercase">daily image quota</span>
                <input
                    type="number"
                    name="dailyImageQuota"
                    min="0"
                    max="10000"
                    bind:value={$form.dailyImageQuota}
                    class="border-border bg-background text-foreground w-40 rounded-sm border px-2 py-1"
                />
                {#if $errors.dailyImageQuota}
                    <span class="text-danger text-pretty">{$errors.dailyImageQuota}</span>
                {/if}
            </label>
        </section>

        <!-- Notion -->
        <section class="border-border bg-surface/40 flex flex-col gap-3 rounded border p-4">
            <h2 class="text-foreground-muted text-[10px] tracking-widest text-balance uppercase">notion</h2>
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest whitespace-nowrap uppercase">integration token</span>
                <input
                    type="password"
                    name="notionToken"
                    placeholder={maskedToken || "secret_…"}
                    bind:value={$form.notionToken}
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1"
                />
                <span class="text-foreground-muted/60 text-pretty">leave blank to keep existing token</span>
            </label>
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest whitespace-nowrap uppercase">database id</span>
                <input
                    type="text"
                    name="notionDatabaseId"
                    bind:value={$form.notionDatabaseId}
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1"
                />
            </label>
            <label class="flex cursor-pointer items-center gap-2">
                <input
                    type="checkbox"
                    class="cursor-pointer"
                    name="notionAutoSync"
                    bind:checked={$form.notionAutoSync}
                />
                <span>auto-sync verified leads to notion</span>
            </label>
            <label class="flex cursor-pointer items-center gap-2">
                <input
                    type="checkbox"
                    class="cursor-pointer"
                    name="notionSkipValidation"
                    bind:checked={$form.notionSkipValidation}
                />
                <span>skip instagram profile validation</span>
            </label>
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest whitespace-nowrap uppercase"
                    >validation delay (ms)</span
                >
                <input
                    type="number"
                    name="notionValidationDelayMs"
                    min="0"
                    max="60000"
                    bind:value={$form.notionValidationDelayMs}
                    class="border-border bg-background text-foreground w-40 rounded-sm border px-2 py-1"
                />
            </label>
        </section>

        <div class="flex items-center justify-end gap-2">
            <button
                type="submit"
                disabled={$submitting}
                class={`border-accent bg-accent/10 text-accent pointer-fine:hover:bg-accent/20 rounded-sm border px-4 py-1 tracking-widest whitespace-nowrap uppercase disabled:opacity-50 ${
                    $submitting ? "cursor-wait" : "cursor-pointer"
                }`}
            >
                {$submitting ? "saving…" : "save"}
            </button>
        </div>

        {#if $message}
            <p class="text-accent text-pretty">{$message}</p>
        {/if}
    </form>

    <!-- Maintenance: dedup -->
    <section class="border-border bg-surface/40 flex flex-col gap-3 rounded border p-4 font-mono text-xs">
        <h2 class="text-foreground-muted text-[10px] tracking-widest text-balance uppercase">
            maintenance · notion dedup
        </h2>
        <p class="text-foreground-muted text-pretty">
            scans your notion database, scores duplicate usernames, and archives all but the best entry per group.
        </p>
        <form method="POST" action="?/dedup" use:enhance class="flex flex-wrap items-center gap-3">
            <label class="flex cursor-pointer items-center gap-2">
                <input type="checkbox" class="cursor-pointer" name="dryRun" value="true" checked />
                <span>dry run · preview only</span>
            </label>
            <button
                type="submit"
                class="border-info/40 text-info pointer-fine:hover:bg-info/10 cursor-pointer rounded-sm border px-3 py-1 tracking-widest whitespace-nowrap uppercase"
            >
                run dedup
            </button>
        </form>
    </section>

    <!-- Import legacy data -->
    <section class="border-border bg-surface/40 flex flex-col gap-3 rounded border p-4 font-mono text-xs">
        <h2 class="text-foreground-muted text-[10px] tracking-widest text-balance uppercase">import legacy data</h2>
        <p class="text-foreground-muted text-pretty">
            seed lifetime leads from the python cli output or an existing notion database. idempotent — re-running with
            the same input is safe.
        </p>

        <form
            method="POST"
            action="?/importLegacy"
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
                        toast.success(`imported ${r.imported_markdown + r.imported_notion} · skipped ${r.skipped}`);
                        legacyMarkdown = "";
                    } else if (result.type === "failure") {
                        const err = (result.data?.error as string | undefined) ?? "import failed";
                        toast.error(err);
                    }
                    await update({ reset: false });
                };
            }}
            class="flex flex-col gap-2"
        >
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest whitespace-nowrap uppercase">markdown source</span>
                <textarea
                    name="markdown"
                    rows="6"
                    placeholder="paste verified_usernames.md…"
                    bind:value={legacyMarkdown}
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1 font-mono"
                ></textarea>
            </label>
            <div class="flex justify-end">
                <button
                    type="submit"
                    disabled={legacyMarkdownSubmitting || legacyMarkdown.trim().length === 0}
                    class={`border-info/40 text-info pointer-fine:hover:bg-info/10 rounded-sm border px-3 py-1 tracking-widest whitespace-nowrap uppercase disabled:opacity-50 ${
                        legacyMarkdownSubmitting ? "cursor-wait" : "cursor-pointer"
                    }`}
                >
                    {legacyMarkdownSubmitting ? "importing…" : "import markdown"}
                </button>
            </div>
        </form>

        <form
            method="POST"
            action="?/importLegacy"
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
                        toast.success(`imported ${r.imported_markdown + r.imported_notion} · skipped ${r.skipped}`);
                        legacyNotionToken = "";
                        legacyNotionDatabaseId = "";
                    } else if (result.type === "failure") {
                        const err = (result.data?.error as string | undefined) ?? "import failed";
                        toast.error(err);
                    }
                    await update({ reset: false });
                };
            }}
            class="flex flex-col gap-2"
        >
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest whitespace-nowrap uppercase">notion source</span>
                <input
                    type="password"
                    name="notionToken"
                    placeholder="secret_…"
                    bind:value={legacyNotionToken}
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1"
                />
                <input
                    type="text"
                    name="notionDatabaseId"
                    placeholder="database id"
                    bind:value={legacyNotionDatabaseId}
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1"
                />
            </label>
            <div class="flex justify-end">
                <button
                    type="submit"
                    disabled={legacyNotionSubmitting ||
                        legacyNotionToken.trim().length === 0 ||
                        legacyNotionDatabaseId.trim().length === 0}
                    class={`border-info/40 text-info pointer-fine:hover:bg-info/10 rounded-sm border px-3 py-1 tracking-widest whitespace-nowrap uppercase disabled:opacity-50 ${
                        legacyNotionSubmitting ? "cursor-wait" : "cursor-pointer"
                    }`}
                >
                    {legacyNotionSubmitting ? "importing…" : "import notion"}
                </button>
            </div>
        </form>
    </section>

    <!-- Reset -->
    <section class="border-danger/40 bg-danger/5 flex flex-col gap-3 rounded border p-4 font-mono text-xs">
        <h2 class="text-danger text-[10px] tracking-widest text-balance uppercase">danger zone · reset</h2>
        <p class="text-foreground-muted text-pretty">
            deletes all settings (including encrypted notion token). leads and jobs are preserved.
        </p>
        <form method="POST" action="?/reset" use:enhance>
            <button
                type="submit"
                class="border-danger/40 text-danger pointer-fine:hover:bg-danger/10 cursor-pointer rounded-sm border px-3 py-1 tracking-widest whitespace-nowrap uppercase"
                onclick={(e) => {
                    if (!confirm("reset settings? this cannot be undone.")) e.preventDefault();
                }}
            >
                reset settings
            </button>
        </form>
    </section>
</div>
