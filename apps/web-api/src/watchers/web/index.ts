import type { SupabaseClient } from "@supabase/supabase-js";
import {
    handleAnthropic,
    handleGoogleDevelopers,
    handleOpenAI,
    handleTestingCatalog,
} from "./handlers";

export type WebUpdateRow = {
    type: "web";
    who: string;
    title: string;
    link: string;
    created_at: string;
};

type HandlerConfig = {
    sitemap: string;
    handler: (supabase: SupabaseClient) => Promise<WebUpdateRow[]>;
};

const HANDLER_CONFIGS: HandlerConfig[] = [
    { sitemap: "https://openai.com/sitemap.xml", handler: handleOpenAI },
    { sitemap: "https://www.anthropic.com/sitemap.xml", handler: handleAnthropic },
    { sitemap: "https://blog.google/technology/developers/rss/", handler: handleGoogleDevelopers },
    { sitemap: "https://www.testingcatalog.com/sitemap-posts.xml", handler: handleTestingCatalog },
];

type HandlerResult = {
    sitemap: string;
    rows: WebUpdateRow[];
    error: string | null;
};

export type WebWatcherSummary = {
    ok: boolean;
    startedAt: string;
    finishedAt: string;
    counts: {
        sitemaps: number;
        discovered_total: number;
        discovered_unique: number;
        attempted_upserts: number;
    };
    perSitemapDiscovered: Record<string, number>;
    sample: string[];
    errors?: Array<{ sitemap: string; message: string }>;
    dbError: string | null;
};

export async function runWebWatcher(supabase: SupabaseClient): Promise<WebWatcherSummary> {
    const startedAt = new Date().toISOString();
    const handlerResults: HandlerResult[] = await Promise.all(
        HANDLER_CONFIGS.map(async (cfg) => {
            try {
                console.log(`[web-watcher] Starting ${cfg.sitemap}`);
                const start = Date.now();
                const rows = await cfg.handler(supabase);
                console.log(
                    `[web-watcher] ${cfg.sitemap} completed with ${rows.length} rows in ${Date.now() - start}ms`
                );
                return { sitemap: cfg.sitemap, rows, error: null };
            } catch (error: any) {
                const message = error?.message ?? String(error);
                console.error(`[web-watcher] ${cfg.sitemap} failed: ${message}`);
                return { sitemap: cfg.sitemap, rows: [], error: message };
            }
        })
    );

    const allRows = handlerResults.flatMap((result) => result.rows);
    const perSitemapDiscovered = Object.fromEntries(
        handlerResults.map((result) => [result.sitemap, result.rows.length])
    );
    const errors = handlerResults
        .filter((result) => result.error)
        .map((result) => ({ sitemap: result.sitemap, message: result.error! }));

    const uniqueRows = Array.from(new Map(allRows.map((row) => [row.link, row])).values());

    let dbError: string | null = null;
    if (uniqueRows.length) {
        const { error } = await supabase.from("updates").upsert(uniqueRows, { onConflict: "link" });
        if (error) {
            dbError = error.message;
        }
    }

    const summary: WebWatcherSummary = {
        ok: dbError === null,
        startedAt,
        finishedAt: new Date().toISOString(),
        counts: {
            sitemaps: HANDLER_CONFIGS.length,
            discovered_total: allRows.length,
            discovered_unique: uniqueRows.length,
            attempted_upserts: uniqueRows.length,
        },
        perSitemapDiscovered,
        sample: uniqueRows.slice(0, 5).map((row) => row.title),
        errors: errors.length ? errors : undefined,
        dbError,
    };

    return summary;
}
