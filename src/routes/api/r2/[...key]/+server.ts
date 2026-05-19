import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";

/**
 * Authorized R2 read with optional Cloudflare Image Resizing.
 *
 * Keys are scoped to `raw/<jobId>/...` — we extract the jobId segment and
 * verify ownership before returning bytes. Other prefixes (e.g. `debug/`)
 * have their own routes.
 *
 * When `?w=` and/or `?h=` are present we proxy through `cf.image` to get a
 * resized variant. Otherwise the original bytes are returned.
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
            // `cf.image` transforms work via fetch sub-requests; reuploading
            // the body through fetch here is the documented pattern.
            const proxied = await fetch(new URL(request.url), {
                cf: { image: imageOpts }
            } as RequestInit & { cf?: Record<string, unknown> });
            if (proxied.ok) {
                return proxied;
            }
        } catch {
            // Fall through to raw bytes.
        }
    }

    return new Response(obj.body, {
        headers: {
            "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
            "Cache-Control": "private, max-age=300"
        }
    });
};
