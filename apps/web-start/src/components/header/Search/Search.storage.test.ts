import { addRecentItem, writeRecentItems, readRecentItems, invalidateRecentItemsCache, RECENT_STORAGE_KEY } from "./Search.storage";
import type { PaletteItem } from "./Search.types";

describe("command palette recent items", () => {
	it("keeps workspace metadata in memory and removes legacy browser persistence", () => {
		const values = new Map<string, string>();
		const previousWindow = globalThis.window;
		Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
		} } });
		try {
			const workspace = { id: "workspace:private", title: "Confidential", href: "/chat", workspaceId: "private", persistable: false };
			const publicPage = { id: "nav-models", title: "Models", href: "/models" };
			expect(writeRecentItems([workspace, publicPage])[0]).toMatchObject(workspace);
			expect(values.get(RECENT_STORAGE_KEY)).not.toContain("Confidential");
			values.set(RECENT_STORAGE_KEY, JSON.stringify([workspace, publicPage]));
			invalidateRecentItemsCache();
			expect(readRecentItems()).toHaveLength(1);
			expect(values.get(RECENT_STORAGE_KEY)).not.toContain("private");
		} finally {
			Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
			invalidateRecentItemsCache();
		}
	});
	it("moves repeated destinations to the front and keeps at most five", () => {
		const items: PaletteItem[] = Array.from({ length: 5 }, (_, index) => ({
			id: `nav-${index}`,
			title: `Page ${index}`,
			href: `/page-${index}`,
		}));

		const inserted = addRecentItem(items, {
			id: "nav-new",
			title: "New page",
			href: "/new-page",
		});
		const next = addRecentItem(inserted, inserted[3]!);

		expect(next).toHaveLength(5);
		expect(next[0]?.id).toBe("nav-2");
		expect(next.filter(({ id }) => id === "nav-2")).toHaveLength(1);
		expect(next.some(({ id }) => id === "nav-4")).toBe(false);
	});

	it("does not record actions or external destinations", () => {
		const initial: PaletteItem[] = [];
		expect(addRecentItem(initial, {
			id: "action-copy",
			title: "Copy URL",
			action: "copy-current-url",
		})).toEqual(initial);
		expect(addRecentItem(initial, {
			id: "resource-docs",
			title: "Docs",
			href: "https://phaseo.app/docs",
			external: true,
		})).toEqual(initial);
	});
});
