import { afterEach, describe, expect, it, vi } from "vitest";

import { getModel, getModelsByIds, listBenchmarkRankings, listModels, listProviders, requestPhaseo, searchModels } from "../src/phaseo-api";

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_WEB_BASE_URL: "https://phaseo.app",
	PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64),
};

const fetchMock = vi.fn();

describe("Phaseo API client", () => {
	afterEach(() => {
		fetchMock.mockReset();
		vi.unstubAllGlobals();
	});

	it("uses the user's OAuth token to list models", async () => {
		fetchMock.mockImplementation(async () => Response.json({ ok: true, models: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(listModels(env, 250, { accessToken: "oauth-token" })).resolves.toEqual([]);
		const request = fetchMock.mock.calls[0]?.[0] as Request;
		expect(request.url).toBe("https://api.phaseo.app/v1/models?limit=250");
		expect(request.method).toBe("GET");
		expect(request.headers.get("authorization")).toBe("Bearer oauth-token");
	});

	it("delegates catalogue-wide filtering and sorting to one bounded API request", async () => {
		fetchMock.mockResolvedValue(Response.json({ ok: true, total: 1, models: [{ id: "model-250" }] }));
		vi.stubGlobal("fetch", fetchMock);

		const models = await searchModels(env, {
			query: "coding model",
			provider: "Example",
			modality: "text",
			minimumContextTokens: 128_000,
			maximumInputPricePerMillion: 2,
			gatewayAvailableOnly: true,
			sortBy: "input_price",
			sortOrder: "asc",
			limit: 1,
		}, { accessToken: "oauth-token" });
		expect(models).toEqual([{ id: "model-250" }]);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe(
			"https://api.phaseo.app/v1/models?search=coding+model&provider_search=Example&input_modality=text&minimum_context_tokens=128000&maximum_input_price_per_million=2&gateway_available_only=true&sort_by=input_price&sort_order=asc&limit=1",
		);
	});

	it("looks up a bounded set of benchmark model IDs in one request", async () => {
		fetchMock.mockResolvedValue(Response.json({ ok: true, models: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await getModelsByIds(env, ["lab/one", "lab/two"], { accessToken: "oauth-token" });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe(
			"https://api.phaseo.app/v1/models?model_id=lab%2Fone%2Clab%2Ftwo&limit=2",
		);
	});

	it("chunks large benchmark lookups without requesting unfiltered catalogue pages", async () => {
		fetchMock.mockImplementation(async () => Response.json({ ok: true, models: [] }));
		vi.stubGlobal("fetch", fetchMock);
		const ids = Array.from({ length: 251 }, (_, index) => `lab/model-${index}`);

		await getModelsByIds(env, ids, { accessToken: "oauth-token" });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const first = new URL((fetchMock.mock.calls[0]?.[0] as Request).url);
		const second = new URL((fetchMock.mock.calls[1]?.[0] as Request).url);
		expect(first.searchParams.get("limit")).toBe("250");
		expect(first.searchParams.get("model_id")?.split(",")).toHaveLength(250);
		expect(second.searchParams.get("limit")).toBe("1");
		expect(second.searchParams.get("model_id")).toBe("lab/model-250");
		expect(first.searchParams.has("offset")).toBe(false);
		expect(second.searchParams.has("offset")).toBe(false);
	});

	it("redacts upstream 5xx database details", async () => {
		fetchMock.mockResolvedValue(Response.json({ message: "duplicate key violates constraint private_table_name" }, { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);
		await expect(requestPhaseo(env, "/v1/settings", { credentials: { accessToken: "oauth-token" } }))
			.rejects.toThrow("Phaseo could not complete the request (500).");
		await expect(requestPhaseo(env, "/v1/settings", { credentials: { accessToken: "oauth-token" } }))
			.rejects.not.toThrow("private_table_name");
	});

	it("uses the canonical model filter for a model lookup", async () => {
		fetchMock.mockResolvedValue(Response.json({ ok: true, models: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getModel(env, "openai/gpt-5", { accessToken: "oauth-token" })).resolves.toBeNull();
		expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe("https://api.phaseo.app/v1/models?id=openai%2Fgpt-5&limit=1");
	});

	it("uses the provider read endpoint", async () => {
		fetchMock.mockResolvedValue(Response.json({ ok: true, providers: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(listProviders(env, { accessToken: "oauth-token" })).resolves.toEqual([]);
		expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe("https://api.phaseo.app/v1/providers?limit=250");
	});

	it("loads benchmark rankings only from the configured Phaseo web origin", async () => {
		fetchMock.mockResolvedValue(Response.json({ benchmarks: [{ benchmark_id: "quality", entries: [] }] }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(listBenchmarkRankings(env)).resolves.toEqual([{ benchmark_id: "quality", entries: [] }]);
		const input = fetchMock.mock.calls[0]?.[0] as Request | URL;
		const request = input instanceof Request ? input : new Request(input);
		expect(request.url).toBe("https://phaseo.app/api/_web/rankings/benchmarks");
		expect(request.headers.get("authorization")).toBeNull();
	});
});
