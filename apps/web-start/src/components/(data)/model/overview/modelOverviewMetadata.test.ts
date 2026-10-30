import {
	getModelLicenseUrl,
	getModelLineageLinks,
	getGenericModelLinks,
	isLicenseModelLink,
	resolveModelLineageNames,
} from "./modelOverviewMetadata";

describe("model overview metadata", () => {
	it("prefers the canonical license URL and recognizes license link aliases", () => {
		expect(isLicenseModelLink({ kind: "licence-text" })).toBe(true);
		expect(
			getModelLicenseUrl({
				license_url: " https://example.com/canonical-license ",
				model_links: [
					{ kind: "license", url: "https://example.com/legacy-license" },
				],
			}),
		).toBe("https://example.com/canonical-license");
	});

	it("falls back to a typed model license link", () => {
		const links = [
			{ kind: "paper", url: "https://example.com/paper" },
			{ platform: "License", url: "https://example.com/license" },
		];
		expect(
			getModelLicenseUrl({
				model_links: links,
			}),
		).toBe("https://example.com/license");
		expect(getGenericModelLinks(links)).toEqual([
			{ kind: "paper", url: "https://example.com/paper" },
		]);
	});

	it("resolves explicit previous and earliest next lineage without inferring names", () => {
		expect(
			getModelLineageLinks(
				[
					{
						date: "2026-09-01",
						eventType: "FutureModel",
						modelId: "openai/gpt-later",
						modelName: "GPT Later",
					},
					{
						date: "2026-08-01",
						eventType: "FutureModel",
						modelId: "openai/gpt-next",
						modelName: "GPT Next",
					},
				],
				"openai/gpt-previous",
			),
		).toEqual({
			previous: {
				modelId: "openai/gpt-previous",
				modelName: "openai/gpt-previous",
			},
			next: { modelId: "openai/gpt-next", modelName: "GPT Next" },
		});
	});

	it("resolves raw lineage IDs to display names", async () => {
		const lineage = getModelLineageLinks(
			[],
			"amazon/nova-lite-1.0",
		);
		const resolved = await resolveModelLineageNames(lineage, async (modelId) =>
			modelId === "amazon/nova-lite-1.0" ? "Nova Lite 1.0" : null,
		);

		expect(resolved.previous).toEqual({
			modelId: "amazon/nova-lite-1.0",
			modelName: "Nova Lite 1.0",
		});
	});

	it("humanizes the model slug when a catalog name is unavailable", async () => {
		const lineage = getModelLineageLinks(
			[],
			"amazon/nova-lite-1.0",
		);
		const resolved = await resolveModelLineageNames(lineage, async () => null);

		expect(resolved.previous?.modelName).toBe("Nova Lite 1.0");
	});
});
