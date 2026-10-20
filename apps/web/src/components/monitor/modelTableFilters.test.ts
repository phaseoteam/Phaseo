import {
	countModelsByFilterValue,
	filterModelTableRowsBySearch,
	matchesModelTableRow,
	NO_MODEL_TABLE_FILTERS,
	type ModelTableFilters,
} from "./modelTableFilters";
import { groupModelRows, type ModelData } from "./modelTableGrouping";

function route(modelId: string, providerId: string, overrides: Partial<ModelData> = {}): ModelData {
	return {
		id: `${modelId}::${providerId}::text.generate`,
		model: modelId,
		modelId,
		organisationId: modelId.split("/")[0],
		provider: {
			id: providerId,
			name: providerId,
			inputPrice: 1,
			outputPrice: 2,
			features: ["tools"],
			executionRegions: ["us"],
		},
		endpoint: "text.generate",
		gatewayStatus: "active",
		inputModalities: ["text"],
		outputModalities: ["text"],
		context: 128_000,
		maxOutput: 16_000,
		tier: "standard",
		added: "2026-01-01",
		...overrides,
	};
}

const filters = (overrides: Partial<ModelTableFilters> = {}): ModelTableFilters => ({
	...NO_MODEL_TABLE_FILTERS,
	...overrides,
});

// Claude Sonnet 5.5 is served by seven routes; Mistral Large 4 by two.
const rows: ModelData[] = [
	...["anthropic", "anthropic-us", "anthropic-aws", "anthropic-aws-us", "google-vertex", "google-vertex-eu", "amazon-bedrock"]
		.map((providerId) => route("anthropic/claude-sonnet-5.5", providerId)),
	route("mistral/mistral-large-4.0", "mistral", { provider: { ...route("", "").provider, id: "mistral", executionRegions: ["eu", "global"] } }),
	route("mistral/mistral-large-4.0", "mistral-eu", { provider: { ...route("", "").provider, id: "mistral-eu", executionRegions: ["eu"] } }),
	route("openai/gpt-6.1-sol", "openai", { endpoint: "batch", tier: "batch" }),
	route("openai/gpt-6.1-sol", "openai", { gatewayStatus: "disabled", inputModalities: ["text", "image"] }),
];

describe("licence filter", () => {
	const licensed = [
		route("mistral/mistral-large-4.0", "mistral", { license: "Apache 2.0" }),
		route("mistral/mistral-large-4.0", "mistral-eu", { license: "Apache 2.0" }),
		route("openai/gpt-6.1-sol", "openai", { license: "Proprietary" }),
		route("catalogue/unlicensed", "provider"),
	];

	it("keeps only routes whose model has a selected licence", () => {
		const active = filters({ licenses: ["Apache 2.0"] });
		expect(licensed.filter((row) => matchesModelTableRow(row, active)).map((row) => row.modelId))
			.toEqual(["mistral/mistral-large-4.0", "mistral/mistral-large-4.0"]);
	});

	it("keeps routes in a selected Open / Closed group", () => {
		const active = filters({ licenseTypes: ["open"] });
		expect(licensed.filter((row) => matchesModelTableRow(row, active)).map((row) => row.provider.id))
			.toEqual(["mistral", "mistral-eu"]);
	});

	it("counts models, not routes, per licence and leaves out models without one", () => {
		const counts = countModelsByFilterValue(licensed, filters({ licenses: ["Proprietary"] }), "licenses");
		expect(Object.fromEntries(counts)).toEqual({ "Apache 2.0": 1, Proprietary: 1 });
	});
});

describe("countModelsByFilterValue", () => {
	it("counts each model once however many provider routes it has", () => {
		const statuses = countModelsByFilterValue(rows, filters(), "statuses");
		expect(statuses.get("active")).toBe(3);
		expect(statuses.get("disabled")).toBe(1);
		expect(countModelsByFilterValue(rows, filters(), "inputModalities").get("text")).toBe(3);
		expect(countModelsByFilterValue(rows, filters(), "features").get("tools")).toBe(3);
		expect(countModelsByFilterValue(rows, filters(), "regions").get("eu")).toBe(1);
		expect(countModelsByFilterValue(rows, filters(), "providers").get("anthropic")).toBe(1);
	});

	it("agrees with the number of table rows that selecting the value shows", () => {
		const active = filters({ statuses: ["active"] });
		const tiers = countModelsByFilterValue(rows, active, "tiers");
		for (const [tier, count] of tiers) {
			const shown = groupModelRows(rows.filter((row) => matchesModelTableRow(row, { ...active, tiers: [tier] })));
			expect(shown).toHaveLength(count);
		}
		expect(Object.fromEntries(tiers)).toEqual({ standard: 2, batch: 1 });
	});

	it("applies every other active filter but not the dimension being counted", () => {
		const imageInput = filters({ inputModalities: ["image"] });
		expect(Object.fromEntries(countModelsByFilterValue(rows, imageInput, "statuses"))).toEqual({ disabled: 1 });
		// Route-level semantics: the image route is disabled, so with the default
		// active-only status filter no model offers image input.
		expect(countModelsByFilterValue(rows, filters({ statuses: ["active"] }), "inputModalities").get("image")).toBeUndefined();
		expect(countModelsByFilterValue(rows, filters({ statuses: ["active"], inputModalities: ["image"] }), "inputModalities").get("text")).toBe(3);
	});

	it("normalises values before counting", () => {
		const counts = countModelsByFilterValue(rows, filters(), "statuses", (value) => value.toUpperCase());
		expect(counts.get("ACTIVE")).toBe(3);
	});
});

describe("filterModelTableRowsBySearch", () => {
	it("matches nested provider fields", () => {
		expect(filterModelTableRowsBySearch(rows, "mistral-eu").map(({ provider }) => provider.id)).toEqual(["mistral-eu"]);
		expect(filterModelTableRowsBySearch(rows, "")).toHaveLength(rows.length);
	});
});
