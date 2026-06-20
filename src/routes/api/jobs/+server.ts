import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { getDb } from "$lib/server/db";
import { createJob, QuotaExceededError, CloudflareNotConnectedError } from "$lib/server/jobs/create";

export const POST: RequestHandler = async ({ request, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);

    const contentType = request.headers.get("content-type") ?? "";

    // Chunked-upload mode: JSON body creates an empty job up front; the client
    // then streams images via POST /api/jobs/[id]/items and calls /finalize.
    let files: File[] = [];
    let diagnostics: boolean;
    let multi = false;
    let expectedTotal: number | undefined;

    if (contentType.includes("application/json")) {
        let body: { multi?: boolean; expectedTotal?: number; diagnostics?: boolean };
        try {
            body = await request.json();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw error(400, `invalid json: ${msg}`);
        }
        if (!body.multi) {
            throw error(400, "json job creation requires multi:true (chunked upload)");
        }
        multi = true;
        diagnostics = body.diagnostics === true;
        expectedTotal = typeof body.expectedTotal === "number" ? body.expectedTotal : undefined;
    } else if (contentType.includes("multipart/form-data")) {
        let form: FormData;
        try {
            form = await request.formData();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw error(400, `invalid form data: ${msg}`);
        }
        files = form.getAll("files").filter((f): f is File => f instanceof File);
        if (files.length === 0) {
            throw error(400, "no files provided");
        }
        diagnostics = form.get("diagnostics") === "true";
    } else {
        throw error(400, "expected multipart/form-data upload or application/json");
    }

    try {
        const result = await createJob({
            db,
            env: platform.env,
            userId: locals.userId,
            files,
            diagnostics,
            multi,
            ...(expectedTotal !== undefined ? { expectedTotal } : {})
        });
        return json({ jobId: result.jobId, itemCount: result.itemCount }, { status: 201 });
    } catch (err) {
        if (err instanceof CloudflareNotConnectedError) {
            return json({ error: "cloudflare_not_connected", message: err.message }, { status: 412 });
        }
        if (err instanceof QuotaExceededError) {
            return json(
                {
                    error: "quota_exceeded",
                    message: err.message,
                    used: err.used,
                    limit: err.limit,
                    requested: err.requested
                },
                { status: 429 }
            );
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw error(500, msg);
    }
};
