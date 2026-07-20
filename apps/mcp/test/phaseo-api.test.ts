import { afterEach, describe, expect, it, vi } from "vitest";

import { getModel, listApiKeys, listModels, listProviders, requestPhaseo } from "../src/phaseo-api";

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
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

	it("uses the user's OAuth token for authenticated key operations", async () => {
		fetchMock.mockResolvedValueOnce(Response.json({ data: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(listApiKeys(env, { accessToken: "oauth-token" })).resolves.toEqual([]);

		const listRequest = fetchMock.mock.calls[0]?.[0] as Request;
		expect(listRequest.headers.get("authorization")).toBe("Bearer oauth-token");
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
});
