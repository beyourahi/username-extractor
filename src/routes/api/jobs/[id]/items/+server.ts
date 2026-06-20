import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "$lib/server/db";
import { appendItemsToJob } from "$lib/server/jobs/create";

/**
 * POST `/api/jobs/[id]/items` — append a chunk of images to a chunked-upload job.
 *
 * Used by the client folder-upload flow: a job is created empty via JSON POST to
 * `/api/jobs` (multi mode), then images are streamed here in batches, then the
 * client calls `/finalize`. Rejects if the job is already finalized, cancelled,
 * or completed, and is scoped to the authenticated owner.
 */
export const POST: RequestHandler = async ({ params, request, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);

    const rows = await db
        .select({
            status: schema.jobs.status,
            uploadComplete: schema.jobs.uploadComplete,
            diagnostics: schema.jobs.diagnostics
        })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.id, params.id), eq(schema.jobs.userId, locals.userId)))
        .limit(1);
    const job = rows[0];
    if (!job) {
        throw error(404, "job not found");
    }
    if (job.uploadComplete) {
        throw error(409, "job upload already finalized");
    }
    if (job.status === "cancelled" || job.status === "completed") {
        throw error(409, `job is ${job.status}`);
    }

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

    const appended = await appendItemsToJob({
        db,
        env: platform.env,
        jobId: params.id,
        userId: locals.userId,
        files,
        diagnostics: job.diagnostics === 1
    });

    return json({ appended }, { status: 201 });
};
