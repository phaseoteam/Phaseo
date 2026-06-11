import { cacheLife, cacheTag } from "next/cache";
import type { UpdateCardProps } from "@/lib/fetchers/updates/getLatestUpdates";
import { createAdminClient } from "@/utils/supabase/admin";

type DbRow = {
	id: string;
	who: string;
	title: string;
	link: string;
	created_at: string;
};

type CachedRow = {
	id: string;
	who: string;
	title: string;
	link: string;
	created_at: string;
};

const TABLE_NAME = "updates";
const DEFAULT_LIMIT = 60;

const YOUTUBE_BADGE_LABEL = "YouTube Watcher";
const YOUTUBE_BADGE_CLASS =
	"px-2 py-1 text-xs flex items-center gap-1 transition-colors bg-rose-100 text-rose-900 border border-rose-300 hover:bg-rose-200 hover:text-rose-900 hover:border-rose-400 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700 dark:hover:bg-rose-900 dark:hover:text-rose-200 dark:hover:border-rose-600 rounded-full";
const YOUTUBE_ACCENT_CLASS = "bg-rose-500";

function normaliseLimit(limit: number): number {
	if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
	const value = Math.trunc(limit);
	return value > 0 ? value : DEFAULT_LIMIT;
}

function isExternal(href: string) {
	try {
		const url = new URL(href);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

async function fetchYouTubeUpdateRows(limit: number): Promise<CachedRow[]> {
	const supabase = createAdminClient();

	const { data, error } = (await supabase
		.from(TABLE_NAME)
		.select("id,type,who,title,link,created_at")
		.eq("type", "youtube")
		.order("created_at", { ascending: false })
		.limit(limit)) as { data: (DbRow & { type?: string })[] | null; error: any };

	if (error) {
		console.error("[updates] failed to query Supabase updates table:", error);
		return [];
	}

	return (data ?? []).map((row) => ({
		id: row.id,
		title: row.title,
		who: row.who,
		link: row.link,
		created_at: new Date(row.created_at).toISOString(),
	}));
}

async function getYouTubeUpdateRowsCached(limit: number): Promise<CachedRow[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("data:latest-youtube-updates");
	cacheTag("frontend:youtube-updates");

	return fetchYouTubeUpdateRows(limit);
}

function toUpdateCard(row: CachedRow): UpdateCardProps {
	const { created_at, ...rest } = row;
	return {
		id: rest.id,
		title: rest.title,
		subtitle: rest.who,
		link: {
			href: rest.link,
			external: isExternal(rest.link),
			cta: "Watch",
		},
		dateIso: created_at,
		badges: [
			{
				label: YOUTUBE_BADGE_LABEL,
				iconName: "monitor-play",
				className: YOUTUBE_BADGE_CLASS,
			},
		],
		accentClass: YOUTUBE_ACCENT_CLASS,
	};
}

export async function getYouTubeUpdates(
	limit: number
): Promise<UpdateCardProps[]> {
	const effectiveLimit = normaliseLimit(limit);
	const rows = await getYouTubeUpdateRowsCached(effectiveLimit);
	return rows.map(toUpdateCard);
}

export async function getYouTubeUpdatesCached(
	limit: number
): Promise<UpdateCardProps[]> {
	return await getYouTubeUpdates(limit);
}
