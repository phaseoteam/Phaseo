import type { PaletteItem } from "./Search.types";

export const PINNED_STORAGE_KEY = "phaseo:command-palette:pinned:v1";
export const RECENT_STORAGE_KEY = "phaseo:command-palette:recent:v1";
const MAX_PINNED_ITEMS = 12;
const MAX_RECENT_ITEMS = 5;
let pinnedCache: PaletteItem[] | null = null;
let recentCache: PaletteItem[] | null = null;

function isPaletteItem(value: unknown): value is PaletteItem {
	if (!value || typeof value !== "object") return false;
	const item = value as Partial<PaletteItem>;
	return typeof item.id === "string" && typeof item.title === "string";
}

function isPersistablePinnedItem(item: PaletteItem): boolean {
	return item.persistable !== false && !item.id.startsWith("workspace:");
}

function isRecentableItem(item: PaletteItem): boolean {
	if (item.workspaceId) return Boolean(item.href?.startsWith("/"));
	return Boolean(
		item.href?.startsWith("/") &&
		!item.external &&
		!item.action &&
		!item.id.startsWith("action-") &&
		!item.id.startsWith("context-"),
	);
}

function normalizeRecentItems(items: readonly PaletteItem[]): PaletteItem[] {
	const seen = new Set<string>();
	const normalized: PaletteItem[] = [];

	for (const item of items) {
		if (!isRecentableItem(item) || seen.has(item.id)) continue;
		seen.add(item.id);
		normalized.push({
			id: item.id,
			title: item.title,
			subtitle: item.subtitle,
			href: item.href,
			logoId: item.logoId,
			flagIso: item.flagIso,
			workspaceId: item.workspaceId,
			persistable: item.workspaceId ? false : item.persistable,
		});
		if (normalized.length === MAX_RECENT_ITEMS) break;
	}

	return normalized;
}

export function readPinnedItems(): PaletteItem[] {
	if (pinnedCache) return pinnedCache;
	if (typeof window === "undefined") return [];
	try {
		const rawValue = window.localStorage.getItem(PINNED_STORAGE_KEY);
		const parsed = rawValue ? (JSON.parse(rawValue) as unknown) : [];
		const storedItems = Array.isArray(parsed) ? parsed.filter(isPaletteItem) : [];
		pinnedCache = storedItems.filter(isPersistablePinnedItem).slice(0, MAX_PINNED_ITEMS);
		if (pinnedCache.length !== storedItems.length) {
			window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinnedCache));
		}
	} catch {
		pinnedCache = [];
	}
	return pinnedCache;
}

export function writePinnedItems(items: readonly PaletteItem[]): PaletteItem[] {
	const normalized = items
		.filter(isPersistablePinnedItem)
		.slice(0, MAX_PINNED_ITEMS)
		.map((item) => ({ ...item }));
	pinnedCache = normalized;
	if (typeof window !== "undefined") {
		try {
			window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(normalized));
		} catch {
			// The palette still works when storage is unavailable or full.
		}
	}
	return normalized;
}

export function togglePinnedItem(items: readonly PaletteItem[], item: PaletteItem): PaletteItem[] {
	if (!isPersistablePinnedItem(item)) return items.filter(isPersistablePinnedItem);
	if (items.some((candidate) => candidate.id === item.id)) {
		return items.filter((candidate) => candidate.id !== item.id);
	}
	return [item, ...items].slice(0, MAX_PINNED_ITEMS);
}

export function invalidatePinnedItemsCache(): void {
	pinnedCache = null;
}

export function readRecentItems(): PaletteItem[] {
	if (recentCache) return recentCache;
	if (typeof window === "undefined") return [];

	try {
		const rawValue = window.localStorage.getItem(RECENT_STORAGE_KEY);
		const parsed = rawValue ? (JSON.parse(rawValue) as unknown) : [];
		recentCache = normalizeRecentItems(
			Array.isArray(parsed) ? parsed.filter(isPaletteItem) : [],
		);
		if (JSON.stringify(parsed) !== JSON.stringify(recentCache)) {
			window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentCache));
		}
	} catch {
		recentCache = [];
	}

	return recentCache;
}

export function addRecentItem(
	items: readonly PaletteItem[],
	item: PaletteItem,
): PaletteItem[] {
	if (!isRecentableItem(item)) return [...items];
	return normalizeRecentItems([item, ...items.filter((candidate) => candidate.id !== item.id)]);
}

export function writeRecentItems(items: readonly PaletteItem[]): PaletteItem[] {
	recentCache = normalizeRecentItems(items);
	if (typeof window !== "undefined") {
		try {
			window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentCache));
		} catch {
			// Search remains usable when storage is unavailable or full.
		}
	}
	return recentCache;
}

export function clearRecentItems(): PaletteItem[] {
	return writeRecentItems([]);
}

export function invalidateRecentItemsCache(): void {
	recentCache = null;
}
