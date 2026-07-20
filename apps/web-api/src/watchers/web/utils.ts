import zlib from "zlib";
import { parseXmlWithLimits } from "@/watchers/xml-safe";

export function parseTimeString(s: string): { iso: string | null, pretty: string | null } {
    s = s.trim();
    // Try ISO first
    try {
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) {
            return {
                iso: dt.toISOString(),
                pretty: dt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            };
        }
    } catch { }
    // Try common formats
    const formats = [
        { regex: /^(\w+) (\d{1,2}), (\d{4})$/, fmt: '$1 $2, $3' }, // November 8, 2025
        { regex: /^(\d{1,2}) (\w+) (\d{4})$/, fmt: '$2 $1, $3' }  // 8 November 2025
    ];
    for (const { regex, fmt } of formats) {
        const match = s.match(regex);
        if (match) {
            try {
                const dt = new Date(s);
                if (!isNaN(dt.getTime())) {
                    return {
                        iso: dt.toISOString(),
                        pretty: dt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    };
                }
            } catch { }
        }
    }
    return { iso: null, pretty: null };
}

export function createFreshnessChecker(now = new Date()) {
    const minDate = new Date(now);
    minDate.setMonth(minDate.getMonth() - 6);
    const minMs = minDate.getTime();
    const maxDate = new Date(now);
    maxDate.setMonth(maxDate.getMonth() + 1);
    const maxMs = maxDate.getTime();
    return (iso: string) => {
        const candidate = new Date(iso);
        const time = candidate.getTime();
        if (isNaN(time)) return true;
        return time >= minMs && time <= maxMs;
    };
}

export async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
    const r = await fetch(url, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) throw new Error(`Fetch failed ${r.status} ${url}`);
    return r.arrayBuffer();
}

export function parseSitemapXml(
    xmlBuf: Buffer | Uint8Array,
    baseUrl: string
): { items: Array<{ url: string, lastmod: string }>; sitemapUrls: string[] } {
    const buf = Buffer.isBuffer(xmlBuf) ? xmlBuf : Buffer.from(xmlBuf);
    const isGzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
    let xml: string;
    try {
        xml = isGzip ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8");
    } catch {
        xml = buf.toString("utf8");
    }

    const doc = parseXmlWithLimits<Record<string, any>>(xml);

    const toArray = <T,>(v: T | T[] | undefined) =>
        v === undefined ? [] : Array.isArray(v) ? v : [v];

    const join = (base: string, rel: string) => {
        try {
            return new URL(rel, base).toString();
        } catch {
            return rel;
        }
    };

    let items: Array<{ url: string, lastmod: string }> = [];
    let sitemapUrls: string[] = [];

    if (doc.urlset && doc.urlset.url) {
        const list = toArray(doc.urlset.url);
        items = list.map((u: any) => ({
            url: join(baseUrl, (u.loc || "").trim()),
            lastmod: (u.lastmod || "").trim()
        })).filter(item => item.url);
    } else if (doc.sitemapindex && doc.sitemapindex.sitemap) {
        const list = toArray(doc.sitemapindex.sitemap);
        sitemapUrls = list.map((s: any) => join(baseUrl, (s.loc || "").trim())).filter(Boolean);
    } else {
        const findLocs = (node: any): Array<{ url: string, lastmod: string }> => {
            if (!node || typeof node !== "object") return [];
            let out: Array<{ url: string, lastmod: string }> = [];
            for (const [k, v] of Object.entries(node)) {
                if (k.toLowerCase() === "loc" && typeof v === "string") {
                    out.push({ url: join(baseUrl, v.trim()), lastmod: "" });
                } else if (typeof v === "object") {
                    out = out.concat(findLocs(v));
                }
            }
            return out;
        };
        items = findLocs(doc);
        if (JSON.stringify(doc).toLowerCase().includes("sitemapindex")) {
            sitemapUrls = items.map(i => i.url);
            items = [];
        }
    }

    return { items, sitemapUrls };
}

export async function walkSitemap(start: string): Promise<Array<{ url: string, lastmod: string }>> {
    const seen = new Set<string>();
    const collected: Array<{ url: string, lastmod: string }> = [];

    async function dfs(mapUrl: string) {
        if (seen.has(mapUrl)) return;
        seen.add(mapUrl);
        let ab: ArrayBuffer;
        try {
            ab = await fetchArrayBuffer(mapUrl);
        } catch (e) {
            console.warn(`Sitemap fetch failed: ${mapUrl} (${(e as Error).message})`);
            return;
        }
        const { items, sitemapUrls } = parseSitemapXml(new Uint8Array(ab), mapUrl);
        collected.push(...items);
        await Promise.all(sitemapUrls.map((n) => dfs(n)));
    }

    await dfs(start);
    // Deduplicate by url, preserving order
    return Array.from(new Map(collected.map((item) => [item.url, item])).keys()).map(url => collected.find(item => item.url === url)!);
}
