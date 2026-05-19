import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { getDb } from "$lib/server/db";
import { createJob, QuotaExceededError } from "$lib/server/jobs/create";

export const POST: RequestHandler = async ({ request, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
        throw error(400, "expected multipart/form-data upload");
    }

    let form: FormData;
    try {
        form = await request.formData();
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw error(400, `invalid form data: ${msg}`);
    }
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
        throw error(400, "no files provided");
    }
    const diagnostics = form.get("diagnostics") === "true";

    try {
        const result = await createJob({
            db,
            env: platform.env,
            userId: locals.userId,
            files,
            diagnostics
        });
        return json({ jobId: result.jobId, itemCount: result.itemCount }, { status: 201 });
    } catch (err) {
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
