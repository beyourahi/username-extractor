import { describe, expect, it } from "vitest";
import { createJob, CloudflareNotConnectedError } from "../create";

/**
 * Guard-only coverage: a job cannot be created without a connected Cloudflare account
 * (inference is billed to the user's own account). The full admit→R2→queue path is
 * exercised under `bun run preview`. The db mock is a thenable query-builder stub —
 * `select().from().where().limit()` resolves to the configured rows.
 */
describe("createJob — Cloudflare connection guard", () => {
    function thenableChain(rows: unknown[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = Promise.resolve(rows) as any;
        p.select = () => p;
        p.from = () => p;
        p.where = () => p;
        p.limit = () => p;
        return p;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = { R2: {}, QUEUE: {} } as any;

    it("throws when the user has no connected account (no settings row)", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = { select: () => thenableChain([]) } as any;
        const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
        await expect(createJob({ db, env, userId: "u1", files: [file], diagnostics: false })).rejects.toBeInstanceOf(
            CloudflareNotConnectedError
        );
    });

    it("throws when an account id is set but the token blob is missing", async () => {
        const db = {
            select: () => thenableChain([{ tok: null, acct: "acc", model: null }])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        const file = new File([new Uint8Array([1])], "b.png", { type: "image/png" });
        await expect(createJob({ db, env, userId: "u1", files: [file], diagnostics: false })).rejects.toBeInstanceOf(
            CloudflareNotConnectedError
        );
    });
});
