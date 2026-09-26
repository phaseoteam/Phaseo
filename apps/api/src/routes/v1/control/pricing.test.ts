import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: (...args: unknown[]) => guardAuthMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: (...args: unknown[]) => getSupabaseAdminMock(...args),
	getBindingsIfConfigured: () => undefined,
	dispatchBackground: (work: Promise<unknown>) => { void work; },
}));

vi.mock("../../utils", () => ({
	withRuntime:
		(handler: (req: Request) => Promise<Response>) =>
		async (c: { req: { raw: Request } }) =>
			handler(c.req.raw),
	json: (data: unknown, status = 200, headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } }),
	cacheHeaders: () => ({ "Cache-Control": "private, max-age=300" }),
}));

import { pricingRoutes } from "./pricing";

function queryResult(result: { data: unknown[]; error: unknown }) {
	const query: Record<string, unknown> = {};
	for (const method of ["select", "eq", "in", "lte", "or", "order"]) {
		query[method] = vi.fn(() => query);
	}
	query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
	return query;
}

function trackedQuery(result: { data: unknown[]; error: unknown }) {
	const query = queryResult(result);
	return query as typeof query & { or: ReturnType<typeof vi.fn> };
}

describe("pricingRoutes", () => {
	beforeEach(() => {
		guardAuthMock.mockReset();
		getSupabaseAdminMock.mockReset();
		guardAuthMock.mockResolvedValue({
			ok: true,
			value: {
				workspaceId: "ws_test",
				authMethod: "oauth",
				oauthScopes: ["pricing:read"],
			},
		});
	});

	it("filters expired SKUs in PostgREST and avoids empty in filters", async () => {
		const pricingQuery = trackedQuery({ data: [{
			sku_id: "sku_1",
			provider_model_id: "pm_1",
			operation: "chat/completions",
			service_tier_slug: "standard",
			currency: "USD",
			metadata: {},
		}], error: null });
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn((table: string) => {
				if (table === "v2_model_provider_routes") return queryResult({ data: [{
					provider_model_id: "pm_1",
					provider_slug: "openai",
					model_slug: "openai/gpt-test",
				}], error: null });
				if (table === "v2_models") return queryResult({ data: [{
					model_slug: "openai/gpt-test",
					name: "GPT Test",
					hidden: false,
					status: "active",
				}], error: null });
				if (table === "v2_pricing_skus") return pricingQuery;
				if (table === "v2_pricing_sku_meters") return queryResult({ data: [{
					sku_id: "sku_1",
					meter_key: "input_tokens",
					unit: "token",
					unit_quantity: 1_000_000,
					price_nanos: 1_500_000_000,
					metadata: {},
					meter_order: 1,
				}], error: null });
				throw new Error(`unexpected table: ${table}`);
			}),
		});

		const response = await pricingRoutes.request("https://example.com/models");
		const body = await response.json() as { ok: boolean; models: Array<{ model: string; meters: unknown[] }> };

		expect(response.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body.models).toEqual([
			expect.objectContaining({ model: "openai/gpt-test", meters: [expect.objectContaining({ meter: "input_tokens" })] }),
		]);
		expect(pricingQuery.or).toHaveBeenCalledOnce();
		expect(pricingQuery.or).toHaveBeenCalledWith(expect.stringMatching(
			/^effective_to\.is\.null,effective_to\.gt\."\d{4}-\d{2}-\d{2}T.*Z"$/,
		));
	});

	it("logs the failed pricing table without exposing database details", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn((table: string) => queryResult({
				data: [],
				error: table === "v2_pricing_skus" ? { message: "Bad Request" } : null,
			})),
		});

		const response = await pricingRoutes.request("https://example.com/models");

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toMatchObject({
			message: "Pricing catalogue is temporarily unavailable",
		});
		expect(consoleError).toHaveBeenCalledWith(
			"[gateway/pricing] model catalogue query failed",
			{ message: "v2_pricing_skus: Bad Request" },
		);
		consoleError.mockRestore();
	});

	it("batches meter queries to keep PostgREST URLs bounded", async () => {
		const skus = Array.from({ length: 201 }, (_, index) => ({
			sku_id: `sku_${index}`,
			provider_model_id: "pm_1",
			operation: "chat/completions",
			service_tier_slug: "standard",
			currency: "USD",
			metadata: {},
		}));
		let meterBatch = 0;
		const from = vi.fn((table: string) => {
			if (table === "v2_pricing_skus") return queryResult({ data: skus, error: null });
			if (table === "v2_model_provider_routes") return queryResult({ data: [{
				provider_model_id: "pm_1", provider_slug: "openai", model_slug: "openai/gpt-test",
			}], error: null });
			if (table === "v2_models") return queryResult({ data: [{
				model_slug: "openai/gpt-test", name: "GPT Test", hidden: false, status: "active",
			}], error: null });
			if (table === "v2_pricing_sku_meters") {
				const batch = meterBatch++;
				return queryResult({ data: [{
					sku_id: batch === 0 ? "sku_0" : "sku_200",
					meter_key: batch === 0 ? "second" : "first",
					unit: "token", unit_quantity: 1, price_nanos: 1, metadata: {},
					meter_order: batch === 0 ? 2 : 1,
				}], error: null });
			}
			throw new Error(`unexpected table: ${table}`);
		});
		getSupabaseAdminMock.mockReturnValue({ from });

		const response = await pricingRoutes.request("https://example.com/models");
		const body = await response.json() as { models: Array<{ meters: Array<{ meter: string }> }> };

		expect(response.status).toBe(200);
		expect(from.mock.calls.filter(([table]) => table === "v2_pricing_sku_meters")).toHaveLength(2);
		expect(body.models[0]?.meters.map((meter) => meter.meter)).toEqual(["first", "second"]);
	});
});
