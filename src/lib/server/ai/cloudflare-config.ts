/**
 * Per-user Cloudflare credentials loader — the BYO-account analogue of
 * `loadNotionConfig` in the queue consumer.
 *
 * The user's API token is stored AES-GCM encrypted in `user_settings`
 * (same layout + key as the Notion token). `loadCloudflareConfig` reads the
 * raw row; `resolveCloudflareCreds` decrypts the token into usable creds +
 * the resolved model id (selected, or the default).
 */

import { eq } from "drizzle-orm";
import type { Db } from "$lib/server/db";
import { userSettings } from "$lib/server/schema";
import { deriveTokenKey, decryptNotionToken } from "$lib/server/crypto";
import { DEFAULT_VISION_MODEL, type CloudflareCreds } from "./run-rest";

export interface CloudflareConfig {
    tokenEncrypted: Uint8Array | null;
    accountId: string | null;
    model: string | null;
}

export async function loadCloudflareConfig(db: Db, userId: string): Promise<CloudflareConfig> {
    const rows = await db
        .select({
            tok: userSettings.cloudflareTokenEncrypted,
            acct: userSettings.cloudflareAccountId,
            model: userSettings.cloudflareModel
        })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);
    const s = rows[0];
    if (!s) return { tokenEncrypted: null, accountId: null, model: null };
    return {
        tokenEncrypted: s.tok ? new Uint8Array(s.tok as ArrayBuffer) : null,
        accountId: s.acct,
        model: s.model
    };
}

/** A connection is "complete" only with BOTH a token blob and an account id. */
export function isCloudflareConnected(cfg: CloudflareConfig): boolean {
    return Boolean(cfg.tokenEncrypted && cfg.accountId);
}

/**
 * Decrypts the token and returns usable creds + the resolved model id, or `null`
 * when the user hasn't connected an account. `encryptionKey` is
 * `env.NOTION_TOKEN_ENCRYPTION_KEY` (reused as the generic secret key).
 */
export async function resolveCloudflareCreds(
    encryptionKey: string,
    cfg: CloudflareConfig
): Promise<{ creds: CloudflareCreds; model: string } | null> {
    if (!cfg.tokenEncrypted || !cfg.accountId) return null;
    const key = await deriveTokenKey(encryptionKey);
    const apiToken = await decryptNotionToken(cfg.tokenEncrypted, key);
    return { creds: { accountId: cfg.accountId, apiToken }, model: cfg.model ?? DEFAULT_VISION_MODEL };
}
