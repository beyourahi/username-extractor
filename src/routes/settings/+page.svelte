<script lang="ts">
    import { untrack, onMount } from "svelte";
    import { superForm } from "sveltekit-superforms";
    import { toast } from "svelte-sonner";
    import { enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import { authClient } from "$lib/auth-client";
    import {
        ArrowLeft,
        Sparkles,
        RefreshCw,
        Upload,
        Trash2,
        FileText,
        Check,
        AlertTriangle,
        Cloud,
        Fingerprint
    } from "@lucide/svelte";
    import {
        Heading,
        Eyebrow,
        SettingsSection,
        SettingsRow,
        SettingsActions,
        Cta,
        cn,
        inputBase,
        bodyBase,
        helperBase,
        metaBase,
        isPlatformAuthenticatorAvailable,
        detectPlatform,
        biometricLabel
    } from "$lib/ds";
    import Switch from "$lib/components/Switch.svelte";
    import Select from "$lib/components/Select.svelte";
    import TextInput from "$lib/components/TextInput.svelte";
    import Spinner from "$lib/components/Spinner.svelte";

    let { data } = $props();

    const maskedToken = $derived(data.maskedToken ?? "");
    const maskedCloudflareToken = $derived(data.maskedCloudflareToken ?? "");
    const cloudflareConnected = $derived(Boolean(maskedCloudflareToken && maskedCloudflareToken !== "(decrypt error)"));
    const DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.6";

    // One superForm per section so each card saves itself (matches the sibling tools). Each
    // posts to its own action, which persists ONLY its columns — saving one can't blank another.
    const onUpdated = ({ form: f }: { form: { message?: string } }) => {
        if (f.message) toast.success(f.message);
    };

    const {
        form: exForm,
        errors: exErrors,
        enhance: exEnhance,
        message: exMessage,
        submitting: exSubmitting
    } = superForm(
        untrack(() => data.extractionForm),
        { resetForm: false, onUpdated }
    );

    const {
        form: cfForm,
        enhance: cfEnhance,
        submitting: cfSubmitting
    } = superForm(
        untrack(() => data.cloudflareForm),
        { resetForm: false, onUpdated }
    );

    const {
        form: nForm,
        enhance: nEnhance,
        message: nMessage,
        submitting: nSubmitting
    } = superForm(
        untrack(() => data.notionForm),
        { resetForm: false, onUpdated }
    );

    // Picker options from the account's cached vision models. Always surfaces the
    // recommended default first and the currently-selected id, even if the live list omits it.
    const modelOptions = $derived.by(() => {
        const list = data.models ?? [];
        const ids = new Set(list.map((m) => m.id));
        const opts = list.map((m) => ({
            id: m.id,
            label:
                m.id === DEFAULT_MODEL
                    ? `${m.label} · recommended`
                    : `${m.label} · experimental${m.deprecated ? " (deprecated)" : ""}`
        }));
        if (!ids.has(DEFAULT_MODEL)) {
            opts.unshift({ id: DEFAULT_MODEL, label: "moonshotai/kimi-k2.6 · recommended" });
        }
        const cur = $cfForm.cloudflareModel;
        if (cur && cur !== DEFAULT_MODEL && !ids.has(cur)) {
            opts.push({ id: cur, label: `${cur.replace(/^@cf\//, "")} · experimental` });
        }
        return opts;
    });

    // Dry-run toggle for the Notion dedup form. Defaults on; Switch's hidden input
    // submits "true"/"false", matching the server's data.get("dryRun") === "true".
    let dryRun = $state(true);

    let refreshingModels = $state(false);
    async function refreshModels() {
        refreshingModels = true;
        try {
            await fetch("/api/cf/models?refresh=1");
            await invalidateAll();
        } finally {
            refreshingModels = false;
        }
    }

    let legacyMarkdown = $state("");
    let legacyNotionToken = $state("");
    let legacyNotionDatabaseId = $state("");
    let legacyMarkdownSubmitting = $state(false);
    let legacyNotionSubmitting = $state(false);

    // ── Platform biometric (WebAuthn: Face ID / Touch ID / Windows Hello / fingerprint) ──
    // The device-accurate label, resolved from the server platform hint so the first
    // render already shows the right name (no flash); UVPAA confirms real availability.
    const biometricName = $derived(biometricLabel(detectPlatform(data.platformHint)));

    type PasskeyRow = { id: string; name?: string | null; createdAt?: string | Date | null };
    let passkeys = $state<PasskeyRow[]>([]);
    let passkeysLoading = $state(true);
    let passkeyBusy = $state(false);
    let bioSupported = $state(false);

    function formatDate(d: string | Date) {
        const date = typeof d === "string" ? new Date(d) : d;
        return Number.isNaN(date.getTime())
            ? ""
            : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    async function loadPasskeys() {
        passkeysLoading = true;
        try {
            const res = await authClient.passkey.listUserPasskeys();
            passkeys = (res?.data ?? []) as PasskeyRow[];
        } catch {
            passkeys = [];
        } finally {
            passkeysLoading = false;
        }
    }

    onMount(async () => {
        bioSupported = await isPlatformAuthenticatorAvailable();
        if (bioSupported) loadPasskeys();
        else passkeysLoading = false;
    });

    // Always registers the device's built-in biometric (Face ID / Touch ID / fingerprint)
    // via authenticatorAttachment: "platform".
    async function addPasskey() {
        passkeyBusy = true;
        try {
            const res = await authClient.passkey.addPasskey({
                name: biometricName,
                authenticatorAttachment: "platform"
            });
            if (res?.error) toast.error(res.error.message || `Couldn't set up ${biometricName}.`);
            else {
                toast.success(`${biometricName} is set up.`);
                await loadPasskeys();
            }
        } catch {
            toast.error("Setup was cancelled.");
        } finally {
            passkeyBusy = false;
        }
    }

    async function removePasskey(id: string) {
        if (!confirm(`Remove ${biometricName}? You won't be able to sign in with it anymore.`)) return;
        passkeyBusy = true;
        try {
            const res = await authClient.passkey.deletePasskey({ id });
            if (res?.error) toast.error(res.error.message || "Couldn't remove it.");
            else {
                toast.success("Removed.");
                await loadPasskeys();
            }
        } catch {
            toast.error("Couldn't remove it.");
        } finally {
            passkeyBusy = false;
        }
    }
</script>

<div
    class="mx-auto flex w-full max-w-[var(--settings-max)] grow flex-col gap-10 px-[var(--content-pad)] py-10 outline-none sm:py-14"
>
    <div class="flex justify-end">
        <Cta
            href="/"
            variant="secondary"
            size="sm"
            arrow={false}
            class="bg-card w-full justify-center whitespace-nowrap sm:w-auto"
        >
            <span class="inline-flex items-center gap-2"
                ><ArrowLeft class="size-4" aria-hidden="true" /> Back to app</span
            >
        </Cta>
    </div>

    <div class="flex flex-col gap-2.5">
        <Eyebrow>Settings</Eyebrow>
        <Heading as="h1" size="title-lg" weight={600} class="lg:text-title">Settings</Heading>
        <p class={cn(bodyBase, "text-ink-muted max-w-prose")}>Defaults, Notion connection, and cleanup tools.</p>
    </div>

    <div class="flex flex-col gap-8">
        <form method="POST" action="?/saveExtraction" use:exEnhance>
            <SettingsSection title="Extraction" subtitle="Defaults applied to every new job." icon={Sparkles}>
                <SettingsRow
                    label="Diagnostics by default"
                    hint="Save the raw AI response alongside each result so you can review it later."
                >
                    <div class="flex w-full md:justify-start">
                        <Switch
                            checked={$exForm.diagnosticsDefault}
                            onchange={(v) => ($exForm.diagnosticsDefault = v)}
                            ariaLabel="Diagnostics"
                        />
                    </div>
                    <input
                        type="hidden"
                        name="diagnosticsDefault"
                        value={$exForm.diagnosticsDefault ? "true" : "false"}
                    />
                </SettingsRow>

                <SettingsRow
                    label="Daily image quota"
                    hint="0 = unlimited. Billed to your Cloudflare account."
                    htmlFor="dailyImageQuota"
                >
                    <TextInput
                        id="dailyImageQuota"
                        type="number"
                        name="dailyImageQuota"
                        bind:value={$exForm.dailyImageQuota}
                        min={0}
                        max={1000000}
                        class="w-full"
                    />
                    {#if $exErrors.dailyImageQuota}
                        <p class={cn(helperBase, "text-tier-failed-fg mt-1")}>{$exErrors.dailyImageQuota}</p>
                    {/if}
                </SettingsRow>

                <SettingsActions>
                    {#snippet status()}
                        {#if $exSubmitting}
                            Saving…
                        {:else if $exMessage}
                            <Check size={12} /> Saved
                        {:else}
                            <span>Applied to every new job.</span>
                        {/if}
                    {/snippet}
                    <Cta
                        type="submit"
                        size="sm"
                        variant="primary"
                        arrow={false}
                        disabled={$exSubmitting}
                        class="w-full justify-center whitespace-nowrap sm:w-auto"
                    >
                        {$exSubmitting ? "Saving…" : "Save"}
                    </Cta>
                </SettingsActions>
            </SettingsSection>
        </form>

        <SettingsSection
            title="Cloudflare account"
            subtitle="Bring your own Cloudflare account to power the AI features."
            icon={Cloud}
        >
            {#snippet header()}
                <span
                    class={cn(
                        "text-micro inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono tracking-[0.14em] whitespace-nowrap uppercase",
                        cloudflareConnected ? "border-brand/40 text-foreground" : "border-hair text-ink-muted"
                    )}
                >
                    <span class={cn("size-1.5 rounded-full", cloudflareConnected ? "bg-brand" : "bg-ink-muted")}></span>
                    {cloudflareConnected ? "Connected" : "Not connected"}
                </span>
            {/snippet}

            <form method="POST" action="?/saveCloudflare" use:cfEnhance>
                <div class="flex flex-col gap-6">
                    <SettingsRow label="API token" htmlFor="cf-token" stacked>
                        <TextInput
                            id="cf-token"
                            type="password"
                            name="cloudflareToken"
                            bind:value={$cfForm.cloudflareToken}
                            placeholder={maskedCloudflareToken || "v1.0-…"}
                            autocomplete="off"
                            class="w-full"
                        />
                        {#if cloudflareConnected}
                            <p class={cn(helperBase, "mt-1")}>
                                Stored: <span class="text-foreground font-mono break-all"
                                    >{maskedCloudflareToken}</span
                                >
                                — leave blank to keep it.
                            </p>
                        {:else}
                            <p class={cn(helperBase, "mt-1")}>
                                An API token with the <span class="text-foreground">Account · Workers AI · Read</span>
                                permission. Stored securely. You won't see it again after saving.
                            </p>
                        {/if}
                    </SettingsRow>

                    <SettingsRow label="Account ID" htmlFor="cf-account" stacked>
                        <TextInput
                            id="cf-account"
                            name="cloudflareAccountId"
                            bind:value={$cfForm.cloudflareAccountId}
                            placeholder="0123456789abcdef…"
                            class="w-full"
                        />
                        <p class={cn(helperBase, "mt-1")}>
                            Found in the right sidebar of any account page in the Cloudflare dashboard.
                        </p>
                    </SettingsRow>

                    <SettingsRow label="Model" htmlFor="cf-model">
                        <div class="flex w-full items-center gap-2">
                            <button
                                type="button"
                                onclick={refreshModels}
                                disabled={refreshingModels || !cloudflareConnected}
                                title="Refresh model list"
                                aria-label="Refresh models"
                                class="text-ink-muted hover:text-foreground shrink-0 touch-manipulation transition-colors disabled:opacity-40"
                            >
                                <RefreshCw size={13} class={refreshingModels ? "animate-spin" : ""} />
                            </button>
                            <Select
                                id="cf-model"
                                name="cloudflareModel"
                                bind:value={$cfForm.cloudflareModel}
                                items={modelOptions.map((opt) => ({ value: opt.id, label: opt.label }))}
                                placeholder="Select a model"
                                class="w-full"
                            />
                        </div>
                        <p class={cn(helperBase, "mt-1")}>
                            Kimi K2.6 is recommended. Others are experimental and may be less reliable.
                        </p>
                    </SettingsRow>

                    <SettingsActions>
                        {#snippet status()}
                            <p class={cn(helperBase, "max-w-prose")}>
                                Create a token at
                                <a
                                    href="https://dash.cloudflare.com/profile/api-tokens"
                                    target="_blank"
                                    rel="noreferrer"
                                    class="text-foreground break-all underline underline-offset-2"
                                    >dash.cloudflare.com/profile/api-tokens</a
                                >
                                -> Create Custom Token -> permission
                                <span class="text-foreground font-mono">Account · Workers AI · Read</span>.
                            </p>
                        {/snippet}
                        <Cta
                            type="submit"
                            size="sm"
                            variant="primary"
                            arrow={false}
                            disabled={$cfSubmitting}
                            class="w-full justify-center whitespace-nowrap sm:w-auto"
                        >
                            {$cfSubmitting ? "Saving…" : "Save"}
                        </Cta>
                    </SettingsActions>
                </div>
            </form>

            {#if cloudflareConnected}
                <div
                    class="border-hair flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div class="min-w-0">
                        <p class={cn(bodyBase, "font-medium")}>Disconnect</p>
                        <p class={cn(helperBase, "mt-1 max-w-prose")}>
                            Removes your saved token and account ID. The AI features stay off until you reconnect.
                        </p>
                    </div>
                    <form
                        method="POST"
                        action="?/reset"
                        class="shrink-0"
                        use:enhance={() =>
                            async ({ result }) => {
                                if (result.type === "success") {
                                    toast.success("Cloudflare account disconnected.");
                                    location.reload();
                                } else if (result.type === "failure") {
                                    toast.error((result.data?.error as string | undefined) ?? "Couldn't disconnect.");
                                }
                            }}
                        onsubmit={(e) => {
                            if (
                                !confirm(
                                    "Disconnect your Cloudflare account? The AI features will stop working until you reconnect."
                                )
                            )
                                e.preventDefault();
                        }}
                    >
                        <Cta
                            type="submit"
                            size="sm"
                            variant="secondary"
                            arrow={false}
                            class="text-destructive hover:border-destructive w-full justify-center whitespace-nowrap sm:w-auto"
                        >
                            <span class="inline-flex items-center gap-2"
                                ><Trash2 class="size-3.5" aria-hidden="true" /> Disconnect</span
                            >
                        </Cta>
                    </form>
                </div>
            {/if}
        </SettingsSection>

        <form method="POST" action="?/saveNotion" use:nEnhance>
            <SettingsSection
                title="Notion"
                subtitle="Connect Notion to send verified usernames to your database."
                icon={FileText}
            >
                <SettingsRow
                    label="Integration token"
                    hint={maskedToken
                        ? `Stored: ${maskedToken} — leave blank to keep.`
                        : "Stored securely. You won't see it again after saving."}
                    htmlFor="notionToken"
                    stacked
                >
                    <TextInput
                        id="notionToken"
                        type="password"
                        name="notionToken"
                        bind:value={$nForm.notionToken}
                        placeholder={maskedToken || "secret_…"}
                        autocomplete="off"
                        class="w-full"
                    />
                </SettingsRow>

                <SettingsRow
                    label="Database ID"
                    hint="Found in the URL of your Notion database."
                    htmlFor="notionDatabaseId"
                    stacked
                >
                    <TextInput
                        id="notionDatabaseId"
                        name="notionDatabaseId"
                        bind:value={$nForm.notionDatabaseId}
                        class="w-full"
                    />
                </SettingsRow>

                <SettingsRow
                    label="Auto-sync verified leads"
                    hint="High- and medium-confidence results are sent to Notion automatically as a job runs."
                >
                    <div class="flex w-full md:justify-start">
                        <Switch
                            checked={$nForm.notionAutoSync}
                            onchange={(v) => ($nForm.notionAutoSync = v)}
                            ariaLabel="Auto sync"
                        />
                    </div>
                    <input type="hidden" name="notionAutoSync" value={$nForm.notionAutoSync ? "true" : "false"} />
                </SettingsRow>

                <SettingsRow
                    label="Skip profile existence check"
                    hint="Trust extracted usernames without checking the profile exists — faster, but lets dead links through. Instagram, TikTok & YouTube are checked; Facebook is always trusted."
                >
                    <div class="flex w-full md:justify-start">
                        <Switch
                            checked={$nForm.notionSkipValidation}
                            onchange={(v) => ($nForm.notionSkipValidation = v)}
                            ariaLabel="Skip validation"
                        />
                    </div>
                    <input
                        type="hidden"
                        name="notionSkipValidation"
                        value={$nForm.notionSkipValidation ? "true" : "false"}
                    />
                </SettingsRow>

                <SettingsRow
                    label="Delay between existence checks (ms)"
                    hint="Wait time between profile existence checks (ms)."
                    htmlFor="notionValidationDelayMs"
                >
                    <TextInput
                        id="notionValidationDelayMs"
                        type="number"
                        name="notionValidationDelayMs"
                        bind:value={$nForm.notionValidationDelayMs}
                        min={0}
                        max={60000}
                        class="w-full"
                    />
                </SettingsRow>

                <SettingsRow
                    label="When merging duplicates, keep"
                    hint="Which entry to keep when merging duplicate usernames in Notion."
                    htmlFor="dedupKeepStrategy"
                >
                    <Select
                        id="dedupKeepStrategy"
                        name="dedupKeepStrategy"
                        bind:value={$nForm.dedupKeepStrategy}
                        items={[
                            { value: "best", label: "Best score" },
                            { value: "oldest", label: "Oldest" },
                            { value: "newest", label: "Newest" }
                        ]}
                        placeholder="Keep strategy"
                        class="w-full"
                    />
                </SettingsRow>

                <SettingsActions>
                    {#snippet status()}
                        {#if $nSubmitting}
                            Saving…
                        {:else if $nMessage}
                            <Check size={12} /> Saved
                        {:else}
                            <span>Applied when syncing to Notion.</span>
                        {/if}
                    {/snippet}
                    <Cta
                        type="submit"
                        size="sm"
                        variant="primary"
                        arrow={false}
                        disabled={$nSubmitting}
                        class="w-full justify-center whitespace-nowrap sm:w-auto"
                    >
                        {$nSubmitting ? "Saving…" : "Save"}
                    </Cta>
                </SettingsActions>
            </SettingsSection>
        </form>
    </div>

    {#if bioSupported}
        <SettingsSection
            title={biometricName}
            subtitle={"Sign in with " + biometricName + " instead of Google."}
            icon={Fingerprint}
        >
            {#if passkeysLoading}
                <div class={cn(helperBase, "flex items-center gap-2")}>
                    <Spinner size="sm" color="brand" /> Loading…
                </div>
            {:else if passkeys.length === 0}
                <p class={helperBase}>Not set up yet. Add {biometricName} to sign in without Google.</p>
            {:else}
                <ul class="flex flex-col gap-2">
                    {#each passkeys as pk (pk.id)}
                        <li
                            class="border-hair bg-ink-2/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                        >
                            <div class="flex min-w-0 items-center gap-2.5">
                                <Fingerprint size={15} class="text-brand shrink-0" />
                                <div class="min-w-0">
                                    <p class="text-foreground truncate text-sm font-medium">
                                        {pk.name || biometricName}
                                    </p>
                                    {#if pk.createdAt && formatDate(pk.createdAt)}
                                        <p class={metaBase}>Added {formatDate(pk.createdAt)}</p>
                                    {/if}
                                </div>
                            </div>
                            <button
                                type="button"
                                onclick={() => removePasskey(pk.id)}
                                disabled={passkeyBusy}
                                aria-label={"Remove " + biometricName}
                                class="text-ink-muted hover:text-tier-failed-fg shrink-0 touch-manipulation transition-colors disabled:opacity-40"
                            >
                                <Trash2 size={14} />
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
            <SettingsActions>
                <Cta
                    size="sm"
                    variant="primary"
                    arrow={false}
                    disabled={passkeyBusy}
                    onclick={() => addPasskey()}
                    class="w-full justify-center whitespace-nowrap sm:w-auto"
                >
                    <span class="inline-flex items-center gap-2"><Fingerprint size={13} /> Set up {biometricName}</span>
                </Cta>
            </SettingsActions>
        </SettingsSection>
    {/if}

    <SettingsSection title="Maintenance" subtitle="Tools for tidying up and importing old data." icon={RefreshCw}>
        <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1">
                <p class="text-foreground text-sm font-medium">Remove Notion duplicates</p>
                <p class={helperBase}>
                    Scans your whole database, keeps one of each username, and archives the rest based on your rule.
                </p>
            </div>
            <form method="POST" action="?/dedup" use:enhance>
                <SettingsActions>
                    {#snippet status()}
                        <span class={cn(metaBase, "inline-flex items-center gap-2 whitespace-nowrap")}>
                            <Switch
                                id="dryRun"
                                name="dryRun"
                                checked={dryRun}
                                onchange={(v) => (dryRun = v)}
                                ariaLabel="Dry run"
                            />
                            <label for="dryRun" class="cursor-pointer">Dry run</label>
                        </span>
                    {/snippet}
                    <Cta
                        type="submit"
                        size="sm"
                        variant="primary"
                        arrow={false}
                        class="w-full justify-center whitespace-nowrap sm:w-auto">Remove duplicates</Cta
                    >
                </SettingsActions>
            </form>
        </div>

        <form
            method="POST"
            action="?/importLegacy"
            class="flex flex-col gap-3"
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
            <div class="flex flex-col gap-1">
                <p class="text-foreground text-sm font-medium">Import from markdown</p>
                <p class={helperBase}>
                    Paste the contents of your old <span class="font-mono">verified_usernames.md</span> file.
                </p>
            </div>
            <textarea
                name="markdown"
                rows="5"
                bind:value={legacyMarkdown}
                placeholder="Paste markdown…"
                class={inputBase}></textarea>
            <SettingsActions>
                <Cta
                    type="submit"
                    size="sm"
                    variant="secondary"
                    arrow={false}
                    class="w-full justify-center whitespace-nowrap sm:w-auto"
                    disabled={legacyMarkdownSubmitting || legacyMarkdown.trim().length === 0}
                >
                    <span class="inline-flex items-center gap-2">
                        <Upload size={13} />
                        {legacyMarkdownSubmitting ? "Importing…" : "Import markdown"}
                    </span>
                </Cta>
            </SettingsActions>
        </form>

        <form
            method="POST"
            action="?/importLegacy"
            class="flex flex-col gap-3"
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
            <div class="flex flex-col gap-1">
                <p class="text-foreground text-sm font-medium">Import from Notion</p>
                <p class={helperBase}>Bring an existing Notion database into Leads. Safe to run more than once.</p>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
                <TextInput
                    type="password"
                    name="notionToken"
                    bind:value={legacyNotionToken}
                    placeholder="secret_…"
                    autocomplete="off"
                    class="w-full"
                />
                <TextInput
                    name="notionDatabaseId"
                    bind:value={legacyNotionDatabaseId}
                    placeholder="database id"
                    class="w-full"
                />
            </div>
            <SettingsActions>
                <Cta
                    type="submit"
                    size="sm"
                    variant="secondary"
                    arrow={false}
                    class="w-full justify-center whitespace-nowrap sm:w-auto"
                    disabled={legacyNotionSubmitting ||
                        legacyNotionToken.trim().length === 0 ||
                        legacyNotionDatabaseId.trim().length === 0}
                >
                    <span class="inline-flex items-center gap-2">
                        <Upload size={13} />
                        {legacyNotionSubmitting ? "Importing…" : "Import Notion"}
                    </span>
                </Cta>
            </SettingsActions>
        </form>
    </SettingsSection>

    <SettingsSection title="Danger zone" subtitle="Destructive — confirm before clicking." icon={AlertTriangle}>
        <div class="flex flex-col gap-1">
            <p class="text-tier-failed-fg text-sm font-medium">Reset to defaults</p>
            <p class={helperBase}>
                Clears your settings, including your saved Notion and Cloudflare tokens. Jobs and leads are unaffected.
            </p>
        </div>
        <form
            method="POST"
            action="?/reset"
            use:enhance={() =>
                async ({ result }) => {
                    if (result.type === "success") {
                        toast.success("Settings reset to defaults.");
                        location.reload();
                    } else if (result.type === "failure") {
                        toast.error((result.data?.error as string | undefined) ?? "Couldn't reset settings.");
                    }
                }}
            onsubmit={(e) => {
                if (!confirm("Reset settings? This cannot be undone.")) e.preventDefault();
            }}
        >
            <SettingsActions>
                <Cta
                    type="submit"
                    size="sm"
                    variant="secondary"
                    arrow={false}
                    class="text-destructive hover:border-destructive w-full justify-center whitespace-nowrap sm:w-auto"
                >
                    <span class="inline-flex items-center gap-2">
                        <Trash2 size={13} /> Reset settings
                    </span>
                </Cta>
            </SettingsActions>
        </form>
    </SettingsSection>
</div>
