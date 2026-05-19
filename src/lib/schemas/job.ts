import { z } from "zod";

/**
 * Job upload form (FR-1). Files are uploaded via multipart and are not part of
 * the Zod schema — the toggles below are the only structured user input.
 */
export const jobUploadSchema = z.object({
    diagnostics: z.boolean().default(false)
});

export type JobUploadForm = z.infer<typeof jobUploadSchema>;
