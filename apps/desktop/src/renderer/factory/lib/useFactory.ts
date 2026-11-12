import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { FactoryApi, FactorySnapshot, Run, WindowUpdate, WorkItem } from "../../../shared/factory/types";
import { useWorkspace, type FactoryRoute, type FactorySettingsPage } from "../../app/workspace";

export type { FactoryRoute };

/** Factory's main-process API. Throws outside the desktop app, where there is none. */
export const factory = (): FactoryApi => {
	const api = window.phaseoDesktop?.factory;
	if (!api) throw new Error("Factory needs the desktop app.");
	return api;
};

export const openExternal = (url: string) => void window.phaseoDesktop?.openExternal(url);

/**
 * One snapshot for every part of the window that shows Factory (the sidebar list, the item page, Settings and the
 * thread chips), kept by a single subscription. Updates leave `items` out when they're unchanged: the last list stays.
 */
let current: FactorySnapshot | null = null;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;

function apply(update: WindowUpdate | FactorySnapshot) {
	current = { ...update, items: update.items ?? current?.items ?? [] };
	for (const listener of listeners) listener();
}

function subscribeSnapshot(listener: () => void) {
	listeners.add(listener);
	const api = window.phaseoDesktop?.factory;
	if (!stop && api) {
		stop = api.onChange(apply);
		void api.snapshot().then((first) => { if (!current || first.loadedAt >= current.loadedAt) apply(first); }, () => undefined);
	}
	return () => {
		listeners.delete(listener);
		if (!listeners.size && stop) {
			stop();
			stop = undefined;
		}
	};
}

export function useSnapshot(): FactorySnapshot | null {
	return useSyncExternalStore(subscribeSnapshot, () => current);
}

/** Where Code ▸ Factory is, and how to move: items by id, their tabs, the new issue form, and Factory's settings. */
export function useFactoryNav() {
	const { factoryRoute, openFactory, openSettings, openThread } = useWorkspace();
	return {
		route: factoryRoute,
		go: (route: FactoryRoute) => openFactory(route),
		settings: (page: FactorySettingsPage = "factory-repositories") => openSettings(page),
		openThread,
	};
}

/** Opens an item's parent thread in Code ▸ Threads, making it first if it has none yet. */
export function useOpenItemThread() {
	const { openThread, setError } = useWorkspace();
	const [busy, setBusy] = useState(false);
	const open = useCallback(async (itemId: string) => {
		setBusy(true);
		try { openThread(await factory().openThread(itemId)); }
		catch (cause) { setError(errorText(cause)); }
		finally { setBusy(false); }
	}, [openThread, setError]);
	return { open, busy };
}

export const errorText = (cause: unknown) => (cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(cause));

/** Re-renders every `ms`, for running timers. */
export function useNow(ms = 1_000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), ms);
		return () => clearInterval(timer);
	}, [ms]);
	return now;
}

/** A file the main process reads (proof, an attachment, a GitHub image) as a data: URL. Undefined while it loads, null when it's gone. */
export function useDataUrl(load: (() => Promise<string | null>) | null, key: string): string | null | undefined {
	const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);
	useEffect(() => {
		if (!load) return;
		let live = true;
		load().then((url) => live && setLoaded({ key, url }), () => live && setLoaded({ key, url: null }));
		return () => {
			live = false;
		};
		// The key names what's loaded; `load` is a new closure every render.
	}, [key]);
	return loaded?.key === key ? loaded.url : undefined;
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

/** An item's description, loaded when it's shown and again when the item changes on GitHub. Null while loading. */
export function useItemBody(item: Pick<WorkItem, "id" | "updatedAt"> | undefined): string | null {
	const [loaded, setLoaded] = useState<{ key: string; body: string } | null>(null);
	const id = item?.id;
	const key = item ? `${item.id}@${item.updatedAt}` : "";
	useEffect(() => {
		if (!id) return;
		let live = true;
		void factory().itemBody(id).then((body) => live && setLoaded({ key, body }), () => live && setLoaded({ key, body: "" }));
		return () => {
			live = false;
		};
	}, [id, key]);
	return loaded?.key === key ? loaded.body : null;
}

/** Which Factory item a desktop thread belongs to: the item's own thread, or one of its stage runs. */
export function threadItem(snapshot: FactorySnapshot | null, threadId: string | undefined): { item: WorkItem; run?: Run } | undefined {
	if (!snapshot || !threadId) return undefined;
	const parent = Object.entries(snapshot.threads).find(([, id]) => id === threadId)?.[0];
	const run = parent ? undefined : snapshot.runs.find((candidate) => candidate.threadId === threadId);
	const itemId = parent ?? run?.itemId;
	const item = itemId ? snapshot.items.find((candidate) => candidate.id === itemId) : undefined;
	return item ? { item, run } : undefined;
}
