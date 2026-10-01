import { addRecentItem } from "./Search.storage";
import type { PaletteItem } from "./Search.types";

describe("command palette recent items", () => {
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
