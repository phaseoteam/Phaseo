import { useEffect, useState, useSyncExternalStore } from "react";
import type { FactoryApi, FactorySnapshot, Run, WorkItem } from "../../shared/types";

declare global {
	interface Window {
		factory: FactoryApi;
	}
}

export const factory = () => window.factory;

export function useSnapshot(): FactorySnapshot | null {
	const [snapshot, setSnapshot] = useState<FactorySnapshot | null>(null);
	useEffect(() => {
		let live = true;
		void factory().snapshot().then((first) => live && setSnapshot(first));
		const stop = factory().onChange((next) => setSnapshot(next));
		return () => {
			live = false;
			stop();
		};
	}, []);
	return snapshot;
}

/** Re-renders every `ms`, for running timers. */
export function useNow(ms = 1_000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), ms);
		return () => clearInterval(timer);
	}, [ms]);
	return now;
}

export type Page = "work" | "new" | "settings";

export interface Route {
	page: Page;
	/** Work: the selected item's id, owner/name#number. */
	item?: string;
	tab?: string;
}

function parse(hash: string): Route {
	const [pathPart, query = ""] = hash.replace(/^#\/?/, "").split("?");
	const [page = "work", owner, name, number] = pathPart.split("/").map(decodeURIComponent);
	const tab = new URLSearchParams(query).get("tab") ?? undefined;
	// Agents and Playbooks used to be pages of their own; their links now open the matching settings.
	if (page === "agents") return { page: "settings", tab: "agents" };
	if (page === "playbooks") return { page: "settings", tab: `${tab === "pull" ? "pull" : "issue"}-agents` };
	// Monitor was a page too; its links fall through to Work.
	const known: Page[] = ["work", "new", "settings"];
	return { page: known.includes(page as Page) ? (page as Page) : "work", item: owner && name && number ? `${owner}/${name}#${number}` : undefined, tab };
}

/** Items are addressed as work/owner/name/number, so the same number in two repositories never clashes. */
export function href(route: Route): string {
	const path = route.item !== undefined ? `${route.page}/${route.item.replace("#", "/")}` : route.page;
	return `#/${path}${route.tab ? `?tab=${route.tab}` : ""}`;
}

function subscribe(listener: () => void) {
	window.addEventListener("hashchange", listener);
	return () => window.removeEventListener("hashchange", listener);
}

/** The last time each item changed: on GitHub, or by a run starting or finishing. */
export function lastActivity(item: WorkItem, runs: Run[]): number {
	return runs.reduce((latest, run) => (run.itemId === item.id ? Math.max(latest, run.finishedAt ?? run.startedAt) : latest), item.updatedAt);
}

const SEEN_KEY = "factory.seen";
const SEEN_EVENT = "factory-seen";

/** How many comments each item had when it was last opened, so the list can say how many are new. */
const SEEN_COMMENTS_KEY = "factory.seen-comments";

function readSeen(key = SEEN_KEY): Record<string, number> | null {
	try {
		return JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, number> | null;
	} catch {
		return null;
	}
}

/**
 * Which items changed since you last opened them, remembered on this computer. The first time, everything
 * already there counts as seen, so only what changes after is marked new.
 */
export function useSeen(items: WorkItem[], runs: Run[]) {
	const [seen, setSeen] = useState(() => readSeen());
	const [comments, setComments] = useState(() => readSeen(SEEN_COMMENTS_KEY));
	useEffect(() => {
		const sync = () => {
			setSeen(readSeen());
			setComments(readSeen(SEEN_COMMENTS_KEY));
		};
		window.addEventListener(SEEN_EVENT, sync);
		return () => window.removeEventListener(SEEN_EVENT, sync);
	}, []);
	useEffect(() => {
		if (!items.length) return;
		if (!seen) {
			const baseline = Object.fromEntries(items.map((item) => [item.id, lastActivity(item, runs)]));
			localStorage.setItem(SEEN_KEY, JSON.stringify(baseline));
			setSeen(baseline);
		}
		// Items the list hasn't counted yet start from what they have now: only replies after that are new.
		const missing = items.filter((item) => comments?.[item.id] === undefined);
		if (missing.length) {
			const next = { ...comments, ...Object.fromEntries(missing.map((item) => [item.id, item.comments])) };
			localStorage.setItem(SEEN_COMMENTS_KEY, JSON.stringify(next));
			setComments(next);
		}
	}, [seen, comments, items, runs]);
	return {
		isNew: (item: WorkItem) => Boolean(seen) && lastActivity(item, runs) > (seen?.[item.id] ?? 0),
		/** Comments since the item was last opened. */
		newComments: (item: WorkItem) => Math.max(0, item.comments - (comments?.[item.id] ?? item.comments)),
	};
}

/** Marks an item seen as of its latest activity, while it's open. */
export function useMarkSeen(item: WorkItem, runs: Run[]) {
	const activity = lastActivity(item, runs);
	useEffect(() => {
		const seen = readSeen() ?? {};
		const comments = readSeen(SEEN_COMMENTS_KEY) ?? {};
		if ((seen[item.id] ?? 0) >= activity && comments[item.id] === item.comments) return;
		localStorage.setItem(SEEN_KEY, JSON.stringify({ ...seen, [item.id]: Math.max(activity, seen[item.id] ?? 0) }));
		localStorage.setItem(SEEN_COMMENTS_KEY, JSON.stringify({ ...comments, [item.id]: item.comments }));
		window.dispatchEvent(new Event(SEEN_EVENT));
	}, [item.id, activity, item.comments]);
}

/** Below this width the list and an item don't fit side by side, so one shows at a time. */
export const NARROW_WIDTH = 820;

export function useNarrow(): boolean {
	const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_WIDTH);
	useEffect(() => {
		const onResize = () => setNarrow(window.innerWidth < NARROW_WIDTH);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return narrow;
}

export function useRoute(): [Route, (route: Route) => void] {
	const hash = useSyncExternalStore(subscribe, () => window.location.hash);
	return [parse(hash), (route) => (window.location.hash = href(route))];
}

/** An item's description, loaded when it's shown and again when the item changes on GitHub. Null while loading. */
export function useItemBody(item: Pick<WorkItem, "id" | "updatedAt"> | undefined): string | null {
	const [loaded, setLoaded] = useState<{ key: string; body: string } | null>(null);
	const id = item?.id;
	const key = item ? `${item.id}@${item.updatedAt}` : "";
	useEffect(() => {
		if (!id) return;
		let live = true;
		void factory().itemBody(id).then((body) => live && setLoaded({ key, body }));
		return () => {
			live = false;
		};
	}, [id, key]);
	return loaded?.key === key ? loaded.body : null;
}
