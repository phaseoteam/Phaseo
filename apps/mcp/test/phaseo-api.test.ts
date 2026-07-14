import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiKey, getModel, listApiKeys, listModels, listProviders } from "../src/phaseo-api";

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_API_TOKEN: "test-read-only-token",
};

const fetchMock = vi.fn();

describe("Phaseo API client", () => {
	afterEach(() => {
		fetchMock.mockReset();
		vi.unstubAllGlobals();
	});

	it("uses the read-only token to list models", async () => {
		fetchMock.mockResolvedValue(Response.json({ ok: true, models: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(listModels(env)).resolves.toEqual([]);
		expect((fetchMock.mock.calls[0]?.[0] as URL).href).toBe("https://api.phaseo.app/v1/models?limit=250");
		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: { Authorization: "Bearer test-read-only-token" }, method: "GET" });
	});

	it("uses the user's OAuth token for authenticated key operations", async () => {
		fetchMock
			.mockResolvedValueOnce(Response.json({ data: [] }))
			.mockResolvedValueOnce(Response.json({ data: { id: "key-1", name: "MCP", key: "phaseo_v1_sk_secret" } }, { status: 201 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(listApiKeys(env, { accessToken: "oauth-token" })).resolves.toEqual([]);
		await expect(createApiKey(env, { accessToken: "oauth-token" }, { name: "MCP" })).resolves.toMatchObject({ id: "key-1", key: "phaseo_v1_sk_secret" });

		expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: { Authorization: "Bearer oauth-token" } });
		expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
			method: "POST",
			headers: { Authorization: "Bearer oauth-token", "Content-Type": "application/json" },
			body: JSON.stringify({ name: "MCP" }),
		});
	});

	it("uses the canonical model filter for a model lookup", async () => {
		fetchMock.mockResolvedValue(Response.json({ ok: true, models: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getModel(env, "openai/gpt-5")).resolves.toBeNull();
		expect(fetchMock.mock.calls[0]?.[0].href).toBe("https://api.phaseo.app/v1/models?id=openai%2Fgpt-5&limit=1");
	});

	it("uses the provider read endpoint", async () => {
		fetchMock.mockResolvedValue(Response.json({ ok: true, providers: [] }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(listProviders(env)).resolves.toEqual([]);
		expect(fetchMock.mock.calls[0]?.[0].href).toBe("https://api.phaseo.app/v1/providers?limit=250");
	});
});
