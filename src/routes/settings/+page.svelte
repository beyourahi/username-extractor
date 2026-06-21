<script lang="ts">
    import { untrack, onMount } from "svelte";
    import { superForm } from "sveltekit-superforms";
    import { toast } from "svelte-sonner";
    import { enhance } from "$app/forms";
    import { invalidateAll } from "$app/navigation";
    import { browser } from "$app/environment";
    import { authClient } from "$lib/auth-client";
    import {
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
    import { Heading, cn, inputBase } from "$lib/ds";
    import PageHeader from "$lib/components/PageHeader.svelte";
    import Button from "$lib/components/Button.svelte";
    import Switch from "$lib/components/Switch.svelte";
    import Field from "$lib/components/Field.svelte";
    import TextInput from "$lib/components/TextInput.svelte";
    import Spinner from "$lib/components/Spinner.svelte";
    import type { Component, Snippet } from "svelte";

    let { data } = $props();

    const maskedToken = $derived(data.maskedToken ?? "");
    const maskedCloudflareToken = $derived(data.maskedCloudflareToken ?? "");
    const cloudflareConnected = $derived(Boolean(maskedCloudflareToken && maskedCloudflareToken !== "(decrypt error)"));
    const DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.6";

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
        const cur = $form.cloudflareModel;
        if (cur && cur !== DEFAULT_MODEL && !ids.has(cur)) {
            opts.push({ id: cur, label: `${cur.replace(/^@cf\//, "")} · experimental` });
        }
        return opts;
    });

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

{#snippet section(icon: Component<{ size?: number; class?: string }>, title: string, subtitle: string, body: Snippet)}
    {@const Ic = icon}
    <section class="border-hair bg-card overflow-hidden rounded-lg border">
        <header class="border-hair border-b p-4 sm:p-5">
            <div class="flex items-center gap-3">
                <span class="bg-ink-2 border-hair flex h-8 w-8 items-center justify-center rounded-md border">
                    <Ic size={14} class="text-ink-muted" />
                </span>
                <div>
                    <Heading as="h2" size="title-sm" weight={560}>{title}</Heading>
                    <p class="text-ink-muted text-caption mt-1">{subtitle}</p>
                </div>
            </div>
        </header>
        <div class="px-4 sm:px-5">{@render body()}</div>
    </section>
{/snippet}

<div class="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-8 pb-8 sm:px-6 sm:pt-10">
    <PageHeader title="Settings" subtitle="Defaults, Notion connection, and cleanup tools." />

    <form method="POST" action="?/save" use:enhanceForm class="flex flex-col gap-8">
        {#snippet extractionBody()}
            <div class="flex items-start justify-between gap-3 py-3">
                <div>
                    <p class="text-foreground text-sm font-medium">Diagnostics by default</p>
                    <p class="text-ink-muted mt-1 text-xs text-pretty">
                        Save the raw AI response alongside each result so you can review it later.
                    </p>
                </div>
                <Switch
                    checked={$form.diagnosticsDefault}
                    onchange={(v) => ($form.diagnosticsDefault = v)}
                    ariaLabel="Diagnostics"
                />
                <input type="hidden" name="diagnosticsDefault" value={$form.diagnosticsDefault ? "true" : "false"} />
            </div>
            <div class="border-hair border-t"></div>
            <div class="flex items-center justify-between gap-3 py-3">
                <div>
                    <p class="text-foreground text-sm font-medium">Daily image quota</p>
                    <p class="text-ink-muted mt-0.5 text-xs">0 = unlimited. Billed to your Cloudflare account.</p>
                </div>
                <div class="w-28">
                    <TextInput
                        type="number"
                        name="dailyImageQuota"
                        bind:value={$form.dailyImageQuota}
                        min={0}
                        max={1000000}
                        class="text-right"
                    />
                    {#if $errors.dailyImageQuota}
                        <p class="text-tier-failed-fg text-caption mt-1 text-pretty">{$errors.dailyImageQuota}</p>
                    {/if}
                </div>
            </div>
        {/snippet}

        {@render section(Sparkles, "Extraction", "Defaults applied to every new job.", extractionBody)}

        {#snippet cloudflareBody()}
            <div class="space-y-4 py-3">
                <Field
                    label="API token"
                    hint={cloudflareConnected
                        ? `Stored: ${maskedCloudflareToken} — leave blank to keep.`
                        : "An API token with the Account · Workers AI · Read permission. Stored securely."}
                >
                    <TextInput
                        type="password"
                        name="cloudflareToken"
                        bind:value={$form.cloudflareToken}
                        placeholder={maskedCloudflareToken || "v1.0-…"}
                        autocomplete="off"
                    />
                </Field>
                <Field label="Account ID" hint="Right sidebar of any account page in the Cloudflare dashboard.">
                    <TextInput
                        name="cloudflareAccountId"
                        bind:value={$form.cloudflareAccountId}
                        placeholder="0123456789abcdef…"
                    />
                </Field>
                <p class="text-ink-muted text-caption leading-relaxed text-pretty">
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
            </div>
            <div class="border-hair border-t"></div>
            <div class="flex items-center justify-between gap-3 py-3">
                <div class="min-w-0">
                    <p class="text-foreground text-sm font-medium">Image model</p>
                    <p class="text-ink-muted mt-0.5 text-xs text-pretty">
                        Kimi K2.6 is tested and recommended. Others are experimental and may be less reliable.
                    </p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        onclick={refreshModels}
                        disabled={refreshingModels || !cloudflareConnected}
                        title="Refresh model list"
                        aria-label="Refresh models"
                        class="text-ink-muted hover:text-foreground touch-manipulation transition-colors disabled:opacity-40"
                    >
                        <RefreshCw size={13} class={refreshingModels ? "animate-spin" : ""} />
                    </button>
                    <div class="w-56">
                        <select
                            name="cloudflareModel"
                            bind:value={$form.cloudflareModel}
                            class={cn(inputBase, "text-caption px-2.5 py-2")}
                        >
                            {#each modelOptions as opt (opt.id)}
                                <option value={opt.id}>{opt.label}</option>
                            {/each}
                        </select>
                    </div>
                </div>
            </div>
        {/snippet}

        {@render section(
            Cloud,
            "Cloudflare account",
            "Required — extractions run on your own Cloudflare account.",
            cloudflareBody
        )}

        {#snippet notionBody()}
            <div class="space-y-4 py-3">
                <Field
                    label="Integration token"
                    hint={maskedToken
                        ? `Stored: ${maskedToken} — leave blank to keep.`
                        : "Stored securely. You won't see it again after saving."}
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
            <div class="border-hair border-t"></div>
            <div class="flex items-start justify-between gap-3 py-3">
                <div>
                    <p class="text-foreground text-sm font-medium">Auto-sync verified leads</p>
                    <p class="text-ink-muted mt-1 text-xs text-pretty">
                        High- and medium-confidence results are sent to Notion automatically as a job runs.
                    </p>
                </div>
                <Switch
                    checked={$form.notionAutoSync}
                    onchange={(v) => ($form.notionAutoSync = v)}
                    ariaLabel="Auto sync"
                />
                <input type="hidden" name="notionAutoSync" value={$form.notionAutoSync ? "true" : "false"} />
            </div>
            <div class="border-hair border-t"></div>
            <div class="flex items-start justify-between gap-3 py-3">
                <div>
                    <p class="text-foreground text-sm font-medium">Skip Instagram profile check</p>
                    <p class="text-ink-muted mt-1 text-xs text-pretty">
                        Trust extracted usernames without checking the profile exists — faster, but lets dead links
                        through.
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
            <div class="border-hair border-t"></div>
            <div class="flex items-center justify-between gap-3 py-3">
                <div>
                    <p class="text-foreground text-sm font-medium">Wait between profile checks (ms)</p>
                    <p class="text-ink-muted mt-0.5 text-xs">Wait time between Instagram profile checks (ms).</p>
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
            <div class="border-hair border-t"></div>
            <div class="flex items-center justify-between gap-3 py-3">
                <div>
                    <p class="text-foreground text-sm font-medium">When merging duplicates, keep</p>
                    <p class="text-ink-muted mt-0.5 text-xs text-pretty">
                        Which entry to keep when merging duplicate usernames in Notion.
                    </p>
                </div>
                <div class="w-36">
                    <select
                        name="dedupKeepStrategy"
                        bind:value={$form.dedupKeepStrategy}
                        class={cn(inputBase, "px-2.5 py-2 text-xs")}
                    >
                        <option value="best">Best score</option>
                        <option value="oldest">Oldest</option>
                        <option value="newest">Newest</option>
                    </select>
                </div>
            </div>
        {/snippet}

        {@render section(FileText, "Notion", "Connect Notion to send verified usernames to your database.", notionBody)}

        <div
            class="border-hair bg-card/85 sticky bottom-4 z-30 flex items-center justify-between gap-3 rounded-lg border p-3 backdrop-blur-md"
        >
            <div class="text-ink-muted flex items-center gap-2 text-xs">
                {#if $submitting}
                    <Spinner size="sm" color="brand" /> Saving…
                {:else if $message}
                    <Check size={12} class="text-brand" />
                    <span class="text-brand">Saved</span>
                {:else}
                    <span>Changes apply to new jobs.</span>
                {/if}
            </div>
            <div class="flex items-center gap-2">
                <Button type="submit" variant="brand" size="sm" disabled={$submitting}>
                    {$submitting ? "Saving…" : "Save changes"}
                </Button>
            </div>
        </div>
    </form>

    {#snippet passkeysBody()}
        <div class="flex flex-col gap-3 py-3">
            {#if !webauthnAvailable}
                <p class="text-ink-muted text-xs text-pretty">
                    This browser can't use Face ID / Touch ID. Open the app on a device with Face ID, Touch ID, or a
                    fingerprint sensor.
                </p>
            {:else}
                {#if passkeysLoading}
                    <div class="text-ink-muted flex items-center gap-2 py-2 text-xs">
                        <Spinner size="sm" color="brand" /> Loading…
                    </div>
                {:else if passkeys.length === 0}
                    <p class="text-ink-muted text-xs text-pretty">
                        Not set up yet. Add Face ID / Touch ID to sign in without Google.
                    </p>
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
                                            <p class="text-ink-muted text-caption">Added {formatDate(pk.createdAt)}</p>
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
                <div class="flex flex-wrap items-center gap-2 pt-1">
                    <Button type="button" variant="brand" size="sm" disabled={passkeyBusy} onclick={() => addPasskey()}>
                        <Fingerprint size={13} /> Set up Face ID / Touch ID
                    </Button>
                </div>
            {/if}
        </div>
    {/snippet}

    {@render section(
        Fingerprint,
        "Face ID / Touch ID",
        "Sign in with Face ID, Touch ID, or your fingerprint instead of Google.",
        passkeysBody
    )}

    {#snippet maintenanceBody()}
        <div class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p class="text-foreground text-sm font-medium">Remove Notion duplicates</p>
                <p class="text-ink-muted mt-1 text-xs text-pretty">
                    Scans your whole database, keeps one of each username, and archives the rest based on your rule.
                </p>
            </div>
            <form method="POST" action="?/dedup" use:enhance class="flex items-center gap-2">
                <label class="text-ink-muted text-caption inline-flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" name="dryRun" value="true" checked class="cursor-pointer" />
                    Dry run
                </label>
                <Button type="submit" variant="brand" size="sm">Remove duplicates</Button>
            </form>
        </div>
        <div class="border-hair border-t"></div>
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
                <p class="text-foreground text-sm font-medium">Import from markdown</p>
                <p class="text-ink-muted mt-1 text-xs text-pretty">
                    Paste the contents of your old <span class="font-mono">verified_usernames.md</span> file.
                </p>
            </div>
            <textarea
                name="markdown"
                rows="5"
                bind:value={legacyMarkdown}
                placeholder="Paste markdown…"
                class={cn(inputBase, "text-xs")}
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
        <div class="border-hair border-t"></div>
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
                <p class="text-foreground text-sm font-medium">Import from Notion</p>
                <p class="text-ink-muted mt-1 text-xs text-pretty">
                    Bring an existing Notion database into Leads. Safe to run more than once.
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

    {@render section(RefreshCw, "Maintenance", "Tools for tidying up and importing old data.", maintenanceBody)}

    {#snippet resetBody()}
        <div class="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
                <p class="text-tier-failed-fg text-sm font-medium">Reset to defaults</p>
                <p class="text-ink-muted mt-1 text-xs text-pretty">
                    Clears your settings, including your saved Notion and Cloudflare tokens. Jobs and leads are
                    unaffected.
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
</div>
