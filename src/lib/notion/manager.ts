/**
 * Notion API wrapper for the user's lead database. Workers-runtime safe.
 * Verbatim port of `extract_usernames/integrations/notion_manager.py`.
 *
 * Reads use `dataSources.query` (Notion API quirk: paginated queries require
 * a data source ID, not the database ID). Writes use the modern
 * `pages.create({ parent: { database_id } })` form.
 *
 * Per-instance caches (cleared only by re-instantiation):
 *   `propertyNamesCache`     — detected title/url/status column names
 *   `existingUsernamesCache` — lowercased usernames for fast dedup
 *   `dataSourceIdCache`      — first data source on the database
 *
 * Rate limit: `rateLimitMs` (default DEFAULT_RATE_LIMIT_MS) between every API call.
 */

import { Client, APIResponseError } from "@notionhq/client";
import { buildConnectionErrorHelp } from "./errors";

export interface PropertyNames {
    title: string;
    url: string;
    status: string | null;
}

export interface CreatePageInput {
    username: string;
    instagramUrl: string;
    status?: string;
}

export interface CreatePageResult {
    pageId: string;
}

export interface BatchCreateResult {
    total: number;
    created: number;
    failed: number;
    skipped: number;
    errors: Array<{ username: string; error: string }>;
}

export interface NotionDatabaseManagerOptions {
    rateLimitMs?: number;
}

const DEFAULT_RATE_LIMIT_MS = 350;
const DEFAULT_STATUS = "Didn't Approach";

const NOTION_URL_TOKEN = "notion.so/";
const HEX_RE = /[0-9a-f]/i;

interface NotionPropertySchema {
    type?: string;
}

interface NotionDatabaseRetrieveResponse {
    title?: Array<{ plain_text?: string }>;
    properties?: Record<string, NotionPropertySchema>;
    data_sources?: Array<{ id: string }>;
}

interface NotionPageQueryResult {
    id: string;
    properties?: Record<string, unknown>;
}

interface NotionQueryResponse {
    results?: NotionPageQueryResult[];
    has_more?: boolean;
    next_cursor?: string | null;
}

interface TitleProperty {
    title?: Array<{ plain_text?: string }>;
}

function isApiResponseError(err: unknown): err is APIResponseError {
    return err instanceof APIResponseError;
}

function extractTitlePlainText(prop: unknown): string {
    if (!prop || typeof prop !== "object") {
        return "";
    }
    const titleArr = (prop as TitleProperty).title;
    if (!Array.isArray(titleArr) || titleArr.length === 0) {
        return "";
    }
    const first = titleArr[0];
    if (!first) {
        return "";
    }
    return (first.plain_text ?? "").trim();
}

export class NotionDatabaseManager {
    private readonly client: Client;
    private readonly databaseId: string;
    private readonly rateLimitMs: number;
    private lastRequestAt = 0;
    private propertyNamesCache: PropertyNames | null = null;
    private existingUsernamesCache: Set<string> | null = null;
    private dataSourceIdCache: string | null = null;

    constructor(token: string, databaseId: string, options: NotionDatabaseManagerOptions = {}) {
        this.client = new Client({ auth: token });
        this.databaseId = NotionDatabaseManager.cleanDatabaseId(databaseId);
        this.rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
    }

    /** Test seam. Constructs an instance around an injected Notion client (mock). */
    static withClient(
        client: Client,
        databaseId: string,
        options: NotionDatabaseManagerOptions = {}
    ): NotionDatabaseManager {
        const instance = Object.create(NotionDatabaseManager.prototype) as NotionDatabaseManager;
        // Bypass `readonly` for controlled construction — we never mutate after this.
        (instance as unknown as { client: Client }).client = client;
        (instance as unknown as { databaseId: string }).databaseId = NotionDatabaseManager.cleanDatabaseId(databaseId);
        (instance as unknown as { rateLimitMs: number }).rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
        (instance as unknown as { lastRequestAt: number }).lastRequestAt = 0;
        (instance as unknown as { propertyNamesCache: PropertyNames | null }).propertyNamesCache = null;
        (instance as unknown as { existingUsernamesCache: Set<string> | null }).existingUsernamesCache = null;
        (instance as unknown as { dataSourceIdCache: string | null }).dataSourceIdCache = null;
        return instance;
    }

    /**
     * Normalizes user-supplied database IDs to the 32-char hex form expected by
     * the Notion API. Accepts:
     *   - Raw:        `300472d4ce5181aa83f2000b8ae958d2`
     *   - Dashed:     `300472d4-ce51-81aa-83f2-000b8ae958d2`
     *   - URL:        `https://notion.so/300472d4ce5181aa83f2000b8ae958d2`
     *   - URL w/ qs:  `https://notion.so/300472d4-ce51-...?v=...`
     * Returns empty string for falsy input.
     */
    static cleanDatabaseId(raw: string): string {
        if (!raw) {
            return "";
        }

        let id = raw.trim();

        const tokenIdx = id.indexOf(NOTION_URL_TOKEN);
        if (tokenIdx !== -1) {
            id = id.slice(tokenIdx + NOTION_URL_TOKEN.length);
        }

        const queryIdx = id.indexOf("?");
        if (queryIdx !== -1) {
            id = id.slice(0, queryIdx);
        }

        // Drop trailing path segments (e.g. page slug after the ID).
        const slashIdx = id.lastIndexOf("/");
        if (slashIdx !== -1) {
            id = id.slice(slashIdx + 1);
        }

        id = id.replace(/-/g, "");

        // Take the last 32 hex chars — Notion IDs may be embedded in longer slugs.
        const hexOnly = id
            .split("")
            .filter((ch) => HEX_RE.test(ch))
            .join("");

        if (hexOnly.length >= 32) {
            return hexOnly.slice(hexOnly.length - 32);
        }
        return hexOnly;
    }

    private async enforceRateLimit(): Promise<void> {
        const now = Date.now();
        if (this.lastRequestAt > 0) {
            const elapsed = now - this.lastRequestAt;
            if (elapsed < this.rateLimitMs) {
                await new Promise((resolve) => setTimeout(resolve, this.rateLimitMs - elapsed));
            }
        }
        this.lastRequestAt = Date.now();
    }

    private async retrieveDatabase(): Promise<NotionDatabaseRetrieveResponse> {
        await this.enforceRateLimit();
        try {
            const db = (await this.client.databases.retrieve({
                database_id: this.databaseId
            })) as unknown as NotionDatabaseRetrieveResponse;
            return db;
        } catch (err) {
            if (isApiResponseError(err)) {
                throw new Error(buildConnectionErrorHelp(err.code ?? "unknown", err.message), { cause: err });
            }
            throw err;
        }
    }

    private async getDataSourceId(): Promise<string> {
        if (this.dataSourceIdCache) {
            return this.dataSourceIdCache;
        }
        const db = await this.retrieveDatabase();
        const sources = db.data_sources ?? [];
        if (sources.length > 0 && sources[0]?.id) {
            this.dataSourceIdCache = sources[0].id;
        } else {
            this.dataSourceIdCache = this.databaseId;
        }
        return this.dataSourceIdCache;
    }

    async detectPropertyNames(): Promise<PropertyNames> {
        if (this.propertyNamesCache) {
            return this.propertyNamesCache;
        }

        const db = await this.retrieveDatabase();
        const properties = db.properties ?? {};

        let titleName: string | null = null;
        let urlName: string | null = null;
        let statusName: string | null = null;

        // Pass 1: type-based detection. URL column with "social" in the name wins outright.
        for (const [propName, propData] of Object.entries(properties)) {
            const type = propData?.type;
            if (type === "title" && !titleName) {
                titleName = propName;
            } else if (type === "url" && propName.toLowerCase().includes("social") && !urlName) {
                urlName = propName;
            } else if (type === "status" && !statusName) {
                statusName = propName;
            }
        }

        // Pass 2 fallback: any url-typed property.
        if (!urlName) {
            for (const [propName, propData] of Object.entries(properties)) {
                if (propData?.type === "url") {
                    urlName = propName;
                    break;
                }
            }
        }

        // Pass 2 fallback: any status-typed property.
        if (!statusName) {
            for (const [propName, propData] of Object.entries(properties)) {
                if (propData?.type === "status") {
                    statusName = propName;
                    break;
                }
            }
        }

        const resolved: PropertyNames = {
            title: titleName ?? "Brand Name",
            url: urlName ?? "Social Media Account",
            status: statusName
        };

        this.propertyNamesCache = resolved;
        return resolved;
    }

    async getAllExistingUsernames(opts: { forceRefresh?: boolean } = {}): Promise<Set<string>> {
        if (this.existingUsernamesCache && !opts.forceRefresh) {
            return this.existingUsernamesCache;
        }

        const usernames = new Set<string>();
        const props = await this.detectPropertyNames();
        const titleProp = props.title;
        const dataSourceId = await this.getDataSourceId();

        let cursor: string | undefined;
        let hasMore = true;

        while (hasMore) {
            await this.enforceRateLimit();
            const queryArgs: { data_source_id: string; page_size: number; start_cursor?: string } = {
                data_source_id: dataSourceId,
                page_size: 100
            };
            if (cursor) {
                queryArgs.start_cursor = cursor;
            }

            const response = (await this.client.dataSources.query(
                queryArgs as Parameters<typeof this.client.dataSources.query>[0]
            )) as unknown as NotionQueryResponse;

            const results = response.results ?? [];
            for (const page of results) {
                const props = page.properties ?? {};
                const titleVal = extractTitlePlainText(props[titleProp]);
                if (titleVal) {
                    usernames.add(titleVal.toLowerCase());
                }
            }

            hasMore = Boolean(response.has_more);
            cursor = response.next_cursor ?? undefined;
        }

        this.existingUsernamesCache = usernames;
        return usernames;
    }

    async createPage(input: CreatePageInput): Promise<CreatePageResult> {
        const props = await this.detectPropertyNames();
        const status = input.status ?? DEFAULT_STATUS;

        const properties: Record<string, unknown> = {
            [props.title]: {
                title: [
                    {
                        text: { content: input.username }
                    }
                ]
            },
            [props.url]: {
                url: input.instagramUrl
            }
        };

        if (props.status) {
            properties[props.status] = {
                status: { name: status }
            };
        }

        await this.enforceRateLimit();

        const created = (await this.client.pages.create({
            parent: { database_id: this.databaseId },
            properties
        } as Parameters<typeof this.client.pages.create>[0])) as unknown as { id?: string };

        const pageId = created.id ?? "";

        if (this.existingUsernamesCache) {
            this.existingUsernamesCache.add(input.username.toLowerCase());
        }

        return { pageId };
    }

    async batchCreatePages(
        accounts: CreatePageInput[],
        opts: { skipDuplicates?: boolean } = {}
    ): Promise<BatchCreateResult> {
        const skipDuplicates = opts.skipDuplicates ?? true;
        const stats: BatchCreateResult = {
            total: accounts.length,
            created: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        let existing = new Set<string>();
        if (skipDuplicates) {
            try {
                existing = await this.getAllExistingUsernames();
            } catch {
                existing = new Set();
            }
        }

        for (const account of accounts) {
            const username = account.username ?? "";
            const url = account.instagramUrl ?? "";

            if (!username || !url) {
                stats.failed += 1;
                stats.errors.push({ username, error: "Missing username or URL" });
                continue;
            }

            if (skipDuplicates && existing.has(username.toLowerCase())) {
                stats.skipped += 1;
                continue;
            }

            try {
                await this.createPage(account);
                stats.created += 1;
            } catch (err) {
                stats.failed += 1;
                const message = err instanceof Error ? err.message : String(err);
                stats.errors.push({ username, error: message });
            }
        }

        return stats;
    }
}
