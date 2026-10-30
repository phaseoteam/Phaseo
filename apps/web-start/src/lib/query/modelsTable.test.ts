import type { MonitorModelTableRow } from "@/lib/fetchers/models/table-view/types";
import {
	fetchModelsTableData,
	fetchModelsTableDataV2,
} from "@/lib/query/modelsTable";

function row(id: string): MonitorModelTableRow {
	return {
		id,
		model: id,
		modelId: id,
		provider: {
			id: "test",
			name: "Test",
			inputPrice: 1,
			outputPrice: 2,
			features: [],
		},
		endpoint: "responses",
		gatewayStatus: "active",
		inputModalities: ["text"],
		outputModalities: ["text"],
		context: 128000,
		maxOutput: 4096,
	};
}

const facets = {
	endpoints: ["responses"],
	modalities: ["text"],
	features: ["web_search", "reasoning"],
	statuses: ["active"],
};

describe("fetchModelsTableData", () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("combines table pages and preserves compact filter facets", async () => {
		const fetchMock = jest
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				models: [row("one")], facets, catalogue_version: "v1", shape: "table",
				total: 2, limit: 1, offset: 0,
			})))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				models: [row("two")], catalogue_version: "v1", shape: "table",
				total: 2, limit: 1, offset: 1,
			})));
		global.fetch = fetchMock;

		const result = await fetchModelsTableData(
			"/api/_web/models?limit=1&offset=0&shape=table&projection=2",
		);

		expect(result.models.map((model) => model.id)).toEqual(["one", "two"]);
		expect(result.allEndpoints).toEqual(["responses"]);
		expect(result.allFeatures).toEqual(["reasoning", "web_search"]);
		expect(fetchMock.mock.calls[1]?.[0]).toContain("offset=1");
	});

	it("loads and validates the dedicated V2 table response", async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
			models: [row("v2")], facets, catalogue_version: "v2", shape: "table",
			total: 1, limit: 10000, offset: 0,
		})));

		const result = await fetchModelsTableDataV2(
			"/api/_web/models?limit=10000&shape=table&catalogue_version=v2",
		);

		expect(result.models.map((model) => model.id)).toEqual(["v2"]);
	});

	it("rejects a non-table response for the table cache key", async () => {
		global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
			models: [], facets, catalogue_version: "v2", shape: "page",
			total: 0, limit: 10000, offset: 0,
		})));

		await expect(fetchModelsTableDataV2(
			"/api/_web/models?shape=table&catalogue_version=v2",
		)).rejects.toThrow("invalid response shape");
	});

	it("rejects a later page from a different catalogue version", async () => {
		global.fetch = jest
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				models: [row("one")], facets, catalogue_version: "v2", shape: "table",
				total: 2, limit: 1, offset: 0,
			})))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				models: [row("two")], catalogue_version: "v1", shape: "table",
				total: 2, limit: 1, offset: 1,
			})));

		await expect(fetchModelsTableDataV2(
			"/api/_web/models?limit=1&shape=table&catalogue_version=v2",
		)).rejects.toThrow("returned catalogue v1 for v2 request");
	});
});
