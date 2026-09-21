import { describe, expect, it, vi } from "vitest";

vi.mock("../src/phaseo-api", async (importOriginal) => ({
	...await importOriginal<typeof import("../src/phaseo-api")>(),
	authenticatePhaseoUser: vi.fn(async () => ({
		accessToken: "upstream-token",
		workspaceId: "workspace_1",
		scopes: ["models:read", "pricing:read"],
	})),
}));

import worker, { matchesModelProvider, sortModels, tokenRate } from "../src/index";

const env = {
	PHASEO_API_BASE_URL: "https://api.phaseo.app",
	PHASEO_WEB_BASE_URL: "https://phaseo.app",
	PHASEO_MCP_RESOURCE_SERVER_SECRET: "s".repeat(64),
};

describe("MCP 2026-07-28 transport", () => {
	it("uses only routable provider offers when filtering models", () => {
		const model = {
			organization: { id: "lab", name: "Example Lab", color: null },
			offers: [
				{ provider: { id: "inactive", name: "Inactive Provider" }, routable: false },
				{ provider: { id: "active", name: "Active Provider" }, routable: true },
			],
		} as any;
		expect(matchesModelProvider(model, "Inactive Provider")).toBe(false);
		expect(matchesModelProvider(model, "Active Provider")).toBe(true);
		expect(matchesModelProvider(model, "Example Lab")).toBe(true);
	});

	it("calculates token rates only for USD meters", () => {
		const meter = { provider_id: "openai", unit: "token", unit_size: 1_000_000, price_per_unit: "2.5", currency: "USD" };
		expect(tokenRate(meter)).toBe(0.0000025);
		expect(tokenRate({ ...meter, currency: "EUR" })).toBeNull();
		expect(tokenRate({ ...meter, currency: null })).toBeNull();
	});

	it("sorts priced models deterministically and keeps missing prices last", () => {
		const meter = (price: string | null) => price === null ? null : {
			provider_id: "provider", unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD",
		};
		const models = [
			{ id: "model/unpriced", pricing: { meters: {} }, limits: { input_tokens: 1 }, offers: [] },
			{ id: "model/expensive", pricing: { meters: { input_tokens: meter("5") } }, limits: { input_tokens: 1 }, offers: [] },
			{ id: "model/cheap", pricing: { meters: { input_tokens: meter("1") } }, limits: { input_tokens: 1 }, offers: [] },
		] as any[];

		expect(sortModels(models, "input_price").map((model) => model.id)).toEqual([
			"model/cheap", "model/expensive", "model/unpriced",
		]);
	});

	it("discovers the server over the modern stateless HTTP protocol", async () => {
		const response = await worker.fetch(
			new Request("https://mcp.phaseo.app/mcp", {
				method: "POST",
				headers: {
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
					Accept: "application/json",
					Host: "mcp.phaseo.app",
					"MCP-Protocol-Version": "2026-07-28",
					"MCP-Method": "server/discover",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "server/discover",
					params: {
						_meta: {
							"io.modelcontextprotocol/protocolVersion": "2026-07-28",
							"io.modelcontextprotocol/clientCapabilities": {},
						},
					},
				}),
			}),
			env,
			{} as ExecutionContext,
		);

		const body = await response.text();
		expect(response.status, body).toBe(200);
		expect(response.headers.get("mcp-session-id")).toBeNull();
		const payload = JSON.parse(body) as {
			result?: { supportedVersions?: string[]; resultType?: string };
		};
		expect(payload.result?.supportedVersions).toContain("2026-07-28");
		expect(payload.result?.resultType).toBe("complete");
	});

	it("lists tools with per-request modern protocol metadata and no session", async () => {
		const response = await worker.fetch(
			new Request("https://mcp.phaseo.app/mcp", {
				method: "POST",
				headers: {
					Authorization: "Bearer test-token",
					"Content-Type": "application/json",
					Accept: "application/json",
					Host: "mcp.phaseo.app",
					"MCP-Protocol-Version": "2026-07-28",
					"MCP-Method": "tools/list",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
					params: {
						_meta: {
							"io.modelcontextprotocol/protocolVersion": "2026-07-28",
							"io.modelcontextprotocol/clientCapabilities": {},
						},
					},
				}),
			}),
			env,
			{} as ExecutionContext,
		);

		const body = await response.text();
		expect(response.status, body).toBe(200);
		expect(response.headers.get("mcp-session-id")).toBeNull();
		expect(response.headers.get("cache-control")).toBe("no-store");
		const payload = JSON.parse(body) as { result?: { tools?: Array<{ name: string }> } };
		expect(payload.result?.tools?.map((tool) => tool.name)).toEqual(["models_list", "model_get", "benchmark_rankings", "cost_estimate"]);
	});

	it("rejects opaque and insecure non-loopback browser origins", async () => {
		for (const origin of ["null", "http://client.example"]) {
			const response = await worker.fetch(
				new Request("https://mcp.phaseo.app/mcp", {
					method: "OPTIONS",
					headers: { Origin: origin },
				}),
				env,
				{} as ExecutionContext,
			);
			expect(response.status).toBe(403);
		}
	});
});
