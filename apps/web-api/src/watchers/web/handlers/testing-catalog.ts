import * as cheerio from "cheerio";
import { walkSitemap, parseTimeString, createFreshnessChecker } from "../utils";

export async function handleTestingCatalog(supabase: any): Promise<Array<{ type: "web", who: string, title: string, link: string, created_at: string }>> {
    const sitemapUrl = "https://www.testingcatalog.com/sitemap-posts.xml";
    const items = await walkSitemap(sitemapUrl);
    const urls = items.map(item => item.url);

    // Query existing links
    const { data: existing } = await supabase
        .from("updates")
        .select("link")
        .eq("type", "web")
        .in("link", urls);

    const existingLinks = new Set(existing?.map((r: any) => r.link) || []);
    const newUrls = urls.filter(u => !existingLinks.has(u));

    const rows: Array<{ type: "web", who: string, title: string, link: string, created_at: string }> = [];
    const isFresh = createFreshnessChecker();

    for (const url of newUrls) {
        try {
            const resp = await fetch(url, { headers: { "cache-control": "no-cache", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" } });
            if (!resp.ok) continue;
            const html = await resp.text();
            const $ = cheerio.load(html);

            const title = $('title').text().trim() || "New page published";

            let dateEl = $('body > div:nth-of-type(1) > main > article > header > div:nth-of-type(2) > div > div > div:nth-of-type(2) > time');
            if (dateEl.length === 0) {
                dateEl = $('time');
            }

            let raw = "";
            if (dateEl.length > 0) {
                raw = dateEl.attr('datetime') || dateEl.text().trim();
            }

            let created_at = new Date().toISOString();
            if (raw) {
                const parsed = parseTimeString(raw);
                if (parsed.iso) {
                    created_at = parsed.iso;
                }
            }

            if (!isFresh(created_at)) {
                continue;
            }

            rows.push({
                type: "web" as const,
                who: "www.testingcatalog.com",
                title,
                link: url,
                created_at,
            });
        } catch (e) {
            console.warn(`Failed to fetch or parse ${url}:`, e);
        }
    }

    return rows;
}
