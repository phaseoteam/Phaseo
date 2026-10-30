import { GLOBAL_NAVIGATION_ITEMS } from "./Search.navigation";
import {
	EXTERNAL_RESOURCE_ITEMS,
	getContextItems,
	GLOBAL_ACTION_ITEMS,
	parsePaletteQuery,
} from "./Search.commands";
import { togglePinnedItem } from "./Search.storage";

describe("command palette commands", () => {
	it("provides unique static command IDs and keyboard aliases", () => {
		const items = [
			...GLOBAL_NAVIGATION_ITEMS,
			...GLOBAL_ACTION_ITEMS,
			...EXTERNAL_RESOURCE_ITEMS,
		];
		const ids = items.map((item) => item.id);
		const shortcuts = items
			.filter((item) => item.shortcut)
			.map((item) => item.shortcut?.join(" "));

		expect(new Set(ids).size).toBe(ids.length);
		expect(new Set(shortcuts).size).toBe(shortcuts.length);
	});

	it("keeps external resources on secure URLs", () => {
		expect(EXTERNAL_RESOURCE_ITEMS.length).toBeGreaterThanOrEqual(5);
		expect(
			EXTERNAL_RESOURCE_ITEMS.every(
				(item) => item.external === true && item.href?.startsWith("https://"),
			),
		).toBe(true);
	});

	it("builds useful model-page context commands", () => {
		const items = getContextItems("/models/openai/gpt-5");

		expect(items).toEqual(expect.arrayContaining([
			expect.objectContaining({ title: "Chat with this model", href: "/chat?model=openai%2Fgpt-5" }),
			expect.objectContaining({ title: "Compare this model", href: "/compare?models=openai%2Fgpt-5" }),
			expect.objectContaining({ title: "Copy model ID", actionValue: "openai/gpt-5" }),
		]));
	});

	it("adds cache controls on admin data pages", () => {
		const items = getContextItems("/internal/data/models/edit/openai/gpt-5");
		expect(items).toEqual(expect.arrayContaining([
			expect.objectContaining({
				title: "Open cache controls for this model",
				href: "/internal/cache?scope=model&target=openai%2Fgpt-5",
			}),
			expect.objectContaining({ title: "Cache Control Centre", href: "/internal/cache" }),
		]));
	});

	it.each([
		["> theme", "actions", "theme"],
		["/ models", "navigation", "models"],
		["@ claude", "models", "claude"],
		["? docs", "resources", "docs"],
		["models", "all", "models"],
	] as const)("parses %s into the expected scope", (query, scope, term) => {
		expect(parsePaletteQuery(query)).toEqual({ scope, term });
	});
});

describe("command palette pins", () => {
	it("adds a new pin and removes an existing pin", () => {
		const item = GLOBAL_ACTION_ITEMS[0]!;
		const pinned = togglePinnedItem([], item);

		expect(pinned).toEqual([item]);
		expect(togglePinnedItem(pinned, item)).toEqual([]);
	});
});
