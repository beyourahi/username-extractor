import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { eq } from "drizzle-orm";

import { getDb, schema } from "$lib/server/db";
import { deriveTokenKey, encryptNotionToken, decryptNotionToken, maskToken } from "$lib/server/crypto";
import { listVisionModels, DEFAULT_VISION_MODEL, type CfModel } from "$lib/server/ai/run-rest";
import { describeCloudflareError } from "$lib/server/ai/errors";
import { extractionSchema, cloudflareSchema, notionSchema } from "$lib/schemas/settings";

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
    if (!locals.userId || !platform?.env?.DB) {
        return {
            extractionForm: await superValidate(zod4(extractionSchema)),
            cloudflareForm: await superValidate(zod4(cloudflareSchema)),
            notionForm: await superValidate(zod4(notionSchema)),
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

    // One superForm per section — each saves independently (see the per-section actions below).
    const extractionForm = await superValidate(
        {
            diagnosticsDefault: Boolean(row?.diagnosticsDefault),
            dailyImageQuota: row?.dailyImageQuota ?? 0
        },
        zod4(extractionSchema)
    );

    const cloudflareForm = await superValidate(
        {
            cloudflareToken: "",
            cloudflareAccountId,
            cloudflareModel
        },
        zod4(cloudflareSchema)
    );

    const notionForm = await superValidate(
        {
            notionToken: "",
            notionDatabaseId: row?.notionDatabaseId ?? "",
            notionAutoSync: Boolean(row?.notionAutoSync),
            notionSkipValidation: Boolean(row?.notionSkipValidation),
            notionValidationDelayMs: row?.notionValidationDelayMs ?? 2000,
            dedupKeepStrategy: (row?.dedupKeepStrategy as "best" | "oldest" | "newest" | undefined) ?? "best"
        },
        zod4(notionSchema)
    );

    return {
        extractionForm,
        cloudflareForm,
        notionForm,
        maskedToken,
        maskedCloudflareToken,
        cloudflareAccountId,
        cloudflareModel,
        models
    };
};

/** Insert-or-update only the provided columns for a user — lets each section save without clobbering the others. */
async function upsertUserSettings(
    db: ReturnType<typeof getDb>,
    userId: string,
    data: Partial<typeof schema.userSettings.$inferInsert>
) {
    const existing = await db
        .select({ userId: schema.userSettings.userId })
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, userId))
        .limit(1);
    if (existing.length === 0) {
        await db.insert(schema.userSettings).values({ userId, ...data });
    } else {
        await db.update(schema.userSettings).set(data).where(eq(schema.userSettings.userId, userId));
    }
}

export const actions: Actions = {
    // Extraction defaults — diagnostics + daily quota.
    saveExtraction: async ({ request, locals, platform }) => {
        const form = await superValidate(request, zod4(extractionSchema));
        if (!form.valid) return fail(400, { form });
        if (!locals.userId || !platform?.env?.DB) return fail(503, { form });

        await upsertUserSettings(getDb(platform), locals.userId, {
            diagnosticsDefault: form.data.diagnosticsDefault ? 1 : 0,
            dailyImageQuota: form.data.dailyImageQuota
        });

        return message(form, "Saved");
    },

    // Cloudflare connection. A new token is validated by listing the account's vision models
    // (proves token + account + Workers AI permission), cached, then encrypted. Empty token
    // preserves the existing blob (CONTRACT in $lib/schemas/settings.ts).
    saveCloudflare: async ({ request, locals, platform }) => {
        const form = await superValidate(request, zod4(cloudflareSchema));
        if (!form.valid) return fail(400, { form });
        if (!locals.userId || !platform?.env?.DB) return fail(503, { form });

        let cfTokenBlob: Uint8Array | null = null;
        const cfAccountId = form.data.cloudflareAccountId.trim();
        const cfTokenProvided = Boolean(form.data.cloudflareToken && form.data.cloudflareToken.length > 0);
        if (cfTokenProvided && !cfAccountId) {
            return message(form, "Enter your Cloudflare Account ID alongside the API token.", { status: 400 });
        }
        if (cfTokenProvided && cfAccountId) {
            if (!platform.env.NOTION_TOKEN_ENCRYPTION_KEY) {
                return message(form, "Can't save tokens right now. Please try again later.", { status: 500 });
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

        const data: Partial<typeof schema.userSettings.$inferInsert> = {
            cloudflareAccountId: cfAccountId || null,
            cloudflareModel: form.data.cloudflareModel || DEFAULT_VISION_MODEL
        };
        if (cfTokenBlob) data.cloudflareTokenEncrypted = cfTokenBlob;
        await upsertUserSettings(getDb(platform), locals.userId, data);

        return message(form, "Saved");
    },

    // Notion connection + sync prefs. Empty token preserves the existing blob.
    saveNotion: async ({ request, locals, platform }) => {
        const form = await superValidate(request, zod4(notionSchema));
        if (!form.valid) return fail(400, { form });
        if (!locals.userId || !platform?.env?.DB) return fail(503, { form });

        let tokenBlob: Uint8Array | null = null;
        if (form.data.notionToken && form.data.notionToken.length > 0) {
            if (!platform.env.NOTION_TOKEN_ENCRYPTION_KEY) {
                return message(form, "Can't save tokens right now. Please try again later.", { status: 500 });
            }
            const key = await deriveTokenKey(platform.env.NOTION_TOKEN_ENCRYPTION_KEY);
            tokenBlob = await encryptNotionToken(form.data.notionToken, key);
        }

        const data: Partial<typeof schema.userSettings.$inferInsert> = {
            notionDatabaseId: form.data.notionDatabaseId || null,
            notionAutoSync: form.data.notionAutoSync ? 1 : 0,
            notionSkipValidation: form.data.notionSkipValidation ? 1 : 0,
            notionValidationDelayMs: form.data.notionValidationDelayMs,
            dedupKeepStrategy: form.data.dedupKeepStrategy
        };
        if (tokenBlob) data.notionTokenEncrypted = tokenBlob;
        await upsertUserSettings(getDb(platform), locals.userId, data);

        return message(form, "Saved");
    },

    reset: async ({ locals, platform }) => {
        if (!locals.userId || !platform?.env?.DB) {
            return fail(503, { error: "Can't reach your data right now. Please try again." });
        }
        const db = getDb(platform);
        await db.delete(schema.userSettings).where(eq(schema.userSettings.userId, locals.userId));
        return { success: true };
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
                return fail(res.status, { error: "Couldn't remove duplicates. Please try again." });
            }
            return { dedupResult: await res.json() };
        } catch (e) {
            return fail(500, { error: e instanceof Error ? e.message : "Couldn't remove duplicates." });
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
            return fail(400, { error: "Paste markdown, or enter both a Notion token and database ID." });
        }

        try {
            const res = await event.fetch("/api/import/legacy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const errorText = await res.text();
                return fail(res.status, { error: errorText || "Import failed. Please try again." });
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
