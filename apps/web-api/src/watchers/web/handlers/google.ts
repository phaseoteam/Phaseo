import { createFreshnessChecker, parseTimeString } from "../utils";
import { parseXmlWithLimits } from "@/watchers/xml-safe";

const RSS_URL = "https://blog.google/technology/developers/rss/";
const GOOGLE_DEVELOPERS_HOST = "blog.google";

export async function handleGoogleDevelopers(supabase: any): Promise<
    Array<{ type: "web"; who: string; title: string; link: string; created_at: string }>
> {
    const resp = await fetch(RSS_URL, { headers: { "cache-control": "no-cache" } });
    if (!resp.ok) throw new Error(`RSS fetch failed ${resp.status} ${RSS_URL}`);
    const xml = await resp.text();

    const doc = parseXmlWithLimits<Record<string, any>>(xml);

    const channel = doc.rss?.channel;
    if (!channel) throw new Error("No <channel> found in RSS");

    const items = Array.isArray(channel.item) ? channel.item : [channel.item].filter(Boolean);
    const rows: Array<{ type: "web"; who: string; title: string; link: string; created_at: string }> = [];
    const isFresh = createFreshnessChecker();

    for (const item of items) {
        const link = (item.link || "").trim();
        if (!link) continue;

        const title = (item.title || "").trim() || "New page published";

        let created_at = new Date().toISOString();
        const pubDateRaw = (item.pubDate || item["pubdate"] || item["dc:date"] || "").trim();
        if (pubDateRaw) {
            const parsed = parseTimeString(pubDateRaw);
            if (parsed.iso) {
                created_at = parsed.iso;
            } else {
                const fallback = new Date(pubDateRaw);
                if (!isNaN(fallback.getTime())) {
                    created_at = fallback.toISOString();
                }
            }
        }

        if (!isFresh(created_at)) continue;

        rows.push({
            type: "web" as const,
            who: GOOGLE_DEVELOPERS_HOST,
            title,
            link,
            created_at,
        });
    }

    return Array.from(new Map(rows.map(row => [row.link, row])).values());
}
