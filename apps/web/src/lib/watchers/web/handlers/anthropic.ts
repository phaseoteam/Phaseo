import * as cheerio from "cheerio";
import { walkSitemap, parseTimeString, createFreshnessChecker } from "../utils";

export async function handleAnthropic(supabase: any): Promise<Array<{ type: "web", who: string, title: string, link: string, created_at: string }>> {
    const sitemapUrl = "https://www.anthropic.com/sitemap.xml";
    const items = await walkSitemap(sitemapUrl);
    const urls = items.map(item => item.url);

    // const blacklist = new Set([
    //     "https://www.anthropic.com/events",
    //     "https://www.anthropic.com/research",
    //     "https://www.anthropic.com/learn/claude-for-you",
    //     "https://www.anthropic.com/learn/claude-for-work",
    //     "https://www.anthropic.com/learn/build-with-claude",
    //     "https://www.anthropic.com/learn",
    //     "https://www.anthropic.com/unsubscribe",
    //     "https://www.anthropic.com/supported-countries",
    //     "https://www.anthropic.com/company",
    //     "https://www.anthropic.com/careers",
    //     "https://www.anthropic.com/system-cards",
    //     "https://www.anthropic.com/constitution"
    // ]);

    // Query existing links
    const { data: existing } = await supabase
        .from("updates")
        .select("link")
        .eq("type", "web")
        .in("link", urls);

    const existingLinks = new Set(existing?.map((r: any) => r.link) || []);
    const newUrls = urls.filter(u => !existingLinks.has(u));
    const filteredUrls = newUrls.filter(u => {
        const url = new URL(u);
        const segments = url.pathname.split('/').filter(Boolean);
        return segments.length > 1;
    });

    const rows: Array<{ type: "web", who: string, title: string, link: string, created_at: string }> = [];
    const isFresh = createFreshnessChecker();

    for (const url of filteredUrls) {
        try {
            const resp = await fetch(url, { headers: { "cache-control": "no-cache", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" } });
            if (!resp.ok) continue;
            const html = await resp.text();
            const $ = cheerio.load(html);

            const title = $('h1').text().trim() || $('title').text().trim() || "New page published";

            const pageText = $.text().replace(/●/g, '● ');

            const datePatterns = [
                /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/,
                /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/,
                /\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+\d{4}/
            ];

            let raw = "";
            for (const pattern of datePatterns) {
                const match = pageText.match(pattern);
                if (match) {
                    raw = match[0];
                    break;
                }
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
                who: "www.anthropic.com",
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
