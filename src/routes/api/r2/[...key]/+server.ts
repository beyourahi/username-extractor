import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";

/**
 * Authorized R2 read for `raw/<jobId>/...` keys.
 *
 * SECURITY: hard-rejects any prefix other than `raw/`. Other prefixes
 * (`debug/`, etc.) MUST have their own dedicated routes — do not relax this.
 *
 * Authorization order (DO NOT reorder):
 *   1. Parse `<jobId>` from the key path (second segment).
 *   2. Verify `jobs.id = jobId AND jobs.user_id = locals.userId`.
 *   3. Only then `R2.get`.
 *
 * Image resize via `?w=` / `?h=` proxies through `cf.image`; on resize
 * failure, falls back to the raw bytes (200, not error).
 */
export const GET: RequestHandler = async ({ params, url, request, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }

    const key = params.key;
    if (!key) {
        throw error(400, "missing key");
    }

    if (!key.startsWith("raw/")) {
        throw error(403, "forbidden prefix");
    }
    const parts = key.split("/");
    const jobId = parts[1] ?? "";
    if (!jobId) {
        throw error(400, "invalid key");
    }

    const db = getDb(platform);
    const jobRows = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, locals.userId)))
        .limit(1);
    if (jobRows.length === 0) {
        throw error(404, "not found");
    }

    const obj = await platform.env.R2.get(key);
    if (!obj) {
        throw error(404, "not found");
    }

    const w = url.searchParams.get("w");
    const h = url.searchParams.get("h");
    if (w || h) {
        const imageOpts: Record<string, unknown> = { fit: "scale-down" };
        if (w) imageOpts["width"] = Number(w);
        if (h) imageOpts["height"] = Number(h);
        try {
            // Documented Cloudflare pattern: image transforms require a `fetch()`
            // sub-request with `cf.image` — they are not applied to direct R2 responses.
            const proxied = await fetch(new URL(request.url), {
                cf: { image: imageOpts }
            } as RequestInit & { cf?: Record<string, unknown> });
            if (proxied.ok) {
                return proxied;
            }
        } catch {
            // Resize unavailable (binding missing, transform error). Serve original bytes.
        }
    }

    return new Response(obj.body, {
        headers: {
            "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
            "Cache-Control": "private, max-age=300"
        }
    });
};
