import type { RequestHandler } from "./$types";
import { error, json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { Client } from "@notionhq/client";
import { getDb, schema } from "$lib/server/db";
import { decryptNotionToken, deriveTokenKey } from "$lib/server/crypto";
import { deduplicate, type NotionRow } from "$lib/notion/dedup";

export const POST: RequestHandler = async ({ url, locals, platform }) => {
    if (!locals.userId || !platform?.env) {
        throw error(503, "platform unavailable");
    }
    const db = getDb(platform);

    const settingsRows = await db
        .select({
            tok: schema.userSettings.notionTokenEncrypted,
            dbId: schema.userSettings.notionDatabaseId
        })
        .from(schema.userSettings)
        .where(eq(schema.userSettings.userId, locals.userId))
        .limit(1);

    const s = settingsRows[0];
    if (!s?.tok || !s.dbId) {
        throw error(400, "Notion is not configured for this user");
    }

    const dryRun = url.searchParams.get("dry_run") === "1";

    const key = await deriveTokenKey(platform.env.NOTION_TOKEN_ENCRYPTION_KEY);
    const token = await decryptNotionToken(new Uint8Array(s.tok as ArrayBuffer), key);
    const client = new Client({ auth: token });

    // Resolve data source id + property names.
    const dbInfo = (await client.databases.retrieve({
        database_id: s.dbId
    })) as unknown as {
        data_sources?: Array<{ id: string }>;
        properties?: Record<string, { type?: string }>;
    };
    const dataSourceId = dbInfo.data_sources?.[0]?.id ?? s.dbId;
    let titleName = "Brand Name";
    let urlName = "Social Media Account";
    const properties = dbInfo.properties ?? {};
    for (const [name, p] of Object.entries(properties)) {
        if (p.type === "title") titleName = name;
        if (p.type === "url" && name.toLowerCase().includes("social")) urlName = name;
    }
    if (!properties[urlName]) {
        for (const [name, p] of Object.entries(properties)) {
            if (p.type === "url") {
                urlName = name;
                break;
            }
        }
    }

    const rows: NotionRow[] = [];
    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
        const args: { data_source_id: string; page_size: number; start_cursor?: string } = {
            data_source_id: dataSourceId,
            page_size: 100
        };
        if (cursor) args.start_cursor = cursor;

        const res = (await client.dataSources.query(
            args as Parameters<typeof client.dataSources.query>[0]
        )) as unknown as {
            results?: Array<{
                id: string;
                properties?: Record<string, unknown>;
                created_time?: string;
            }>;
            has_more?: boolean;
            next_cursor?: string | null;
        };
        for (const page of res.results ?? []) {
            const props = page.properties ?? {};
            const titleProp = props[titleName] as { title?: Array<{ plain_text?: string }> } | undefined;
            const urlProp = props[urlName] as { url?: string | null } | undefined;
            const username = titleProp?.title?.[0]?.plain_text?.trim() ?? "";
            const pageUrl = urlProp?.url ?? "";
            const createdAt = page.created_time ? Date.parse(page.created_time) : 0;
            if (username && pageUrl) {
                rows.push({ pageId: page.id, username, url: pageUrl, createdAt });
            }
        }
        hasMore = Boolean(res.has_more);
        cursor = res.next_cursor ?? undefined;
    }

    const result = await deduplicate({
        client,
        rows,
        keepStrategy: "best",
        dryRun
    });

    return json({
        duplicateGroups: result.duplicateGroups,
        duplicatesFound: result.duplicatesFound,
        duplicatesRemoved: result.duplicatesRemoved,
        archivedPageIds: result.archivedPageIds,
        errors: result.errors,
        dryRun
    });
};
