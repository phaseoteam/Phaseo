type FeedFormat = "json" | "rss" | "atom";

type ParsedFeedFormat =
    | {
        ok: true;
        format: FeedFormat;
    }
    | {
        ok: false;
        raw: string;
    };

type FeedItem = {
    id: string;
    title: string;
    summary: string;
    updatedAt?: string | null;
    link?: string | null;
};

type FeedResponseOptions = {
    url: URL;
    format: Exclude<FeedFormat, "json">;
    title: string;
    description: string;
    items: FeedItem[];
    headers?: Record<string, string>;
};

function escapeXml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&apos;");
}

function cleanFeedUrl(url: URL): string {
    const clean = new URL(url.toString());
    clean.searchParams.delete("format");
    clean.searchParams.delete("feed");
    return clean.toString();
}

function toDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    return new Date(parsed);
}

function resolveUpdatedAtIso(items: FeedItem[]): string {
    let latestMs = 0;
    for (const item of items) {
        const asDate = toDate(item.updatedAt);
        if (!asDate) continue;
        latestMs = Math.max(latestMs, asDate.getTime());
    }
    return new Date(latestMs > 0 ? latestMs : Date.now()).toISOString();
}

function toRssPubDate(value: string | null | undefined): string | null {
    const asDate = toDate(value);
    return asDate ? asDate.toUTCString() : null;
}

function buildRssXml(options: FeedResponseOptions): string {
    const feedUrl = cleanFeedUrl(options.url);
    const updatedIso = resolveUpdatedAtIso(options.items);
    const itemsXml = options.items
        .map((item) => {
            const itemUrl = item.link?.trim() ? item.link.trim() : `${feedUrl}#${encodeURIComponent(item.id)}`;
            const pubDate = toRssPubDate(item.updatedAt);
            return [
                "<item>",
                `<title>${escapeXml(item.title)}</title>`,
                `<link>${escapeXml(itemUrl)}</link>`,
                `<guid isPermaLink="false">${escapeXml(item.id)}</guid>`,
                pubDate ? `<pubDate>${escapeXml(pubDate)}</pubDate>` : "",
                `<description>${escapeXml(item.summary)}</description>`,
                "</item>",
            ].filter(Boolean).join("");
        })
        .join("");
    return [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<rss version=\"2.0\">",
        "<channel>",
        `<title>${escapeXml(options.title)}</title>`,
        `<link>${escapeXml(feedUrl)}</link>`,
        `<description>${escapeXml(options.description)}</description>`,
        `<lastBuildDate>${escapeXml(new Date(updatedIso).toUTCString())}</lastBuildDate>`,
        "<generator>Phaseo Gateway API</generator>",
        itemsXml,
        "</channel>",
        "</rss>",
    ].join("");
}

function buildAtomXml(options: FeedResponseOptions): string {
    const feedUrl = cleanFeedUrl(options.url);
    const updatedIso = resolveUpdatedAtIso(options.items);
    const entriesXml = options.items
        .map((item) => {
            const itemUrl = item.link?.trim() ? item.link.trim() : `${feedUrl}#${encodeURIComponent(item.id)}`;
            const itemUpdatedIso = toDate(item.updatedAt)?.toISOString() ?? updatedIso;
            return [
                "<entry>",
                `<id>${escapeXml(item.id)}</id>`,
                `<title>${escapeXml(item.title)}</title>`,
                `<updated>${escapeXml(itemUpdatedIso)}</updated>`,
                `<summary>${escapeXml(item.summary)}</summary>`,
                `<link href="${escapeXml(itemUrl)}"/>`,
                "</entry>",
            ].join("");
        })
        .join("");
    return [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<feed xmlns=\"http://www.w3.org/2005/Atom\">",
        `<title>${escapeXml(options.title)}</title>`,
        `<id>${escapeXml(feedUrl)}</id>`,
        `<updated>${escapeXml(updatedIso)}</updated>`,
        `<link rel=\"self\" href=\"${escapeXml(feedUrl)}\"/>`,
        `<subtitle>${escapeXml(options.description)}</subtitle>`,
        entriesXml,
        "</feed>",
    ].join("");
}

export function parseFeedFormat(url: URL): ParsedFeedFormat {
    const raw = url.searchParams.get("format") ?? url.searchParams.get("feed");
    if (!raw) {
        return { ok: true, format: "json" };
    }
    const normalized = raw.trim().toLowerCase();
    if (normalized === "json" || normalized === "rss" || normalized === "atom") {
        return { ok: true, format: normalized };
    }
    return { ok: false, raw };
}

export function buildFeedResponse(options: FeedResponseOptions): Response {
    const body = options.format === "rss" ? buildRssXml(options) : buildAtomXml(options);
    const contentType = options.format === "rss"
        ? "application/rss+xml; charset=utf-8"
        : "application/atom+xml; charset=utf-8";
    return new Response(body, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            ...(options.headers ?? {}),
        },
    });
}

export type { FeedFormat, FeedItem };
