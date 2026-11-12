import { maximumQualifierLength, maximumQualifierValues, type PullRequestDirectoryEntry, type PullRequestInvolvement, type PullRequestListFilters, type PullRequestListState } from "../../../shared/pullRequestDirectory";

/** The Pull requests page logic, for one machine and one host. */
export type PullRequestListSort = "ready" | "blocked" | "updated" | "newest" | "oldest" | "largest" | "smallest";
export const pullRequestListSorts: PullRequestListSort[] = ["ready", "blocked", "updated", "newest", "oldest", "largest", "smallest"];
export type PullRequestGroupKey = "authored" | "reviewRequested" | "others";
export type PullRequestGroup<Entry = PullRequestDirectoryEntry> = { key: PullRequestGroupKey; label: string; entries: Entry[] };
export type PullRequestQuickAction = "close" | "merge" | "ready" | "reopen";

const groupLabels: Record<PullRequestGroupKey, string> = { authored: "Authored", reviewRequested: "Review requested", others: "Others" };
const normalize = (value: string | null | undefined) => { const trimmed = value?.trim().toLowerCase() ?? ""; return trimmed || null; };
export const pullRequestEntryKey = (entry: Pick<PullRequestDirectoryEntry, "repository" | "number">) => `${entry.repository.toLowerCase()}#${entry.number}`;
export function pullRequestLabelColor(color?: string | null) { const hex = color?.trim().replace(/^#/, "") ?? ""; return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : null; }

/** What `review:` and `status:` take, in GitHub's spelling and in the filter's own. */
const reviewValues: Record<string, NonNullable<PullRequestListFilters["review"]>> = { approved: "approved", changes_requested: "changes-requested", "changes-requested": "changes-requested", required: "review-required", "review-required": "review-required", none: "none" };
const checksValues: Record<string, NonNullable<PullRequestListFilters["checks"]>> = { success: "passing", passing: "passing", failure: "failing", failing: "failing" };
/** A run of non-space characters in which a quoted stretch counts as part of the token, so `label:"needs design"` stays whole. */
const queryToken = /(?:[^\s"]|"[^"]*")+/g;
const qualifierValue = (raw: string) => raw.replaceAll("\"", "").trim();
/** A qualifier's value as the list it may be: split on commas unless the whole value is quoted. */
function splitQualifierList(raw: string) {
	if (/^\s*"[^"]*"\s*$/.test(raw)) { const whole = qualifierValue(raw); return whole ? [whole] : []; }
	return raw.split(",").map(qualifierValue).filter(Boolean);
}
const boundedNames = (names: readonly string[]) => names.slice(0, maximumQualifierValues).map(name => name.slice(0, maximumQualifierLength).trim()).filter(Boolean);

/**
 * A typed search split into the qualifiers GitHub can act on and the text that is left, written GitHub's way:
 * `label:bug`, `-label:"needs design"`, `author:octocat`, `draft:true`, `review:approved`, `status:success`.
 * An unknown key is read as a label of that whole name (`size:XXL`, `area:web`); quoting it searches for it as text,
 * and so does a known key whose value it does not take.
 */
export function parsePullRequestQuery(raw: string): { text: string; filters: PullRequestListFilters } {
	const text: string[] = [], labels: string[][] = [], excludedLabels: string[] = [];
	let author: string | undefined, draft: PullRequestListFilters["draft"], review: PullRequestListFilters["review"], checks: PullRequestListFilters["checks"];
	for (const [token] of raw.matchAll(queryToken)) {
		const qualifier = /^(-?)([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(token);
		const value = qualifier === null ? "" : qualifierValue(qualifier[3] ?? "");
		const negated = qualifier?.[1] === "-";
		switch (value.length === 0 ? "" : (qualifier?.[2]?.toLowerCase() ?? "")) {
			case "label": {
				const names = boundedNames(splitQualifierList(qualifier?.[3] ?? ""));
				if (!names.length) break;
				if (negated) excludedLabels.push(...names); else labels.push(names);
				continue;
			}
			case "author":
				if (negated || !/^@?[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/.test(value)) break;
				author = value.replace(/^@/, "");
				continue;
			case "draft":
				if (negated || !["true", "false"].includes(value.toLowerCase())) break;
				draft = value.toLowerCase() === "true" ? "only" : "hide";
				continue;
			case "review": {
				const decision = negated ? undefined : reviewValues[value.toLowerCase()];
				if (!decision) break;
				review = decision;
				continue;
			}
			case "status": case "checks": {
				const state = negated ? undefined : checksValues[value.toLowerCase()];
				if (!state) break;
				checks = state;
				continue;
			}
			case "": break;
			default:
				// A pasted link is not a namespaced label: `https://…` would otherwise become one named after its scheme.
				if (!value.startsWith("/")) {
					const names = boundedNames(splitQualifierList(qualifier?.[3] ?? "").map(name => name.includes(":") ? name : `${qualifier?.[2] ?? ""}:${name}`));
					if (!names.length) break;
					if (negated) excludedLabels.push(...names); else labels.push(names);
					continue;
				}
		}
		text.push(token);
	}
	return { text: text.join(" "), filters: { ...(labels.length ? { labels: labels.slice(0, maximumQualifierValues) } : {}), ...(excludedLabels.length ? { excludedLabels: excludedLabels.slice(0, maximumQualifierValues) } : {}), ...(author ? { author } : {}), ...(draft ? { draft } : {}), ...(review ? { review } : {}), ...(checks ? { checks } : {}) } };
}

/** Free text over the fields a row shows, plus `#123` and `123`. */
export function matchesPullRequestQuery(entry: PullRequestDirectoryEntry, query: string) {
	const needle = query.trim().toLowerCase();
	return !needle || `#${entry.number} ${entry.title} ${entry.repository} ${entry.head} ${entry.author?.login ?? ""}`.toLowerCase().includes(needle);
}

const authoredByViewer = (entry: PullRequestDirectoryEntry, viewer?: string | null) => { const login = normalize(viewer); return login !== null && normalize(entry.author?.login) === login; };

export function filterPullRequestsByInvolvement<Entry extends PullRequestDirectoryEntry>(entries: readonly Entry[], viewer: string | undefined, involvement: PullRequestInvolvement): Entry[] {
	if (involvement === "reviewing") return entries.filter(entry => entry.viewerReviewRequested);
	if (involvement === "authored") return entries.filter(entry => authoredByViewer(entry, viewer));
	return [...entries];
}

/**
 * The rows already read, kept only where the filters now being asked about would keep them, so the page never
 * blanks while GitHub answers the new question. Checks are left to GitHub: its `status:` is the commit's combined status.
 */
export function matchesPullRequestFilters(entry: PullRequestDirectoryEntry, filters: PullRequestListFilters, viewer?: string | null) {
	const labels = entry.labels.map(label => label.name.trim().toLowerCase());
	const holds = (label: string) => labels.includes(label.trim().toLowerCase());
	const author = filters.author?.toLowerCase() === "me" ? viewer ?? "me" : filters.author;
	const review = filters.review === "review-required" ? "required" : filters.review;
	return (filters.draft === undefined || entry.draft === (filters.draft === "only"))
		&& (review === undefined || entry.review === review)
		&& (filters.labels === undefined || filters.labels.every(group => group.some(holds)))
		&& (filters.excludedLabels === undefined || !filters.excludedLabels.some(holds))
		&& (author === undefined || entry.author?.login.toLowerCase() === author.toLowerCase());
}

export function narrowPullRequests<Entry extends PullRequestDirectoryEntry>(entries: readonly Entry[], scope: { state: PullRequestListState; projectId?: string }): Entry[] {
	return entries.filter(entry => (scope.state === "all" || entry.state === scope.state) && (scope.projectId === undefined || entry.projectId === scope.projectId));
}

/** Only relationships the rows carry: authored wins over review-requested, everything else is Others. */
export function groupPullRequestsByInvolvement<Entry extends PullRequestDirectoryEntry>(entries: readonly Entry[], viewer?: string): PullRequestGroup<Entry>[] {
	const buckets: Record<PullRequestGroupKey, Entry[]> = { authored: [], reviewRequested: [], others: [] };
	for (const entry of entries) (authoredByViewer(entry, viewer) ? buckets.authored : entry.viewerReviewRequested ? buckets.reviewRequested : buckets.others).push(entry);
	return (["authored", "reviewRequested", "others"] as const).filter(key => buckets[key].length).map(key => ({ key, label: groupLabels[key], entries: buckets[key] }));
}

export type PullRequestAuthorFacet = { login: string; avatarUrl?: string; count: number; mergedCount: number };
export type PullRequestLabelFacet = { name: string; color?: string; count: number };
/** The authors and labels the loaded rows carry, most common first, for the Filters menu. */
export function collectPullRequestFacets(entries: readonly PullRequestDirectoryEntry[], state: PullRequestListState) {
	const authors = new Map<string, PullRequestAuthorFacet>(), labels = new Map<string, PullRequestLabelFacet>();
	for (const entry of new Map(entries.map(value => [pullRequestEntryKey(value), value])).values()) {
		const inState = state === "all" || entry.state === state, login = normalize(entry.author?.login);
		if (login && entry.author) { const held = authors.get(login); authors.set(login, { login: held?.login ?? entry.author.login, ...(held?.avatarUrl ?? entry.author.avatarUrl ? { avatarUrl: held?.avatarUrl ?? entry.author.avatarUrl } : {}), count: (held?.count ?? 0) + Number(inState), mergedCount: (held?.mergedCount ?? 0) + Number(entry.state === "merged") }); }
		if (!inState) continue;
		for (const label of entry.labels) { const key = normalize(label.name); if (!key) continue; const held = labels.get(key); labels.set(key, { name: held?.name ?? label.name, ...(held?.color ?? label.color ? { color: held?.color ?? label.color } : {}), count: (held?.count ?? 0) + 1 }); }
	}
	return {
		authors: [...authors.values()].filter(author => author.count > 0).sort((left, right) => right.mergedCount - left.mergedCount || right.count - left.count || left.login.localeCompare(right.login)),
		labels: [...labels.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
	};
}

/**
 * How well a row answers the searched text. GitHub searches descriptions too, so a real result can have nothing on
 * the row to show for it: those score 10 and are shown last, marked as matched in the description.
 */
export function scorePullRequestMatch(entry: PullRequestDirectoryEntry, query: string) {
	const needle = query.trim().toLowerCase();
	if (!needle) return 0;
	const number = needle.replace(/^#/, "");
	if (/^\d+$/.test(number)) return String(entry.number) === number ? 100 : 0;
	const title = entry.title.toLowerCase(), terms = needle.split(/\s+/).filter(Boolean);
	if (title === needle) return 90;
	if (title.includes(needle)) return 80;
	if (terms.length > 1 && terms.every(term => title.includes(term))) return 70;
	if (entry.head.toLowerCase().includes(needle)) return 60;
	if ((entry.author?.login ?? "").toLowerCase().includes(needle)) return 50;
	if (entry.repository.toLowerCase().includes(needle)) return 40;
	if (terms.some(term => title.includes(term))) return 30;
	return 10;
}
export const matchedElsewhereScore = 10;
export function rankPullRequestMatches<Entry extends PullRequestDirectoryEntry>(entries: readonly Entry[], query: string): Entry[] {
	if (!query.trim()) return [...entries];
	return [...entries].sort((left, right) => scorePullRequestMatch(right, query) - scorePullRequestMatch(left, query) || right.updatedAt.localeCompare(left.updatedAt));
}

const time = (value: string) => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; };
const size = (entry: PullRequestDirectoryEntry) => entry.additions + entry.deletions;
const measured = (entry: PullRequestDirectoryEntry) => size(entry) > 0;

/**
 * The default review queue: green and approved, then green and waiting, then everything else open (drafts too), then
 * finished work; a known conflict is never ready and goes last. Smaller measured diffs first in each tier.
 */
export function rankPullRequestsByMergeReadiness<Entry extends PullRequestDirectoryEntry>(entries: readonly Entry[]): Entry[] {
	const tier = (entry: Entry) => entry.mergeable === "CONFLICTING" ? 4 : entry.state !== "open" ? 3 : entry.draft ? 2 : entry.checks === "passing" && entry.review === "approved" ? 0 : entry.checks === "passing" ? 1 : 2;
	return [...entries].sort((left, right) => tier(left) - tier(right) || Number(measured(right)) - Number(measured(left)) || size(left) - size(right) || right.updatedAt.localeCompare(left.updatedAt));
}
const byTierThenRecency = <Entry extends PullRequestDirectoryEntry>(entries: readonly Entry[], tier: (entry: Entry) => number) => [...entries].sort((left, right) => tier(left) - tier(right) || time(right.updatedAt) - time(left.updatedAt));
/** What the author has to do next: conflicts, requested changes, failing checks, drafts, then the rest. */
export const rankPullRequestsBlockedOnAuthor = <Entry extends PullRequestDirectoryEntry>(entries: readonly Entry[]) => byTierThenRecency(entries, entry => entry.state !== "open" ? 6 : entry.mergeable === "CONFLICTING" ? 0 : entry.review === "changes-requested" ? 1 : entry.checks === "failed" ? 2 : entry.draft ? 3 : entry.checks === "passing" && entry.review === "approved" ? 5 : 4);
export const rankPullRequestsBlockedOnReviewer = <Entry extends PullRequestDirectoryEntry>(entries: readonly Entry[]) => byTierThenRecency(entries, entry => entry.state === "open" ? 0 : 1);

/** Keeps the groups in place and orders inside each. A search keeps its relevance order for readiness and blocked. */
export function sortPullRequestGroups<Entry extends PullRequestDirectoryEntry>(groups: readonly PullRequestGroup<Entry>[], sort: PullRequestListSort, searchText: string, involvement: PullRequestInvolvement = "all"): PullRequestGroup<Entry>[] {
	const within = (rank: (entries: readonly Entry[]) => Entry[]) => groups.map(group => ({ ...group, entries: rank(group.entries) }));
	const searching = searchText.trim().length > 0;
	if (sort === "ready") return searching ? [...groups] : within(rankPullRequestsByMergeReadiness);
	if (sort === "blocked") {
		if (searching) return [...groups];
		return groups.map(group => {
			const role = group.key === "others" ? involvement : group.key === "authored" ? "authored" : "reviewing";
			return role === "all" ? group : { ...group, entries: role === "authored" ? rankPullRequestsBlockedOnAuthor(group.entries) : rankPullRequestsBlockedOnReviewer(group.entries) };
		});
	}
	if (sort === "updated") return [...groups];
	return within(entries => [...entries].sort((left, right) => {
		if (sort === "newest" || sort === "oldest") { const dated = time(left.createdAt) - time(right.createdAt); return (sort === "newest" ? -dated : dated) || time(right.updatedAt) - time(left.updatedAt); }
		const sized = size(left) - size(right);
		return Number(measured(right)) - Number(measured(left)) || (sort === "largest" ? -sized : sized) || time(right.updatedAt) - time(left.updatedAt);
	}));
}

/** The Shift-held row actions: what the state allows, in a fixed order. */
export function pullRequestQuickActions(entry: Pick<PullRequestDirectoryEntry, "state" | "draft">): PullRequestQuickAction[] {
	return entry.state === "merged" ? [] : entry.state === "closed" ? ["reopen"] : entry.draft ? ["close", "ready"] : ["close", "merge"];
}

/** What a row says the moment an action is sent; the next read replaces it. */
export type PullRequestOverride = { state: PullRequestDirectoryEntry["state"]; draft?: boolean; updatedAt: string; at: number };
export function pullRequestOverrideAfterAction(entry: Pick<PullRequestDirectoryEntry, "state">, action: PullRequestQuickAction, now: Date): PullRequestOverride {
	const stamp = { updatedAt: now.toISOString(), at: now.getTime() };
	return action === "close" ? { state: "closed", ...stamp } : action === "reopen" ? { state: "open", ...stamp } : action === "merge" ? { state: "merged", ...stamp } : { state: entry.state, draft: false, ...stamp };
}
/** How long a read that disagrees is taken for GitHub's search index lagging rather than for news. */
const overrideTrustMs = 60_000;
/**
 * The overrides an answer has not yet confirmed. A row in the agreed state, or gone from a list that filters it out,
 * confirms; a row still in the old state is taken for a stale index for a minute, and for the host's news after that.
 */
export function settlePullRequestOverrides(overrides: ReadonlyMap<string, PullRequestOverride>, answered: readonly PullRequestDirectoryEntry[], now: number): ReadonlyMap<string, PullRequestOverride> {
	if (!overrides.size) return overrides;
	const byKey = new Map(answered.map(entry => [pullRequestEntryKey(entry), entry]));
	const kept = new Map<string, PullRequestOverride>();
	for (const [key, override] of overrides) {
		const row = byKey.get(key);
		if (!row) continue;
		const agrees = row.state === override.state && (override.draft === undefined || row.draft === override.draft);
		if (!agrees && now - override.at <= overrideTrustMs) kept.set(key, override);
	}
	return kept.size === overrides.size ? overrides : kept;
}
/** Rows with their pending answers written over them; a row the state filter no longer holds leaves at once. */
export function applyPullRequestOverrides<Entry extends PullRequestDirectoryEntry>(entries: readonly Entry[], overrides: ReadonlyMap<string, PullRequestOverride>, state: PullRequestListState): Entry[] {
	if (!overrides.size) return [...entries];
	return entries.flatMap(entry => {
		const override = overrides.get(pullRequestEntryKey(entry));
		if (!override) return [entry];
		return state !== "all" && override.state !== state ? [] : [{ ...entry, state: override.state, updatedAt: override.updatedAt, ...(override.draft === undefined ? {} : { draft: override.draft }) }];
	});
}

/** Which rows a drag starting on `origin` covers: the run between it and `target` in display order, kept where `canClose` allows. */
export function sweepKeys(ordered: readonly string[], origin: string, target: string, canClose: (key: string) => boolean) {
	const from = ordered.indexOf(origin), to = ordered.indexOf(target);
	if (from < 0 || to < 0) return [];
	const [start, end] = from <= to ? [from, to] : [to, from];
	return ordered.slice(start, end + 1).filter(canClose);
}

export type PullRequestListPreferences = { involvement: PullRequestInvolvement; state: PullRequestListState; projectId?: string; q?: string; draft?: "only" | "hide"; review?: NonNullable<PullRequestListFilters["review"]>; checks?: NonNullable<PullRequestListFilters["checks"]>; author?: string; labels?: string[]; sort?: PullRequestListSort };
export const defaultPullRequestListPreferences: PullRequestListPreferences = { involvement: "all", state: "open" };
export const pullRequestListPreferencesKey = "phaseo.desktop.pullRequests.preferences";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const bounded = (value: unknown) => typeof value === "string" && value.trim() && value.length <= maximumQualifierLength ? value.trim() : undefined;

/** Only list controls are remembered, each checked, so a stale or hand-edited value falls back to the default. */
export function normalizePullRequestListPreferences(value: unknown): PullRequestListPreferences {
	if (!value || typeof value !== "object" || Array.isArray(value)) return defaultPullRequestListPreferences;
	const input = value as Record<string, unknown>;
	const labels = Array.isArray(input.labels) ? [...new Map(input.labels.flatMap(label => { const name = bounded(label); return name ? [[name.toLowerCase(), name] as const] : []; })).values()].slice(0, maximumQualifierValues) : [];
	const projectId = bounded(input.projectId), q = bounded(input.q), author = bounded(input.author);
	return {
		involvement: input.involvement === "reviewing" || input.involvement === "authored" ? input.involvement : "all",
		state: input.state === "closed" || input.state === "merged" || input.state === "all" ? input.state : "open",
		...(projectId ? { projectId } : {}), ...(q ? { q } : {}),
		...(input.draft === "only" || input.draft === "hide" ? { draft: input.draft } : {}),
		...(input.review === "approved" || input.review === "changes-requested" || input.review === "review-required" || input.review === "none" ? { review: input.review } : {}),
		...(input.checks === "passing" || input.checks === "failing" ? { checks: input.checks } : {}),
		...(author ? { author } : {}), ...(labels.length ? { labels } : {}),
		...(pullRequestListSorts.includes(input.sort as PullRequestListSort) && input.sort !== "ready" ? { sort: input.sort as PullRequestListSort } : {}),
	};
}
export function readPullRequestListPreferences(storage: PreferenceStorage | undefined = typeof window === "undefined" ? undefined : window.localStorage): PullRequestListPreferences {
	try { const raw = storage?.getItem(pullRequestListPreferencesKey); return raw ? normalizePullRequestListPreferences(JSON.parse(raw)) : defaultPullRequestListPreferences; } catch { return defaultPullRequestListPreferences; }
}
export function writePullRequestListPreferences(preferences: PullRequestListPreferences, storage: PreferenceStorage | undefined = typeof window === "undefined" ? undefined : window.localStorage) {
	try { storage?.setItem(pullRequestListPreferencesKey, JSON.stringify(normalizePullRequestListPreferences(preferences))); } catch { /* Storage can be full or denied; the page keeps its state for this visit. */ }
}
/** The menu's own narrowings as the filter shape the request and the local pass share. */
export function menuFilters(preferences: PullRequestListPreferences): PullRequestListFilters {
	return { ...(preferences.draft ? { draft: preferences.draft } : {}), ...(preferences.review ? { review: preferences.review } : {}), ...(preferences.checks ? { checks: preferences.checks } : {}), ...(preferences.author ? { author: preferences.author } : {}), ...(preferences.labels?.length ? { labels: preferences.labels.map(label => [label]) } : {}) };
}
/** How many controls are off their default, for the Filters button's count. */
export function activeFilterCount(preferences: PullRequestListPreferences) {
	return [preferences.state !== "open", preferences.involvement !== "all", preferences.projectId, preferences.draft, preferences.review, preferences.checks, preferences.author, ...(preferences.labels ?? [])].filter(Boolean).length;
}
