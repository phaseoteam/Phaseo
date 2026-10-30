import { buildVirtualizedModelCatalogRows } from "./VirtualizedModelCatalog";

describe("buildVirtualizedModelCatalogRows", () => {
	it("flattens headings, items, and section separators with stable keys", () => {
		const rows = buildVirtualizedModelCatalogRows(
			[
				{
					key: "favorites",
					heading: "Favourites",
					items: [{ modelId: "openai/gpt-5" }],
				},
				{
					key: "coming-soon",
					heading: "Coming soon",
					items: [{ modelId: "anthropic/claude-opus-5" }],
					separatorBefore: true,
				},
			],
			(item) => item.modelId,
		);

		expect(rows.map((row) => ({ type: row.type, key: row.key }))).toEqual([
			{ type: "heading", key: "favorites-heading" },
			{ type: "item", key: "favorites-openai/gpt-5" },
			{ type: "separator", key: "coming-soon-separator" },
			{ type: "heading", key: "coming-soon-heading" },
			{
				type: "item",
				key: "coming-soon-anthropic/claude-opus-5",
			},
		]);
	});

	it("omits empty sections and their separators", () => {
		const rows = buildVirtualizedModelCatalogRows(
			[
				{
					key: "empty",
					heading: "Coming soon",
					items: [],
					separatorBefore: true,
				},
			],
			(item: { modelId: string }) => item.modelId,
		);

		expect(rows).toEqual([]);
	});
});
