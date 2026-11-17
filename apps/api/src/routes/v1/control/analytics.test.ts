import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@/pipeline/before/guards", () => ({
	guardAuth: (...args: unknown[]) => guardAuthMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: (...args: unknown[]) => getSupabaseAdminMock(...args),
}));

vi.mock("../../utils", () => ({
	withRuntime:
		(handler: (req: Request) => Promise<Response>) =>
		async (c: { req: { raw: Request } }) =>
			handler(c.req.raw),
	json: (data: unknown, status = 200, headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } }),
}));

import { analyticsRoutes } from "./analytics";

function queryResult(
	result: { data: unknown[]; error: unknown; count?: number | null },
	onSelect?: (columns: string) => void,
) {
	const query: Record<string, unknown> = {};
	query.select = vi.fn((columns: string) => {
		onSelect?.(columns);
		return query;
	});
	for (const method of ["eq", "gte", "lt", "in", "or", "order", "range", "contains"]) {
		query[method] = vi.fn(() => query);
	}
	query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
	return query;
}

describe("analyticsRoutes", () => {
	beforeEach(() => {
		guardAuthMock.mockReset();
		getSupabaseAdminMock.mockReset();
		guardAuthMock.mockResolvedValue({
			ok: true,
			value: {
				workspaceId: "ws_test",
				authMethod: "oauth",
				oauthScopes: ["analytics:read"],
			},
		});
	});

	it("loads the current v2 daily rollup and aggregates meter totals", async () => {
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		let factQueries = 0;
		let countSelection = "";
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn((table: string) => {
				if (table === "v2_request_facts") {
					factQueries += 1;
					if (factQueries === 1) {
						return queryResult(
							{ data: [], error: null, count: 1 },
							(columns) => { countSelection = columns; },
						);
					}
					return queryResult({ data: [{
					occurred_at: `${yesterday}T12:00:00.000Z`,
					endpoint: "chat/completions",
					requested_model_slug: "openai/gpt-test",
					routed_model_slug: "openai/gpt-test",
					provider_model_id: "openai:gpt-test",
					safe_metadata: { labels: [{ key: "team", value: "support" }] },
					cost_nanos: "1500000000",
					byok: true,
					v2_request_usage: [
						{ meter_key: "input_tokens", quantity: 20 },
						{ meter_key: "output_tokens", quantity: 5 },
						{ meter_key: "reasoning_tokens", quantity: 2 },
					],
				}], error: null });
				}
				if (table === "v2_model_provider_routes") return queryResult({ data: [{
					provider_model_id: "openai:gpt-test",
					provider_slug: "openai",
				}], error: null });
				if (table === "v2_providers") return queryResult({ data: [{ provider_slug: "openai", name: "OpenAI" }], error: null });
				throw new Error(`unexpected table: ${table}`);
			}),
		});

		const response = await analyticsRoutes.request("https://example.com/");
		const body = await response.json() as { data: Array<Record<string, unknown>> };

		expect(response.status).toBe(200);
		expect(countSelection).toBe("request_event_id");
		expect(body.data).toEqual([
			expect.objectContaining({
				date: yesterday,
				model_permaslug: "openai/gpt-test",
				provider_name: "OpenAI",
				endpoint_id: "chat/completions",
				usage: 1.5,
				byok_usage_inference: 1.5,
				requests: 1,
				prompt_tokens: 20,
				completion_tokens: 5,
				reasoning_tokens: 2,
			}),
		]);
	});

	it("filters spend by a request label", async () => {
		let containsCalls = 0;
		let factQueries = 0;
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn((table: string) => {
				if (table !== "v2_request_facts") throw new Error(`unexpected table: ${table}`);
				factQueries += 1;
				const result = queryResult(factQueries === 1
					? { data: [], error: null, count: 0 }
					: { data: [], error: null });
				const originalContains = result.contains;
				result.contains = vi.fn((...args: unknown[]) => {
					containsCalls += 1;
					return (originalContains as (...inner: unknown[]) => unknown)(...args);
				});
				return result;
			}),
		});

		const response = await analyticsRoutes.request("https://example.com/?label_key=team&label_value=support");
		expect(response.status).toBe(200);
		expect(containsCalls).toBe(2);
	});

	it("applies key, model, endpoint, BYOK, and success filters before aggregation", async () => {
		const calls: Array<[string, ...unknown[]]> = [];
		let factQueries = 0;
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn((table: string) => {
				if (table !== "v2_request_facts") throw new Error(`unexpected table: ${table}`);
				factQueries += 1;
				const result = queryResult(factQueries === 1 ? { data: [], error: null, count: 0 } : { data: [], error: null });
				for (const method of ["eq", "or"] as const) {
					const original = result[method] as (...args: unknown[]) => unknown;
					result[method] = vi.fn((...args: unknown[]) => { calls.push([method, ...args]); return original(...args); });
				}
				return result;
			}),
		});

		const response = await analyticsRoutes.request("https://example.com/?key_id=key_1&model=openai/gpt-test&endpoint=chat/completions&byok=true&success=false&limit=10");
		expect(response.status).toBe(200);
		expect(calls).toEqual(expect.arrayContaining([
			["eq", "key_id", "key_1"],
			["eq", "endpoint", "chat/completions"],
			["eq", "byok", true],
			["eq", "success", false],
			["or", "requested_model_slug.eq.openai/gpt-test,routed_model_slug.eq.openai/gpt-test"],
		]));
	});

	it("exports the filtered aggregate as spreadsheet-safe CSV", async () => {
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		let factQueries = 0;
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn((table: string) => {
				if (table === "v2_request_facts") {
					factQueries += 1;
					return queryResult(factQueries === 1 ? { data: [], error: null, count: 1 } : { data: [{ occurred_at: `${yesterday}T12:00:00.000Z`, endpoint: "responses", requested_model_slug: "=cmd", routed_model_slug: "=cmd", provider_model_id: "provider:model", cost_nanos: 1, byok: false, success: true, v2_request_usage: [] }], error: null });
				}
				if (table === "v2_model_provider_routes") return queryResult({ data: [{ provider_model_id: "provider:model", provider_slug: "provider" }], error: null });
				if (table === "v2_providers") return queryResult({ data: [], error: null });
				throw new Error(`unexpected table: ${table}`);
			}),
		});

		const response = await analyticsRoutes.request("https://example.com/export");
		const csv = await response.text();
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/csv");
		expect(csv).toContain("model_permaslug");
		expect(csv).toContain("'=cmd");
	});

	it("names providers from the catalogue and falls back to the slug", async () => {
		const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		const fact = (providerModelId: string) => ({ occurred_at: `${yesterday}T12:00:00.000Z`, endpoint: "chat/completions", requested_model_slug: "liquid-ai/lfm", routed_model_slug: "liquid-ai/lfm", provider_model_id: providerModelId, cost_nanos: 1, byok: false, success: true, v2_request_usage: [] });
		const run = async (providers: { data: unknown[]; error: unknown }) => {
			let factQueries = 0;
			getSupabaseAdminMock.mockReturnValue({
				from: vi.fn((table: string) => {
					if (table === "v2_request_facts") {
						factQueries += 1;
						return queryResult(factQueries === 1 ? { data: [], error: null, count: 2 } : { data: [fact("liquid-ai:lfm"), fact("some-new-host:lfm")], error: null });
					}
					if (table === "v2_model_provider_routes") return queryResult({ data: [{ provider_model_id: "liquid-ai:lfm", provider_slug: "liquid-ai" }], error: null });
					if (table === "v2_providers") return queryResult(providers);
					throw new Error(`unexpected table: ${table}`);
				}),
			});
			const response = await analyticsRoutes.request("https://example.com/");
			expect(response.status).toBe(200);
			const body = await response.json() as { data: Array<{ provider_name: string }> };
			return body.data.map((row) => row.provider_name).sort();
		};

		await expect(run({ data: [{ provider_slug: "liquid-ai", name: "Liquid AI" }], error: null })).resolves.toEqual(["Liquid AI", "Some New Host"]);
		await expect(run({ data: [], error: { message: "boom" } })).resolves.toEqual(["Liquid Ai", "Some New Host"]);
	});

	it("fails closed when a raw analytics range exceeds the row cap", async () => {
		let factQueries = 0;
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn((table: string) => {
				if (table !== "v2_request_facts") throw new Error(`unexpected table: ${table}`);
				factQueries += 1;
				return queryResult({
					data: [],
					error: null,
					count: 10_001,
				});
			}),
		});

		const response = await analyticsRoutes.request("https://example.com/");

		expect(response.status).toBe(413);
		await expect(response.json()).resolves.toMatchObject({
			ok: false,
			error: "analytics_range_too_large",
		});
		expect(factQueries).toBe(1);
	});
});
