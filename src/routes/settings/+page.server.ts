import type { Actions, PageServerLoad } from "./$types";
import { fail } from "@sveltejs/kit";
import { superValidate, message } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { eq } from "drizzle-orm";

import { getDb, schema } from "$lib/server/db";
import { deriveTokenKey, encryptNotionToken, decryptNotionToken, maskToken } from "$lib/server/crypto";
import { settingsSchema } from "$lib/schemas/settings";

/**
 * Settings load: decrypts the stored Notion token (if any) and returns a
 * masked display value so the UI never echoes the secret back. On save, an
 * empty `notionToken` means "leave the existing encrypted blob in place".
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
    const empty = await superValidate(zod4(settingsSchema));
    if (!locals.userId || !platform?.env?.DB) {
        return { form: empty, maskedToken: "" };
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

    const form = await superValidate(
        {
            diagnosticsDefault: Boolean(row?.diagnosticsDefault),
            notionToken: "",
            notionDatabaseId: row?.notionDatabaseId ?? "",
            notionAutoSync: Boolean(row?.notionAutoSync),
            notionSkipValidation: Boolean(row?.notionSkipValidation),
            notionValidationDelayMs: row?.notionValidationDelayMs ?? 2000,
            dailyImageQuota: row?.dailyImageQuota ?? 1000
        },
        zod4(settingsSchema)
    );

    return { form, maskedToken };
};

export const actions: Actions = {
    save: async ({ request, locals, platform }) => {
        const form = await superValidate(request, zod4(settingsSchema));
        if (!form.valid) return fail(400, { form });
        if (!locals.userId || !platform?.env?.DB) return fail(503, { form });

        const db = getDb(platform);

        // Encrypt new token if provided.
        let tokenBlob: Uint8Array | null = null;
        if (form.data.notionToken && form.data.notionToken.length > 0) {
            if (!platform.env.NOTION_TOKEN_ENCRYPTION_KEY) {
                return message(form, "encryption key not configured", { status: 500 });
            }
            const key = await deriveTokenKey(platform.env.NOTION_TOKEN_ENCRYPTION_KEY);
            tokenBlob = await encryptNotionToken(form.data.notionToken, key);
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
            dailyImageQuota: form.data.dailyImageQuota
        };
        if (tokenBlob) {
            updateData.notionTokenEncrypted = tokenBlob;
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
    }
};
