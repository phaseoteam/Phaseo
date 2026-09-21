import { afterEach, describe, expect, it, vi } from "vitest";

import { getModel, listAllModels, listBenchmarkRankings, listModels, listProviders, requestPhaseo } from "../src/phaseo-api";

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
		fetchMock.mockResolvedValue(Response.json({ ok: true, models: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(listModels(env, 250, { accessToken: "oauth-token" })).resolves.toEqual([]);
		const request = fetchMock.mock.calls[0]?.[0] as Request;
		expect(request.url).toBe("https://api.phaseo.app/v1/models?limit=250");
		expect(request.method).toBe("GET");
		expect(request.headers.get("authorization")).toBe("Bearer oauth-token");
	});

	it("loads every model page for catalogue-wide filtering and sorting", async () => {
		const firstPage = Array.from({ length: 250 }, (_, index) => ({ id: `model-${index}` }));
		fetchMock
			.mockResolvedValueOnce(Response.json({ ok: true, total: 251, models: firstPage }))
			.mockResolvedValueOnce(Response.json({ ok: true, total: 251, models: [{ id: "model-250" }] }));
		vi.stubGlobal("fetch", fetchMock);

		const models = await listAllModels(env, { accessToken: "oauth-token" });
		expect(models).toHaveLength(251);
		expect((fetchMock.mock.calls[0]?.[0] as Request).url).toBe("https://api.phaseo.app/v1/models?limit=250&offset=0");
		expect((fetchMock.mock.calls[1]?.[0] as Request).url).toBe("https://api.phaseo.app/v1/models?limit=250&offset=250");
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
