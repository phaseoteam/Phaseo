import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;
const UPDATE_CACHE = {
	edgeTtlSeconds: 15 * 60,
	staleWhileRevalidateSeconds: 60 * 60,
} as const;

type ModelEventType = "Announced" | "Released" | "Deprecated" | "Retired";
type ModelEvent = {
	model: {
		model_id: string;
		name: string;
		organisation_id: string;
		organisation: { organisation_id: string; name: string | null };
	};
	types: ModelEventType[];
	date: string;
};

const MODEL_EVENT_RANK: Record<ModelEventType, number> = {
	Released: 0,
	Announced: 1,
	Deprecated: 2,
	Retired: 3,
};

const MODEL_EVENT_STYLE = {
	Announced: {
		label: "Announcement", iconName: "megaphone", accentClass: "bg-blue-500",
		className: "bg-blue-100 text-blue-800 border border-blue-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-blue-200 hover:text-blue-900 hover:border-blue-400 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900 dark:hover:text-blue-200 dark:hover:border-blue-700 rounded-full",
	},
	Released: {
		label: "Release", iconName: "rocket", accentClass: "bg-green-500",
		className: "bg-green-100 text-green-800 border border-green-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-green-200 hover:text-green-900 hover:border-green-400 dark:bg-green-950 dark:text-green-300 dark:border-green-800 dark:hover:bg-green-900 dark:hover:text-green-200 dark:hover:border-green-700 rounded-full",
	},
	Deprecated: {
		label: "Deprecation", iconName: "ban", accentClass: "bg-red-500",
		className: "bg-red-100 text-red-800 border border-red-300 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-red-200 hover:text-red-900 hover:border-red-400 dark:bg-red-950 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-900 dark:hover:text-red-200 dark:hover:border-red-700 rounded-full",
	},
	Retired: {
		label: "Retirement", iconName: "archive", accentClass: "bg-zinc-500",
		className: "bg-zinc-300 text-zinc-800 border border-zinc-400 px-2 py-1 text-xs flex items-center gap-1 transition-colors hover:bg-zinc-400 hover:text-zinc-900 hover:border-zinc-500 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:hover:border-zinc-600 rounded-full",
	},
} as const;

const CARD_STYLES = {
	web: {
		cta: "Open",
		latestCta: "Read",
		label: "Web Update",
		latestLabel: "Web Watcher",
		iconName: "globe",
		className: "px-2 py-1 text-xs flex items-center gap-1 transition-colors bg-sky-100 text-sky-900 border border-sky-300 hover:bg-sky-200 hover:text-sky-900 hover:border-sky-400 dark:bg-sky-900/60 dark:text-sky-200 dark:border-sky-700 dark:hover:bg-sky-900 dark:hover:text-sky-200 dark:hover:border-sky-600 rounded-full",
		accentClass: "bg-sky-500",
	},
	youtube: {
		cta: "Watch",
		latestCta: "Watch",
		label: "YouTube Watcher",
		latestLabel: "YouTube Watcher",
		iconName: "monitor-play",
		className: "px-2 py-1 text-xs flex items-center gap-1 transition-colors bg-rose-100 text-rose-900 border border-rose-300 hover:bg-rose-200 hover:text-rose-900 hover:border-rose-400 dark:bg-rose-900/60 dark:text-rose-200 dark:border-rose-700 dark:hover:bg-rose-900 dark:hover:text-rose-200 dark:hover:border-rose-600 rounded-full",
		accentClass: "bg-rose-500",
	},
} as const;

function parseLimit(value: string | undefined): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
	return Math.min(MAX_LIMIT, Math.trunc(parsed));
}

function isExternal(href: string): boolean {
	try {
		const url = new URL(href);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function relativeTime(iso: string, nowMs: number): string {
	const seconds = Math.round((nowMs - Date.parse(iso)) / 1000);
	const absoluteSeconds = Math.abs(seconds);
	const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
	if (absoluteSeconds < 60) return formatter.format(-seconds, "second");
	const minutes = Math.round(seconds / 60);
	if (Math.abs(minutes) < 60) return formatter.format(-minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) return formatter.format(-hours, "hour");
	const days = Math.round(hours / 24);
	if (Math.abs(days) < 30) return formatter.format(-days, "day");
	const months = Math.round(days / 30);
	if (Math.abs(months) < 12) return formatter.format(-months, "month");
	return formatter.format(-Math.round(months / 12), "year");
}

function normaliseUpdateType(type: unknown, link: string): keyof typeof CARD_STYLES {
	const value = String(type ?? "").toLowerCase();
	return value === "youtube" || /youtu\.?be/.test(link) ? "youtube" : "web";
}

function isoDate(value: unknown): string | null {
	const raw = String(value ?? "").trim();
	if (!raw || raw === "-") return null;
	const timestamp = Date.parse(raw);
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function modelEventSort(left: ModelEvent, right: ModelEvent, ascending: boolean): number {
	if (left.date !== right.date) {
		return ascending
			? left.date.localeCompare(right.date)
			: right.date.localeCompare(left.date);
	}
	const organisationCompare = left.model.organisation.organisation_id.localeCompare(
		right.model.organisation.organisation_id,
	);
	return organisationCompare || left.model.model_id.localeCompare(right.model.model_id);
}

function buildModelEvents(rows: Array<Record<string, unknown>>): ModelEvent[] {
	const events = new Map<string, ModelEvent>();
	for (const row of rows) {
		const organisationRaw = Array.isArray(row.organisation)
			? row.organisation[0]
			: row.organisation;
		const organisation = organisationRaw && typeof organisationRaw === "object"
			? organisationRaw as Record<string, unknown>
			: {};
		const organisationId = String(
			organisation.organisation_id ?? row.organisation_id ?? "",
		);
		const model = {
			model_id: String(row.model_id ?? ""),
			name: String(row.name ?? ""),
			organisation_id: String(row.organisation_id ?? organisationId),
			organisation: {
				organisation_id: organisationId,
				name: organisation.name == null ? null : String(organisation.name),
			},
		};
		for (const [field, type] of [
			["announcement_date", "Announced"],
			["release_date", "Released"],
			["deprecation_date", "Deprecated"],
			["retirement_date", "Retired"],
		] as const) {
			const date = isoDate(row[field]);
			if (!date) continue;
			const key = `${model.model_id}|${date}`;
			const existing = events.get(key);
			if (existing) {
				if (!existing.types.includes(type)) {
					existing.types.push(type);
					existing.types.sort((a, b) => MODEL_EVENT_RANK[a] - MODEL_EVENT_RANK[b]);
				}
			} else {
				events.set(key, { model, types: [type], date });
			}
		}
	}
	return [...events.values()];
}

async function fetchModelEventRows(
	env: Env,
	organisationId?: string,
): Promise<Array<Record<string, unknown>>> {
	let query = getDataClient(env)
		.from("data_models")
		.select("model_id,name,organisation_id,announcement_date,release_date,deprecation_date,retirement_date,organisation:data_organisations!data_models_organisation_id_fkey(organisation_id,name)")
		.eq("hidden", false)
		.or("announcement_date.not.is.null,release_date.not.is.null,deprecation_date.not.is.null,retirement_date.not.is.null");
	if (organisationId) query = query.eq("organisation_id", organisationId);
	const { data, error } = await query;
	if (error) throw error;
	return (data ?? []) as Array<Record<string, unknown>>;
}

export const publicUpdatesRouter = new Hono<{ Bindings: Env }>();

for (const updateType of ["web", "youtube"] as const) {
	publicUpdatesRouter.get(`/updates/${updateType}`, async (c) => {
		const limit = parseLimit(c.req.query("limit"));
		try {
			const { data, error } = await getDataClient(c.env)
				.from("updates")
				.select("id,type,who,title,link,created_at")
				.eq("type", updateType)
				.order("created_at", { ascending: false })
				.limit(limit);
			if (error) throw error;

			const style = CARD_STYLES[updateType];
			const updates = (data ?? []).map((row) => ({
				id: row.id,
				title: row.title,
				subtitle: row.who,
				link: {
					href: row.link,
					external: isExternal(row.link),
					cta: style.cta,
				},
				dateIso: new Date(row.created_at).toISOString(),
				badges: [{
					label: style.label,
					iconName: style.iconName,
					className: style.className,
				}],
				accentClass: style.accentClass,
			}));

			return withPublicCache(c.json({ updates }), {
				...UPDATE_CACHE,
				cacheTags: ["web-api-updates", `web-api-updates-${updateType}`],
			});
		} catch (error) {
			console.error("[web-api/updates] failed", { updateType, error });
			return c.json({ error: "updates_unavailable" }, 503);
		}
	});
}

publicUpdatesRouter.get("/updates/latest", async (c) => {
	const limit = parseLimit(c.req.query("limit"));
	try {
		const { data, error } = await getDataClient(c.env)
			.from("updates")
			.select("id,type,who,title,link,created_at")
			.order("created_at", { ascending: false })
			.limit(Math.min(32, limit));
		if (error) throw error;

		const generatedAt = Date.now();
		const updates = (data ?? []).map((row) => {
			const updateType = normaliseUpdateType(row.type, row.link);
			const style = CARD_STYLES[updateType];
			const dateIso = new Date(row.created_at).toISOString();
			return {
				id: row.id,
				title: row.title,
				subtitle: row.who,
				link: {
					href: row.link,
					external: isExternal(row.link),
					cta: style.latestCta,
				},
				dateIso,
				relative: relativeTime(dateIso, generatedAt),
				badges: [{
					label: style.latestLabel,
					iconName: style.iconName,
					className: style.className,
				}],
				accentClass: style.accentClass,
			};
		});

		return withPublicCache(c.json({ updates }), {
			...UPDATE_CACHE,
			cacheTags: ["web-api-updates", "web-api-updates-latest"],
		});
	} catch (error) {
		console.error("[web-api/updates] latest failed", error);
		return c.json({ error: "updates_unavailable" }, 503);
	}
});

publicUpdatesRouter.get("/updates/models/cards", async (c) => {
	const limit = parseLimit(c.req.query("limit"));
	try {
		const now = Date.now();
		const events = buildModelEvents(await fetchModelEventRows(c.env))
			.filter((event) => Date.parse(event.date) <= now)
			.sort((left, right) => {
				const rank = MODEL_EVENT_RANK[left.types[0]] - MODEL_EVENT_RANK[right.types[0]];
				return rank || modelEventSort(left, right, false);
			})
			.slice(0, Math.min(64, limit));
		const updates = events.map((event) => {
			const badgeType = event.types.includes("Released")
				? "Released"
				: event.types.includes("Announced")
					? "Announced"
					: event.types[0] ?? "Announced";
			const style = MODEL_EVENT_STYLE[badgeType];
			const organisationId = event.model.organisation.organisation_id.toLowerCase();
			return {
				id: `${event.model.model_id}-${event.date}`,
				badges: [{
					label: style.label,
					iconName: style.iconName,
					className: style.className,
				}],
				avatar: {
					organisationId,
					name: event.model.organisation.name,
				},
				title: event.model.name,
				subtitle: event.model.organisation.name,
				source: event.model.organisation.name,
				link: {
					href: `/models/${event.model.model_id}`,
					external: false,
					cta: "View",
				},
				dateIso: event.date,
				relative: relativeTime(event.date, now),
				accentClass: style.accentClass,
			};
		});
		return withPublicCache(c.json({ updates }), {
			...UPDATE_CACHE,
			cacheTags: ["web-api-updates", "web-api-model-updates"],
		});
	} catch (error) {
		console.error("[web-api/updates] model cards failed", error);
		return c.json({ error: "model_updates_unavailable" }, 503);
	}
});

publicUpdatesRouter.get("/updates/models", async (c) => {
	const limit = parseLimit(c.req.query("limit"));
	const offset = Math.max(0, Math.trunc(Number(c.req.query("offset")) || 0));
	const upcomingLimit = Math.min(100, Math.max(0, Math.trunc(Number(c.req.query("upcoming_limit")) || 5)));
	const pastMonths = Math.max(0, Number(c.req.query("past_months")) || 0);
	const includeAllPast = c.req.query("include_all_past") === "true";
	try {
		const now = Date.now();
		const events = buildModelEvents(await fetchModelEventRows(c.env));
		let past = events
			.filter((event) => Date.parse(event.date) <= now)
			.sort((left, right) => modelEventSort(left, right, false));
		if (pastMonths > 0) {
			const since = now - pastMonths * 30 * 24 * 60 * 60 * 1000;
			past = past.filter((event) => Date.parse(event.date) >= since);
		}
		past = includeAllPast ? past.slice(offset) : past.slice(offset, offset + limit);
		const future = events
			.filter((event) => Date.parse(event.date) > now)
			.sort((left, right) => modelEventSort(left, right, true))
			.slice(0, upcomingLimit);
		return withPublicCache(c.json({ past, future }), {
			...UPDATE_CACHE,
			cacheTags: ["web-api-updates", "web-api-model-updates"],
		});
	} catch (error) {
		console.error("[web-api/updates] models failed", error);
		return c.json({ error: "model_updates_unavailable" }, 503);
	}
});

publicUpdatesRouter.get("/updates/organisations/:organisationId/releases", async (c) => {
	const organisationId = c.req.param("organisationId");
	try {
		const now = Date.now();
		const events = buildModelEvents(await fetchModelEventRows(c.env, organisationId))
			.filter((event) =>
				event.types.includes("Released") && Date.parse(event.date) <= now,
			)
			.map((event) => ({ ...event, types: ["Released"] as ModelEventType[] }))
			.sort((left, right) => modelEventSort(left, right, false));
		return withPublicCache(c.json({ events }), {
			...UPDATE_CACHE,
			cacheTags: [
				"web-api-updates",
				"web-api-model-updates",
				`web-api-organisation-updates-${encodeURIComponent(organisationId).replace(/%/g, "")}`.slice(0, 128),
			],
		});
	} catch (error) {
		console.error("[web-api/updates] organisation releases failed", { organisationId, error });
		return c.json({ error: "organisation_updates_unavailable" }, 503);
	}
});
