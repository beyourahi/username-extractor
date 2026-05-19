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
</script>

<div class="flex flex-col gap-6">
    <PageHeader title="settings" subtitle="extraction defaults · notion · maintenance" />

    <form method="POST" action="?/save" use:enhanceForm class="flex flex-col gap-6 font-mono text-xs">
        <!-- Extraction -->
        <section class="border-border bg-surface/40 flex flex-col gap-3 rounded border p-4">
            <h2 class="text-foreground-muted text-[10px] tracking-widest uppercase">extraction</h2>
            <label class="flex items-center gap-2">
                <input type="checkbox" name="diagnosticsDefault" bind:checked={$form.diagnosticsDefault} />
                <span>save raw model response on every job</span>
            </label>
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest uppercase">daily image quota</span>
                <input
                    type="number"
                    name="dailyImageQuota"
                    min="0"
                    max="10000"
                    bind:value={$form.dailyImageQuota}
                    class="border-border bg-background text-foreground w-40 rounded-sm border px-2 py-1"
                />
                {#if $errors.dailyImageQuota}
                    <span class="text-danger">{$errors.dailyImageQuota}</span>
                {/if}
            </label>
        </section>

        <!-- Notion -->
        <section class="border-border bg-surface/40 flex flex-col gap-3 rounded border p-4">
            <h2 class="text-foreground-muted text-[10px] tracking-widest uppercase">notion</h2>
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest uppercase">integration token</span>
                <input
                    type="password"
                    name="notionToken"
                    placeholder={maskedToken || "secret_…"}
                    bind:value={$form.notionToken}
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1"
                />
                <span class="text-foreground-muted/60">leave blank to keep existing token</span>
            </label>
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest uppercase">database id</span>
                <input
                    type="text"
                    name="notionDatabaseId"
                    bind:value={$form.notionDatabaseId}
                    class="border-border bg-background text-foreground rounded-sm border px-2 py-1"
                />
            </label>
            <label class="flex items-center gap-2">
                <input type="checkbox" name="notionAutoSync" bind:checked={$form.notionAutoSync} />
                <span>auto-sync verified leads to notion</span>
            </label>
            <label class="flex items-center gap-2">
                <input type="checkbox" name="notionSkipValidation" bind:checked={$form.notionSkipValidation} />
                <span>skip instagram profile validation</span>
            </label>
            <label class="flex flex-col gap-1">
                <span class="text-foreground-muted tracking-widest uppercase">validation delay (ms)</span>
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
                class="border-accent bg-accent/10 text-accent hover:bg-accent/20 rounded-sm border px-4 py-1 tracking-widest uppercase disabled:opacity-50"
            >
                {$submitting ? "saving…" : "save"}
            </button>
        </div>

        {#if $message}
            <p class="text-accent">{$message}</p>
        {/if}
    </form>

    <!-- Maintenance: dedup -->
    <section class="border-border bg-surface/40 flex flex-col gap-3 rounded border p-4 font-mono text-xs">
        <h2 class="text-foreground-muted text-[10px] tracking-widest uppercase">maintenance · notion dedup</h2>
        <p class="text-foreground-muted">
            scans your notion database, scores duplicate usernames, and archives all but the best entry per group.
        </p>
        <form method="POST" action="?/dedup" use:enhance class="flex flex-wrap items-center gap-3">
            <label class="flex items-center gap-2">
                <input type="checkbox" name="dryRun" value="true" checked />
                <span>dry run · preview only</span>
            </label>
            <button
                type="submit"
                class="border-info/40 text-info hover:bg-info/10 rounded-sm border px-3 py-1 tracking-widest uppercase"
            >
                run dedup
            </button>
        </form>
    </section>

    <!-- Reset -->
    <section class="border-danger/40 bg-danger/5 flex flex-col gap-3 rounded border p-4 font-mono text-xs">
        <h2 class="text-danger text-[10px] tracking-widest uppercase">danger zone · reset</h2>
        <p class="text-foreground-muted">
            deletes all settings (including encrypted notion token). leads and jobs are preserved.
        </p>
        <form method="POST" action="?/reset" use:enhance>
            <button
                type="submit"
                class="border-danger/40 text-danger hover:bg-danger/10 rounded-sm border px-3 py-1 tracking-widest uppercase"
                onclick={(e) => {
                    if (!confirm("reset settings? this cannot be undone.")) e.preventDefault();
                }}
            >
                reset settings
            </button>
        </form>
    </section>
</div>
