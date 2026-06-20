import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { eq } from "drizzle-orm";

import { getDb, schema } from "$lib/server/db";
import { deriveTokenKey, encryptNotionToken, decryptNotionToken, maskToken } from "$lib/server/crypto";
import { listVisionModels, DEFAULT_VISION_MODEL, type CfModel } from "$lib/server/ai/run-rest";
import { describeCloudflareError } from "$lib/server/ai/errors";
import { settingsSchema } from "$lib/schemas/settings";

/**
 * Settings page server module. Routes:
 *   load            → decrypts the stored Notion token, returns ONLY `maskToken(plain)`
 *                     (the raw secret never leaves the server).
 *   save            → encrypts new token if provided; empty token preserves existing blob
 *                     (CONTRACT enforced in `$lib/schemas/settings.ts`).
 *   reset           → DELETE FROM user_settings (does NOT cascade to jobs/leads).
 *   dedup           → proxies to `/api/notion/dedup`.
 *   importLegacy    → proxies markdown + optional Notion creds to `/api/import/legacy`.
 *
 * INVARIANT: this module is the only place that calls `decryptNotionToken` on
 * a settings load. All other reads use the encrypted blob directly.
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
    const empty = await superValidate(zod4(settingsSchema));
    if (!locals.userId || !platform?.env?.DB) {
        return {
            form: empty,
            maskedToken: "",
            maskedCloudflareToken: "",
            cloudflareAccountId: "",
            cloudflareModel: DEFAULT_VISION_MODEL,
            models: [] as CfModel[]
        };
    }

    const db = getDb(platform);
    const rows = await db
        .select()
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, locals.userId))
        .limit(1);

    const row = rows[0];
    let maskedToken = "";
    if (row?.notionTokenEncrypted && platform.env.NOTION_TOKEN_ENCRYPTION_KEY) {
        try {
            const key = await deriveTokenKey(platform.env.NOTION_TOKEN_ENCRYPTION_KEY);
            const blob =
                row.notionTokenEncrypted instanceof Uint8Array
                    ? row.notionTokenEncrypted
                    : new Uint8Array(row.notionTokenEncrypted as ArrayBuffer);
            const plain = await decryptNotionToken(blob, key);
            maskedToken = maskToken(plain);
        } catch {
            maskedToken = "(decrypt error)";
        }
    }

    let maskedCloudflareToken = "";
    if (row?.cloudflareTokenEncrypted && platform.env.NOTION_TOKEN_ENCRYPTION_KEY) {
        try {
            const key = await deriveTokenKey(platform.env.NOTION_TOKEN_ENCRYPTION_KEY);
            const blob =
                row.cloudflareTokenEncrypted instanceof Uint8Array
                    ? row.cloudflareTokenEncrypted
                    : new Uint8Array(row.cloudflareTokenEncrypted as ArrayBuffer);
            maskedCloudflareToken = maskToken(await decryptNotionToken(blob, key));
        } catch {
            maskedCloudflareToken = "(decrypt error)";
        }
    }

    const cloudflareAccountId = row?.cloudflareAccountId ?? "";
    const cloudflareModel = row?.cloudflareModel ?? DEFAULT_VISION_MODEL;

    // Model list for the picker comes from the KV cache (written on save / by /api/cf/models).
    // The client can call /api/cf/models to refresh on demand.
    let models: CfModel[] = [];
    if (cloudflareAccountId && platform.env.KV) {
        try {
            const cached = await platform.env.KV.get<{ models?: CfModel[] }>(
                `cf-models:${cloudflareAccountId}`,
                "json"
            );
            if (cached && Array.isArray(cached.models)) {
                models = cached.models;
            }
        } catch {
            // ignore cache read errors — the dropdown falls back to the default option
        }
    }

    const form = await superValidate(
        {
            diagnosticsDefault: Boolean(row?.diagnosticsDefault),
            notionToken: "",
            notionDatabaseId: row?.notionDatabaseId ?? "",
            notionAutoSync: Boolean(row?.notionAutoSync),
            notionSkipValidation: Boolean(row?.notionSkipValidation),
            notionValidationDelayMs: row?.notionValidationDelayMs ?? 2000,
            dailyImageQuota: row?.dailyImageQuota ?? 0,
            dedupKeepStrategy: (row?.dedupKeepStrategy as "best" | "oldest" | "newest" | undefined) ?? "best",
            cloudflareToken: "",
            cloudflareAccountId,
            cloudflareModel
        },
        zod4(settingsSchema)
    );

    return { form, maskedToken, maskedCloudflareToken, cloudflareAccountId, cloudflareModel, models };
};

export const actions: Actions = {
    save: async ({ request, locals, platform }) => {
        const form = await superValidate(request, zod4(settingsSchema));
        if (!form.valid) return fail(400, { form });
        if (!locals.userId || !platform?.env?.DB) return fail(503, { form });

        const db = getDb(platform);

        // Encrypt only when user typed a new token. Empty input ⇒ leave blob untouched.
        let tokenBlob: Uint8Array | null = null;
        if (form.data.notionToken && form.data.notionToken.length > 0) {
            if (!platform.env.NOTION_TOKEN_ENCRYPTION_KEY) {
                return message(form, "encryption key not configured", { status: 500 });
            }
            const key = await deriveTokenKey(platform.env.NOTION_TOKEN_ENCRYPTION_KEY);
            tokenBlob = await encryptNotionToken(form.data.notionToken, key);
        }

        // Cloudflare connection: when a new token is provided, validate it by listing the
        // account's models (proves token + account + Workers AI permission), cache that list,
        // then encrypt the token. Empty token preserves the existing blob.
        let cfTokenBlob: Uint8Array | null = null;
        const cfAccountId = form.data.cloudflareAccountId.trim();
        const cfTokenProvided = Boolean(form.data.cloudflareToken && form.data.cloudflareToken.length > 0);
        if (cfTokenProvided && !cfAccountId) {
            return message(form, "Enter your Cloudflare Account ID alongside the API token.", { status: 400 });
        }
        if (cfTokenProvided && cfAccountId) {
            if (!platform.env.NOTION_TOKEN_ENCRYPTION_KEY) {
                return message(form, "encryption key not configured", { status: 500 });
            }
            try {
                const models = await listVisionModels({ accountId: cfAccountId, apiToken: form.data.cloudflareToken });
                await platform.env.KV?.put(
                    `cf-models:${cfAccountId}`,
                    JSON.stringify({ models, cachedAt: Date.now() }),
                    { expirationTtl: 86400 }
                );
            } catch (e) {
                return message(form, describeCloudflareError(e), { status: 400 });
            }
            const key = await deriveTokenKey(platform.env.NOTION_TOKEN_ENCRYPTION_KEY);
            cfTokenBlob = await encryptNotionToken(form.data.cloudflareToken, key);
        }

        const existing = await db
            .select()
            .from(schema.userSettings)
            .where(eq(schema.userSettings.userId, locals.userId))
            .limit(1);

        const updateData: Partial<typeof schema.userSettings.$inferInsert> = {
            diagnosticsDefault: form.data.diagnosticsDefault ? 1 : 0,
            notionDatabaseId: form.data.notionDatabaseId || null,
            notionAutoSync: form.data.notionAutoSync ? 1 : 0,
            notionSkipValidation: form.data.notionSkipValidation ? 1 : 0,
            notionValidationDelayMs: form.data.notionValidationDelayMs,
            dailyImageQuota: form.data.dailyImageQuota,
            dedupKeepStrategy: form.data.dedupKeepStrategy,
            cloudflareAccountId: cfAccountId || null,
            cloudflareModel: form.data.cloudflareModel || DEFAULT_VISION_MODEL
        };
        if (tokenBlob) {
            updateData.notionTokenEncrypted = tokenBlob;
        }
        if (cfTokenBlob) {
            updateData.cloudflareTokenEncrypted = cfTokenBlob;
        }

        if (existing.length === 0) {
            await db.insert(schema.userSettings).values({
                userId: locals.userId,
                ...updateData
            });
        } else {
            await db.update(schema.userSettings).set(updateData).where(eq(schema.userSettings.userId, locals.userId));
        }

        return message(form, "saved");
    },

    reset: async ({ locals, platform }) => {
        if (!locals.userId || !platform?.env?.DB) {
            return fail(503, { error: "db unavailable" });
        }
        const db = getDb(platform);
        await db.delete(schema.userSettings).where(eq(schema.userSettings.userId, locals.userId));
        const form = await superValidate(zod4(settingsSchema));
        return { form };
    },

    dedup: async ({ request }) => {
        const data = await request.formData();
        const dryRun = data.get("dryRun") === "true";
        try {
            const res = await fetch("/api/notion/dedup", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ dry_run: dryRun })
            });
            if (!res.ok) {
                return fail(res.status, { error: `dedup api failed: ${res.status}` });
            }
            return { dedupResult: await res.json() };
        } catch (e) {
            return fail(500, { error: e instanceof Error ? e.message : "dedup failed" });
        }
    },

    importLegacy: async (event) => {
        const data = await event.request.formData();
        const markdown = (data.get("markdown") ?? "").toString();
        const notionToken = (data.get("notionToken") ?? "").toString();
        const notionDatabaseId = (data.get("notionDatabaseId") ?? "").toString();

        type LegacyPayload = {
            markdown?: string;
            notion?: { token: string; databaseId: string };
        };
        const payload: LegacyPayload = {};
        if (markdown.trim().length > 0) {
            payload.markdown = markdown;
        }
        if (notionToken.trim().length > 0 && notionDatabaseId.trim().length > 0) {
            payload.notion = { token: notionToken.trim(), databaseId: notionDatabaseId.trim() };
        }

        if (!payload.markdown && !payload.notion) {
            return fail(400, { error: "provide markdown or both notion token + database id" });
        }

        try {
            const res = await event.fetch("/api/import/legacy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const errorText = await res.text();
                return fail(res.status, { error: errorText || `legacy import failed: ${res.status}` });
            }
            const json = (await res.json()) as {
                imported_markdown: number;
                imported_notion: number;
                skipped: number;
            };
            const imported = json.imported_markdown + json.imported_notion;
            return {
                importLegacyResult: json,
                message: `imported ${imported} · skipped ${json.skipped}`
            };
        } catch (e) {
            return fail(500, { error: e instanceof Error ? e.message : "legacy import failed" });
        }
    }
};
