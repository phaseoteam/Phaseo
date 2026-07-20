import type { SupabaseClient } from "@supabase/supabase-js";

const ALLOWED = new Set([
    "UCXZCJLdBC09xxGZ6gcdrc6A", // OpenAI
    "UCYlq-KmwPjc1DtsGmthFqSQ", // Figure
    "UCP7jMXSY2xbc3KCAE0MHQ-A", // DeepMind
    "UCrDwWp7EBBv4NwvScIpBDOA", // Anthropic
]);

const MAX_RESULTS = 50;

type YoutubeRow = {
    type: "youtube";
    who: string;
    title: string;
    link: string;
    created_at: string;
};

type ChannelSummary = {
    channelId: string;
    rows: YoutubeRow[];
    error: string | null;
};

export type YoutubeWatcherSummary = {
    ok: boolean;
    channels: Array<{ channelId: string; insertedOrUpdated: number; error: string | null }>;
    total: number;
    startedAt: string;
    finishedAt: string;
    dbError: string | null;
};

async function fetchRecent(channelId: string, maxResults = 25, apiKey: string): Promise<YoutubeRow[]> {
    const uploadsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    uploadsUrl.searchParams.set("key", apiKey);
    uploadsUrl.searchParams.set("part", "contentDetails");
    uploadsUrl.searchParams.set("id", channelId);

    const uploadsRes = await fetch(uploadsUrl, { cache: "no-store" });
    if (!uploadsRes.ok) {
        const body = await uploadsRes.text().catch(() => "");
        throw new Error(`channels.list ${channelId} -> ${uploadsRes.status} ${body}`);
    }

    type ChannelDetails = {
        contentDetails?: {
            relatedPlaylists?: { uploads?: string | null } | null;
        } | null;
    };

    type ChannelResponse = {
        items?: ChannelDetails[] | null;
    };

    const channelPayload = (await uploadsRes.json()) as ChannelResponse;
    const uploadsPlaylistId =
        channelPayload?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ??
        null;

    if (!uploadsPlaylistId) return [];

    const itemsUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    itemsUrl.searchParams.set("key", apiKey);
    itemsUrl.searchParams.set("part", "snippet");
    itemsUrl.searchParams.set("playlistId", uploadsPlaylistId);
    itemsUrl.searchParams.set("maxResults", String(Math.min(maxResults, MAX_RESULTS)));

    const itemsRes = await fetch(itemsUrl, { cache: "no-store" });
    if (!itemsRes.ok) {
        const body = await itemsRes.text().catch(() => "");
        throw new Error(`playlistItems.list ${channelId} -> ${itemsRes.status} ${body}`);
    }

    type PlaylistItem = {
        snippet?: {
            title?: string | null;
            publishedAt?: string | null;
            channelTitle?: string | null;
            resourceId?: { videoId?: string | null } | null;
        } | null;
    };

    type PlaylistResponse = {
        items?: PlaylistItem[] | null;
    };

    const payload = (await itemsRes.json()) as PlaylistResponse;
    const items = Array.isArray(payload?.items) ? payload.items : [];

    return items
        .map((item: PlaylistItem): YoutubeRow | null => {
            const snippet = item?.snippet ?? null;
            const videoId = snippet?.resourceId?.videoId ?? undefined;
            if (!videoId) return null;

            const who = snippet?.channelTitle ?? "Unknown Channel";
            const title = snippet?.title ?? "(untitled)";
            const created_at = snippet?.publishedAt ?? "";
            return {
                type: "youtube" as const,
                who,
                title,
                link: `https://www.youtube.com/watch?v=${videoId}`,
                created_at,
            };
        })
        .filter((item): item is YoutubeRow => Boolean(item));
}

export async function runYoutubeWatcher(
    supabase: SupabaseClient,
    apiKey: string,
    options?: { channelIds?: string[]; maxResults?: number }
): Promise<YoutubeWatcherSummary> {
    const startedAt = new Date().toISOString();

    apiKey = (() => {
        if (!apiKey.trim()) {
            throw new Error("Missing YT_API_KEY");
        }
        return apiKey.trim();
    })();

    const channelIds =
        Array.isArray(options?.channelIds) && options.channelIds.length
            ? options.channelIds.filter((id) => ALLOWED.has(id))
            : Array.from(ALLOWED);

    const maxResults = Math.min(options?.maxResults ?? 25, MAX_RESULTS);

    const channelSummaries: ChannelSummary[] = await Promise.all(
        channelIds.map(async (id) => {
            try {
                const rows = await fetchRecent(id, maxResults, apiKey);
                return { channelId: id, rows, error: null };
            } catch (error: any) {
                return { channelId: id, rows: [], error: error?.message ?? String(error) };
            }
        })
    );

    const allRows = channelSummaries.flatMap((summary) => summary.rows);
    let dbError: string | null = null;
    if (allRows.length) {
        const { error } = await supabase.from("updates").upsert(allRows, { onConflict: "link" });
        if (error) {
            dbError = error.message;
        }
    }

    return {
        ok: dbError === null,
        startedAt,
        finishedAt: new Date().toISOString(),
        channels: channelSummaries.map((summary) => ({
            channelId: summary.channelId,
            insertedOrUpdated: summary.rows.length,
            error: summary.error,
        })),
        total: allRows.length,
        dbError,
    };
}
