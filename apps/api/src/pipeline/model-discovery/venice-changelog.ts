// Purpose: Use Venice's official API changelog as a model lifecycle source.
// Why: `/models` diffs only see a model once it disappears; the changelog announces removal dates,
//      replacements, re-pricing and cancelled removals ahead of time, with the date each happened.
// How: Parse the Markdown changelog into one entry per (date, kind, model id), remember the entry keys
//      already reported, and match new entries to Phaseo's Venice routes to say what an operator must do.
//      Reporting only: nothing here changes routes, prices or end dates.

import { getSupabaseAdmin } from "@/runtime/env";

export const VENICE_CHANGELOG_STATE_ID = "venice-changelog";
export const VENICE_CHANGELOG_SOURCE_URL = "https://docs.venice.ai/changelog.md";
export const VENICE_CHANGELOG_PAGE_URL = "https://docs.venice.ai/changelog";
export const VENICE_ROUTE_PROVIDER_IDS = ["venice", "venice-e2ee"] as const;

export type VeniceChangelogKind = "added" | "deprecated" | "removed" | "price_change" | "removal_cancelled";

export type VeniceChangelogEntry = {
	/** ISO date (YYYY-MM-DD) of the changelog day heading. */
	date: string;
	kind: VeniceChangelogKind;
	/** Venice API model id, as written in backticks. */
	modelId: string;
	modelName: string;
	/** ISO date the model is (or was) removed, when the bullet says "removed on …". */
	removalDate: string | null;
	/** Venice id to use instead, when the bullet says "use `…` instead". */
	replacementId: string | null;
	/** Text after the model ids, with Markdown escapes removed (prices for price changes). */
	detail: string;
};

const MONTHS: Record<string, number> = {
	january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
	july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const SECTION_KINDS: Record<string, VeniceChangelogKind> = {
	added: "added",
	deprecated: "deprecated",
	removed: "removed",
	"price changes": "price_change",
	"price change": "price_change",
	"no longer scheduled for removal": "removal_cancelled",
};

const DAY_HEADING = /^\*\*([A-Za-z]+) (\d{1,2}), (\d{4})\*\*$/;
const BOLD_HEADING = /^\*\*([^*]+)\*\*$/;
// `* [Name](url): ids…` or `* Name: ids…`. Prose bullets (`* **Feature** — …`) never match.
const MODEL_BULLET = /^[*-]\s+(?:\[([^\]]+)\]\([^)]*\)|([^:`*[\]]+?)):\s*(`.*)$/;
const REMOVAL_DATE = /removed on ([A-Za-z]+) (\d{1,2}), (\d{4})/i;
const REPLACEMENT = /use `([^`]+)` instead/i;

/** ISO date for a written date, or null for an impossible one such as February 30. */
function isoDate(month: string, day: string, year: string): string | null {
	const monthNumber = MONTHS[month.toLowerCase()];
	const dayNumber = Number(day);
	const yearNumber = Number(year);
	if (!monthNumber || !Number.isInteger(dayNumber) || !Number.isInteger(yearNumber) || dayNumber < 1) return null;
	const parsed = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
	if (parsed.getUTCFullYear() !== yearNumber || parsed.getUTCMonth() !== monthNumber - 1 || parsed.getUTCDate() !== dayNumber) return null;
	return `${year}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
}

function unescapeMarkdown(value: string): string {
	return value.replace(/\\([\\`*_[\]{}()#+\-.!$])/g, "$1").trim();
}

/** Splits "`a`, `b`, rest" into the leading backticked ids and the remaining text. */
function splitModelIds(text: string): { ids: string[]; rest: string } {
	const ids: string[] = [];
	let rest = text;
	while (true) {
		const match = /^`([^`]+)`/.exec(rest);
		if (!match) break;
		ids.push(match[1].trim());
		rest = rest.slice(match[0].length);
		const separator = /^,\s*(?=`)/.exec(rest);
		if (!separator) break;
		rest = rest.slice(separator[0].length);
	}
	return { ids, rest: rest.replace(/^[,;]\s*/, "") };
}

/**
 * Parses Venice's changelog Markdown. Only bullets under a dated day heading and a known model
 * section are returned; monthly API prose (`**October 2026**`) and unknown sections are skipped.
 */
export function parseVeniceChangelog(markdown: string): VeniceChangelogEntry[] {
	const entries: VeniceChangelogEntry[] = [];
	const seen = new Set<string>();
	let date: string | null = null;
	let kind: VeniceChangelogKind | null = null;

	for (const rawLine of markdown.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line) continue;

		const day = DAY_HEADING.exec(line);
		if (day) {
			date = isoDate(day[1], day[2], day[3]);
			kind = null;
			continue;
		}
		const heading = BOLD_HEADING.exec(line);
		if (heading) {
			const label = heading[1].trim().toLowerCase();
			if (label in SECTION_KINDS) {
				kind = SECTION_KINDS[label];
			} else {
				// Any other bold heading (a month such as "October 2026") starts non-model content.
				date = null;
				kind = null;
			}
			continue;
		}
		if (line.startsWith("#")) {
			date = null;
			kind = null;
			continue;
		}
		if (!date || !kind) continue;

		const bullet = MODEL_BULLET.exec(line);
		if (!bullet) continue;
		const modelName = unescapeMarkdown(bullet[1] ?? bullet[2] ?? "");
		const { ids, rest } = splitModelIds(bullet[3]);
		const detail = unescapeMarkdown(rest);
		const removal = REMOVAL_DATE.exec(detail);
		const replacement = REPLACEMENT.exec(detail);
		for (const modelId of ids) {
			const entry: VeniceChangelogEntry = {
				date,
				kind,
				modelId,
				modelName,
				removalDate: removal ? isoDate(removal[1], removal[2], removal[3]) : null,
				replacementId: replacement ? replacement[1].trim() : null,
				detail,
			};
			const key = veniceChangelogEntryKey(entry);
			if (seen.has(key)) continue;
			seen.add(key);
			entries.push(entry);
		}
	}
	return entries;
}

/**
 * Stable identity of an entry. It includes the facts an operator acts on (removal date, replacement,
 * price text), so Venice correcting a removal date or a price is reported again, while rewording the
 * model's display name or link is not.
 */
export function veniceChangelogEntryKey(entry: VeniceChangelogEntry): string {
	const facts = entry.kind === "price_change"
		? entry.detail
		: [entry.removalDate ?? "", entry.replacementId ?? ""].join(">");
	return [entry.date, entry.kind, entry.modelId.toLowerCase(), facts].join("|");
}

export type VeniceRouteRow = {
	provider_model_id: string;
	provider_slug: string;
	provider_model_slug: string;
	status: string | null;
	effective_to: string | null;
};

export type VeniceChangelogItem = {
	entry: VeniceChangelogEntry;
	routeIds: string[];
	/** What an operator should do; empty when Phaseo already reflects the change. */
	actions: string[];
};

function isClosedRoute(route: VeniceRouteRow): boolean {
	return route.status === "retired" || route.status === "disabled";
}

function endDate(route: VeniceRouteRow): string | null {
	if (!route.effective_to) return null;
	const ms = Date.parse(route.effective_to);
	return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

/** Decides, per Phaseo route, what a changelog entry asks of an operator. Pure. */
export function matchVeniceChangelogEntry(entry: VeniceChangelogEntry, routes: VeniceRouteRow[]): VeniceChangelogItem {
	const id = entry.modelId.toLowerCase();
	const matched = routes.filter((route) => route.provider_model_slug.trim().toLowerCase() === id);
	const routeIds = matched.map((route) => route.provider_model_id).sort();
	const actions: string[] = [];
	const replacement = entry.replacementId ? `; Venice suggests \`${entry.replacementId}\`` : "";

	switch (entry.kind) {
		case "added":
			if (matched.length === 0) actions.push(`no Phaseo route for \`${entry.modelId}\`; review for onboarding`);
			break;
		case "deprecated":
		case "removed": {
			const removalDate = entry.removalDate ?? (entry.kind === "removed" ? entry.date : null);
			for (const route of matched) {
				if (isClosedRoute(route)) continue;
				const current = endDate(route);
				if (current && removalDate && current <= removalDate) continue;
				if (entry.kind === "removed") {
					actions.push(`set effective_to ${removalDate} and retire ${route.provider_model_id} (removed upstream)${replacement}`);
				} else if (removalDate) {
					actions.push(`set effective_to ${removalDate} on ${route.provider_model_id}${replacement}`);
				}
			}
			break;
		}
		case "removal_cancelled":
			for (const route of matched) {
				if (isClosedRoute(route)) continue;
				const current = endDate(route);
				if (current) actions.push(`review effective_to ${current} on ${route.provider_model_id} (Venice cancelled the removal)`);
			}
			break;
		case "price_change":
			for (const route of matched) {
				if (isClosedRoute(route)) continue;
				actions.push(`check pricing on ${route.provider_model_id}: ${entry.detail}`);
			}
			break;
	}
	return { entry, routeIds, actions };
}

export type VeniceChangelogMonitorSummary = {
	enabled: boolean;
	executed: boolean;
	/** True when there was no stored state, so only entries that need action were reported. */
	baselineInitialized: boolean;
	unchanged: boolean;
	entriesParsed: number;
	newEntries: number;
	/** Items reported this run (new, and on a baseline run only those with actions). */
	items: VeniceChangelogItem[];
	updatesDetected: number;
	error?: string | null;
};

export function emptyVeniceChangelogSummary(enabled: boolean): VeniceChangelogMonitorSummary {
	return {
		enabled,
		executed: false,
		baselineInitialized: false,
		unchanged: false,
		entriesParsed: 0,
		newEntries: 0,
		items: [],
		updatesDetected: 0,
	};
}

// Same-day tie-break between lifecycle entries for one model: a removal beats a cancellation beats a deprecation.
const LIFECYCLE_PRIORITY: Partial<Record<VeniceChangelogKind, number>> = { removed: 3, removal_cancelled: 2, deprecated: 1 };

/** The newest deprecated / removed / removal_cancelled entry per model id (lowercased). */
export function latestLifecycleEntries(entries: VeniceChangelogEntry[]): Map<string, VeniceChangelogEntry> {
	const latest = new Map<string, VeniceChangelogEntry>();
	for (const entry of entries) {
		const priority = LIFECYCLE_PRIORITY[entry.kind];
		if (priority === undefined) continue;
		const id = entry.modelId.toLowerCase();
		const current = latest.get(id);
		if (!current || entry.date > current.date || (entry.date === current.date && priority > (LIFECYCLE_PRIORITY[current.kind] ?? 0))) {
			latest.set(id, entry);
		}
	}
	return latest;
}

// Historical additions and price changes cannot be told apart from ones already handled, so a
// baseline run reports only lifecycle entries whose action is still visible on a route.
const BASELINE_KINDS = new Set<VeniceChangelogKind>(["deprecated", "removed", "removal_cancelled"]);

/**
 * Chooses which entries to report. On a baseline (no stored keys) the whole history is "new", so only
 * lifecycle entries that still need an action on a Phaseo route are reported; afterwards every unseen entry is.
 */
export function selectVeniceChangelogItems(args: {
	entries: VeniceChangelogEntry[];
	seenKeys: Set<string> | null;
	routes: VeniceRouteRow[];
}): { items: VeniceChangelogItem[]; newEntries: number } {
	const fresh = args.seenKeys
		? args.entries.filter((entry) => !args.seenKeys!.has(veniceChangelogEntryKey(entry)))
		: args.entries;
	const latest = latestLifecycleEntries(args.entries);
	// Venice re-listing a model after deprecating or removing it supersedes that lifecycle entry.
	const latestAdded = new Map<string, string>();
	for (const entry of args.entries) {
		if (entry.kind !== "added") continue;
		const id = entry.modelId.toLowerCase();
		if (entry.date > (latestAdded.get(id) ?? "")) latestAdded.set(id, entry.date);
	}
	const items = fresh
		.map((entry) => {
			const item = matchVeniceChangelogEntry(entry, args.routes);
			const id = entry.modelId.toLowerCase();
			// A deprecation later cancelled, re-dated or followed by the removal asks for nothing itself,
			// and neither does a deprecation or removal followed by Venice adding the model again.
			// A cancelled removal is never superseded by a re-listing: its end-date review still applies.
			const relisted = (entry.kind === "deprecated" || entry.kind === "removed") && (latestAdded.get(id) ?? "") > entry.date;
			const superseded = LIFECYCLE_PRIORITY[entry.kind] !== undefined && (latest.get(id) !== entry || relisted);
			return superseded ? { ...item, actions: [] } : item;
		})
		.filter((item) => args.seenKeys !== null || (BASELINE_KINDS.has(item.entry.kind) && item.actions.length > 0));
	items.sort((a, b) =>
		Number(b.actions.length > 0) - Number(a.actions.length > 0)
		|| b.entry.date.localeCompare(a.entry.date)
		|| a.entry.modelId.localeCompare(b.entry.modelId)
	);
	return { items, newEntries: fresh.length };
}

const KIND_LABELS: Record<VeniceChangelogKind, string> = {
	added: "added",
	deprecated: "deprecated",
	removed: "removed",
	price_change: "price change",
	removal_cancelled: "removal cancelled",
};
const INFO_IDS_PER_LINE = 20;
/** Room left in each message for a "(part n/m)" header. */
const PART_HEADER_ROOM = 24;
const CONTINUATION_PREFIX = "  ↳ ";

/**
 * Every reported item as its own line (informational ids grouped a few per line). Nothing is capped or
 * dropped: every entry whose key is saved as seen is named in what gets delivered.
 */
export function buildVeniceChangelogDiscordLines(summary: VeniceChangelogMonitorSummary): string[] {
	if (summary.updatesDetected === 0 || summary.items.length === 0) return [];
	const actionable = summary.items.filter((item) => item.actions.length > 0);
	const informational = summary.items.filter((item) => item.actions.length === 0);
	const count = summary.items.length;
	const noun = summary.baselineInitialized
		? `open lifecycle item${count === 1 ? "" : "s"}`
		: `new entr${count === 1 ? "y" : "ies"}`;
	const lines: string[] = [
		`Venice changelog: ${count} ${noun}, ${actionable.length} need${actionable.length === 1 ? "s" : ""} action (${VENICE_CHANGELOG_PAGE_URL}).`,
	];
	for (const item of actionable) {
		const { entry } = item;
		const removal = entry.removalDate && entry.kind !== "price_change" ? `, removal ${entry.removalDate}` : "";
		lines.push(`- ${entry.date} ${KIND_LABELS[entry.kind]} \`${entry.modelId}\`${removal}: ${item.actions.join("; ")}`);
	}
	for (let i = 0; i < informational.length; i += INFO_IDS_PER_LINE) {
		const ids = informational.slice(i, i + INFO_IDS_PER_LINE).map((item) => `${KIND_LABELS[item.entry.kind]} ${item.entry.modelId}`);
		lines.push(`${i === 0 ? "No route change needed" : "No route change needed (cont.)"}: ${ids.join(", ")}`);
	}
	return lines;
}

export function buildVeniceChangelogDiscordSection(summary: VeniceChangelogMonitorSummary): string {
	return buildVeniceChangelogDiscordLines(summary).join("\n").trim();
}

/** Breaks a line longer than `width` into pieces, preferring spaces, keeping every character. */
function wrapLine(line: string, width: number): string[] {
	if (line.length <= width) return [line];
	const pieces: string[] = [];
	let rest = line;
	let first = true;
	while (rest.length > 0) {
		const room = first ? width : width - CONTINUATION_PREFIX.length;
		if (rest.length <= room) {
			pieces.push(first ? rest : CONTINUATION_PREFIX + rest);
			break;
		}
		const space = rest.lastIndexOf(" ", room);
		const cut = space > room / 2 ? space + 1 : room;
		const piece = rest.slice(0, cut);
		pieces.push(first ? piece : CONTINUATION_PREFIX + piece);
		rest = rest.slice(cut);
		first = false;
	}
	return pieces;
}

/**
 * Splits text lines into chat messages of at most `maxLength` characters without dropping anything. Lines are
 * kept whole where they fit; a line longer than a message is wrapped onto continuation lines.
 */
export function splitLinesIntoMessages(lines: string[], maxLength: number): string[] {
	if (lines.length === 0) return [];
	const budget = maxLength - PART_HEADER_ROOM;
	const pieces = lines.flatMap((line) => wrapLine(line, budget));
	const chunks: string[][] = [];
	let current: string[] = [];
	let size = 0;
	for (const piece of pieces) {
		const added = piece.length + (current.length > 0 ? 1 : 0);
		if (current.length > 0 && size + added > budget) {
			chunks.push(current);
			current = [];
			size = 0;
		}
		size += piece.length + (current.length > 0 ? 1 : 0);
		current.push(piece);
	}
	if (current.length > 0) chunks.push(current);
	if (chunks.length === 1) return [chunks[0]!.join("\n")];
	return chunks.map((chunk, index) => `(part ${index + 1}/${chunks.length})\n${chunk.join("\n")}`);
}

/** The Venice lines as messages of at most `maxLength` characters. */
export function buildVeniceChangelogMessages(summary: VeniceChangelogMonitorSummary, maxLength: number): string[] {
	return splitLinesIntoMessages(buildVeniceChangelogDiscordLines(summary), maxLength);
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Fingerprint of the parsed model entries, so edits to API prose or page chrome do not count. */
export async function veniceChangelogFingerprint(entries: VeniceChangelogEntry[]): Promise<string> {
	return sha256Hex(entries.map(veniceChangelogEntryKey).sort().join("\n"));
}

export async function fetchVeniceChangelog(request: typeof fetch = fetch): Promise<string> {
	const response = await request(VENICE_CHANGELOG_SOURCE_URL, {
		headers: { "User-Agent": "Phaseo model lifecycle monitor", Accept: "text/markdown, text/plain;q=0.9" },
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new Error(`Venice changelog returned HTTP ${response.status}`);
	return response.text();
}

export async function loadVeniceRoutes(): Promise<VeniceRouteRow[]> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("v2_model_provider_routes")
		.select("provider_model_id,provider_slug,provider_model_slug,status,effective_to")
		.in("provider_slug", [...VENICE_ROUTE_PROVIDER_IDS]);
	if (error) throw new Error(error.message || "Failed to load Venice routes");
	return ((data ?? []) as VeniceRouteRow[]).filter(
		(row) => typeof row.provider_model_id === "string" && typeof row.provider_model_slug === "string"
	);
}

export type VeniceChangelogCheckResult = {
	summary: VeniceChangelogMonitorSummary;
	/** Page state to save once notifications are delivered; null when nothing changed. */
	stateToSave: { providerId: string; sourceUrl: string; fingerprint: string; contentLines: string[] } | null;
};

/**
 * One hourly check. `previous` is the stored page-state row (fingerprint plus seen entry keys).
 * An unchanged fingerprint returns before any route lookup.
 */
export async function runVeniceChangelogCheck(args: {
	previous: { fingerprint: string; content_lines: string[] } | undefined;
	fetchMarkdown?: () => Promise<string>;
	loadRoutes?: () => Promise<VeniceRouteRow[]>;
}): Promise<VeniceChangelogCheckResult> {
	const summary = emptyVeniceChangelogSummary(true);
	summary.executed = true;
	const markdown = await (args.fetchMarkdown ?? (() => fetchVeniceChangelog()))();
	const entries = parseVeniceChangelog(markdown);
	if (entries.length === 0) throw new Error("Venice changelog contained no model entries; the page format may have changed");
	summary.entriesParsed = entries.length;
	const fingerprint = await veniceChangelogFingerprint(entries);
	if (args.previous?.fingerprint === fingerprint) {
		summary.unchanged = true;
		return { summary, stateToSave: null };
	}

	const seenKeys = args.previous ? new Set(args.previous.content_lines) : null;
	summary.baselineInitialized = seenKeys === null;
	const routes = await (args.loadRoutes ?? loadVeniceRoutes)();
	const { items, newEntries } = selectVeniceChangelogItems({ entries, seenKeys, routes });
	summary.items = items;
	summary.newEntries = newEntries;
	summary.updatesDetected = items.length;
	return {
		summary,
		stateToSave: {
			providerId: VENICE_CHANGELOG_STATE_ID,
			sourceUrl: VENICE_CHANGELOG_SOURCE_URL,
			fingerprint,
			contentLines: entries.map(veniceChangelogEntryKey),
		},
	};
}
