<script lang="ts">
    import { untrack, onMount } from "svelte";
    import { superForm } from "sveltekit-superforms";
    import { toast } from "svelte-sonner";
    import { enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import { browser } from "$app/environment";
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
        metaBase
    } from "$lib/ds";
    import Button from "$lib/components/Button.svelte";
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
        message: cfMessage,
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

    // ── Face ID / Touch ID (WebAuthn platform biometric: Face ID / Touch ID / fingerprint) ──
    type PasskeyRow = { id: string; name?: string | null; createdAt?: string | Date | null };
    let passkeys = $state<PasskeyRow[]>([]);
    let passkeysLoading = $state(true);
    let passkeyBusy = $state(false);
    let webauthnAvailable = $state(false);

    // Friendly default name from the UA — stored as the passkey label.
    function deviceLabel() {
        const ua = browser ? navigator.userAgent : "";
        if (/iPhone|iPad|iPod/.test(ua)) return "iPhone (Face ID / Touch ID)";
        if (/Macintosh/.test(ua)) return "Mac (Touch ID)";
        if (/Android/.test(ua)) return "Android (fingerprint / face)";
        if (/Windows/.test(ua)) return "Windows Hello";
        return "This device";
    }

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

    onMount(() => {
        webauthnAvailable = typeof window !== "undefined" && !!window.PublicKeyCredential;
        if (webauthnAvailable) loadPasskeys();
        else passkeysLoading = false;
    });

    // Always registers the device's built-in biometric (Face ID / Touch ID / fingerprint)
    // via authenticatorAttachment: "platform".
    async function addPasskey() {
        passkeyBusy = true;
        try {
            const res = await authClient.passkey.addPasskey({
                name: deviceLabel(),
                authenticatorAttachment: "platform"
            });
            if (res?.error) toast.error(res.error.message || "Couldn't set up Face ID / Touch ID.");
            else {
                toast.success("Face ID / Touch ID is set up.");
                await loadPasskeys();
            }
        } catch {
            toast.error("Setup was cancelled.");
        } finally {
            passkeyBusy = false;
        }
    }

    async function removePasskey(id: string) {
        if (!confirm("Remove Face ID / Touch ID? You won't be able to sign in with it anymore.")) return;
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
    class="mx-auto flex w-full max-w-[var(--settings-max)] grow flex-col gap-10 px-[var(--content-x)] py-10 outline-none sm:py-14"
>
    <Cta href="/" variant="secondary" arrow={false} class="bg-card text-caption w-fit px-5 py-2.5">
        <span class="inline-flex items-center gap-2">
            <ArrowLeft class="size-4" aria-hidden="true" />
            Back to extractor
        </span>
    </Cta>

    <div class="flex flex-col gap-3">
        <Eyebrow>Settings</Eyebrow>
        <Heading as="h1" size="title-lg" weight={600}>Settings</Heading>
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
                    <Cta type="submit" variant="primary" arrow={false} disabled={$exSubmitting}>
                        {$exSubmitting ? "Saving…" : "Save"}
                    </Cta>
                </SettingsActions>
            </SettingsSection>
        </form>

        <form method="POST" action="?/saveCloudflare" use:cfEnhance>
            <SettingsSection
                title="Cloudflare account"
                subtitle="Required — extractions run on your own Cloudflare account."
                icon={Cloud}
            >
                <SettingsRow
                    label="API token"
                    hint={cloudflareConnected
                        ? `Stored: ${maskedCloudflareToken} — leave blank to keep.`
                        : "An API token with the Account · Workers AI · Read permission. Stored securely."}
                    htmlFor="cloudflareToken"
                    stacked
                >
                    <TextInput
                        id="cloudflareToken"
                        type="password"
                        name="cloudflareToken"
                        bind:value={$cfForm.cloudflareToken}
                        placeholder={maskedCloudflareToken || "v1.0-…"}
                        autocomplete="off"
                        class="w-full"
                    />
                </SettingsRow>

                <SettingsRow
                    label="Account ID"
                    hint="Right sidebar of any account page in the Cloudflare dashboard."
                    htmlFor="cloudflareAccountId"
                    stacked
                >
                    <TextInput
                        id="cloudflareAccountId"
                        name="cloudflareAccountId"
                        bind:value={$cfForm.cloudflareAccountId}
                        placeholder="0123456789abcdef…"
                        class="w-full"
                    />
                </SettingsRow>

                <p class={helperBase}>
                    Extractions run on <span class="text-foreground">your</span> own Cloudflare account. Create a token
                    at
                    <a
                        href="https://dash.cloudflare.com/profile/api-tokens"
                        target="_blank"
                        rel="noreferrer"
                        class="text-brand underline underline-offset-2">dash.cloudflare.com/profile/api-tokens</a
                    >
                    → Create Custom Token → permission
                    <span class="text-foreground font-mono">Account · Workers AI · Read</span>.
                </p>

                <SettingsRow
                    label="Image model"
                    hint="Kimi K2.6 is tested and recommended. Others are experimental and may be less reliable."
                    htmlFor="cloudflareModel"
                >
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
                            id="cloudflareModel"
                            name="cloudflareModel"
                            bind:value={$cfForm.cloudflareModel}
                            items={modelOptions.map((opt) => ({ value: opt.id, label: opt.label }))}
                            placeholder="Select a model"
                            class="w-full"
                        />
                    </div>
                </SettingsRow>

                <SettingsActions>
                    {#snippet status()}
                        {#if $cfSubmitting}
                            Saving…
                        {:else if $cfMessage}
                            <Check size={12} /> Saved
                        {:else if cloudflareConnected}
                            <span>Connected.</span>
                        {:else}
                            <span>Not connected yet.</span>
                        {/if}
                    {/snippet}
                    <Cta type="submit" variant="primary" arrow={false} disabled={$cfSubmitting}>
                        {$cfSubmitting ? "Saving…" : "Save"}
                    </Cta>
                </SettingsActions>
            </SettingsSection>
        </form>

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
                    label="Skip Instagram profile check"
                    hint="Trust extracted usernames without checking the profile exists — faster, but lets dead links through."
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
                    label="Wait between profile checks (ms)"
                    hint="Wait time between Instagram profile checks (ms)."
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
                    <Cta type="submit" variant="primary" arrow={false} disabled={$nSubmitting}>
                        {$nSubmitting ? "Saving…" : "Save"}
                    </Cta>
                </SettingsActions>
            </SettingsSection>
        </form>
    </div>

    <SettingsSection
        title="Face ID / Touch ID"
        subtitle="Sign in with Face ID, Touch ID, or your fingerprint instead of Google."
        icon={Fingerprint}
    >
        {#if !webauthnAvailable}
            <p class={helperBase}>
                This browser can't use Face ID / Touch ID. Open the app on a device with Face ID, Touch ID, or a
                fingerprint sensor.
            </p>
        {:else}
            {#if passkeysLoading}
                <div class={cn(helperBase, "flex items-center gap-2")}>
                    <Spinner size="sm" color="brand" /> Loading…
                </div>
            {:else if passkeys.length === 0}
                <p class={helperBase}>Not set up yet. Add Face ID / Touch ID to sign in without Google.</p>
            {:else}
                <ul class="flex flex-col gap-2">
                    {#each passkeys as pk (pk.id)}
                        <li
                            class="border-hair bg-ink-2/40 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5"
                        >
                            <div class="flex min-w-0 items-center gap-2.5">
                                <Fingerprint size={15} class="text-brand shrink-0" />
                                <div class="min-w-0">
                                    <p class="text-foreground truncate text-sm font-medium">
                                        {pk.name || "Face ID / Touch ID"}
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
                                aria-label="Remove Face ID / Touch ID"
                                class="text-ink-muted hover:text-tier-failed-fg shrink-0 touch-manipulation transition-colors disabled:opacity-40"
                            >
                                <Trash2 size={14} />
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
            <SettingsActions>
                <Cta variant="primary" arrow={false} disabled={passkeyBusy} onclick={() => addPasskey()}>
                    <span class="inline-flex items-center gap-2"
                        ><Fingerprint size={13} /> Set up Face ID / Touch ID</span
                    >
                </Cta>
            </SettingsActions>
        {/if}
    </SettingsSection>

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
                    <Cta type="submit" variant="primary" arrow={false}>Remove duplicates</Cta>
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
                class={inputBase}
            ></textarea>
            <SettingsActions>
                <Cta
                    type="submit"
                    variant="secondary"
                    arrow={false}
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
                    variant="secondary"
                    arrow={false}
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
                <Button type="submit" variant="destructive" size="sm">
                    <Trash2 size={13} /> Reset settings
                </Button>
            </SettingsActions>
        </form>
    </SettingsSection>
</div>
