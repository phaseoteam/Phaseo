import { createFreshnessChecker } from "../utils";
import { parseXmlWithLimits } from "../../../xml/safe";

export async function handleOpenAI(supabase: any): Promise<Array<{ type: "web", who: string, title: string, link: string, created_at: string }>> {
    const rssUrl = "https://openai.com/news/rss.xml";
    const resp = await fetch(rssUrl, { headers: { "cache-control": "no-cache" } });
    if (!resp.ok) throw new Error(`RSS fetch failed ${resp.status} ${rssUrl}`);
    const xml = await resp.text();

    const doc = parseXmlWithLimits<Record<string, any>>(xml);

    const channel = doc.rss?.channel;
    if (!channel) throw new Error("No <channel> found in RSS");

    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean);

    const rows: Array<{ type: "web", who: string, title: string, link: string, created_at: string }> = [];
    const isFresh = createFreshnessChecker();

    for (const item of items) {
        const title = (item.title || "").trim() || "New page published";
        const link = (item.link || "").trim();
        const pubDateRaw = (item.pubDate || "").trim();

        if (!link) continue;

        let created_at = new Date().toISOString();
        if (pubDateRaw) {
            try {
                const dt = new Date(pubDateRaw);
                if (!isNaN(dt.getTime())) {
                    created_at = dt.toISOString();
                }
            } catch {
                // keep default
            }
        }

        if (!isFresh(created_at)) continue;

        const host = "openai.com"; // since it's OpenAI RSS

        rows.push({
            type: "web" as const,
            who: host,
            title,
            link,
            created_at,
        });
    }

    // Dedupe by link
    return Array.from(new Map(rows.map(row => [row.link, row])).values());
}
