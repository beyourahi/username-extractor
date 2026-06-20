import type { RequestHandler } from "./$types";
import { json, error } from "@sveltejs/kit";
import { getDb } from "$lib/server/db";
import { loadCloudflareConfig, resolveCloudflareCreds } from "$lib/server/ai/cloudflare-config";
import { listVisionModels, type CfModel } from "$lib/server/ai/run-rest";
import { describeCloudflareError } from "$lib/server/ai/errors";

/**
 * GET /api/cf/models — the suitable (vision) Workers AI models on the user's connected
 * Cloudflare account, for the settings model picker. KV-cached per account (24h);
 * `?refresh=1` forces a live re-fetch. Never returns the owner's models — always the user's.
 */
export const GET: RequestHandler = async ({ locals, platform, url }) => {
    if (!locals.userId || !platform?.env) throw error(503, "platform unavailable");

    const db = getDb(platform);
    const cfg = await loadCloudflareConfig(db, locals.userId);
    if (!cfg.accountId) {
        return json({ models: [] as CfModel[], connected: false });
    }

    const kv = platform.env.KV;
    const cacheKey = `cf-models:${cfg.accountId}`;
    const refresh = url.searchParams.get("refresh") === "1";

    if (!refresh && kv) {
        const cached = await kv.get<{ models?: CfModel[] }>(cacheKey, "json");
        if (cached && Array.isArray(cached.models)) {
            return json({ models: cached.models, connected: true, cached: true });
        }
    }

    const resolved = await resolveCloudflareCreds(platform.env.NOTION_TOKEN_ENCRYPTION_KEY, cfg).catch(() => null);
    if (!resolved) {
        return json({ models: [] as CfModel[], connected: false });
    }

    try {
        const models = await listVisionModels(resolved.creds);
        await kv?.put(cacheKey, JSON.stringify({ models, cachedAt: Date.now() }), { expirationTtl: 86400 });
        return json({ models, connected: true, cached: false });
    } catch (e) {
        return json({ models: [] as CfModel[], connected: true, error: describeCloudflareError(e) });
    }
};
