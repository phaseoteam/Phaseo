import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const getSupabaseAdminMock = vi.fn();

vi.mock("@pipeline/before/guards", () => ({
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
	cacheHeaders: () => ({ "Cache-Control": "private, max-age=300" }),
}));

import { pricingRoutes } from "./pricing";

function queryResult(result: { data: unknown[]; error: unknown }) {
	const query: Record<string, unknown> = {};
	for (const method of ["select", "eq", "in", "lte", "or", "order", "gt", "limit"]) {
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
			{ message: "Failed to load v2_pricing_skus: Bad Request" },
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

	it("returns every price row, not only the first PostgREST page", async () => {
		// Like PostgREST: at most 1,000 rows per read, whatever the query asks for.
		function cappedTable<T extends Record<string, unknown>>(rows: T[], key: keyof T & string) {
			let filtered = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
			let limit = 1000;
			const query: Record<string, unknown> = {};
			for (const method of ["select", "eq", "lte", "or", "order"]) query[method] = vi.fn(() => query);
			query.in = vi.fn((column: string, values: unknown[]) => { filtered = filtered.filter((row) => values.includes(row[column])); return query; });
			query.gt = vi.fn((column: string, value: unknown) => { filtered = filtered.filter((row) => String(row[column]) > String(value)); return query; });
			query.limit = vi.fn((count: number) => { limit = Math.min(count, 1000); return query; });
			query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: filtered.slice(0, limit), error: null }).then(resolve);
			return query;
		}
		// 1,001 price rows for one route; the last one is a dearer conditional rule.
		const skus = Array.from({ length: 1001 }, (_, index) => ({
			sku_id: `sku_${String(index).padStart(4, "0")}`, provider_model_id: "pm_1", operation: "text.generate",
			service_tier_slug: "standard", currency: "USD", metadata: index === 1000 ? { match: [{ path: "usage.input_text_tokens", op: "gt", value: 200000 }] } : {},
		}));
		// Six meters each, so one 200-row batch also spans two pages.
		const meters = skus.flatMap((sku, index) => ["a", "b", "c", "d", "e", "f"].map((suffix, order) => ({
			sku_meter_id: `${sku.sku_id}_${suffix}`, sku_id: sku.sku_id, meter_key: order === 0 ? "input_text_tokens" : `meter_${suffix}`,
			unit: "token", unit_quantity: 1, price_nanos: index === 1000 && order === 0 ? 9 : 1, metadata: {}, meter_order: order,
		})));
		getSupabaseAdminMock.mockReturnValue({
			from: vi.fn((table: string) => {
				if (table === "v2_model_provider_routes") return cappedTable([{ provider_model_id: "pm_1", provider_slug: "openai", model_slug: "openai/gpt-test", status: "active" }], "provider_model_id");
				if (table === "v2_models") return cappedTable([{ model_slug: "openai/gpt-test", name: "GPT Test", hidden: false, status: "active" }], "model_slug");
				if (table === "v2_pricing_skus") return cappedTable(skus, "sku_id");
				if (table === "v2_pricing_sku_meters") return cappedTable(meters, "sku_meter_id");
				throw new Error(`unexpected table: ${table}`);
			}),
		});

		const response = await pricingRoutes.request("https://example.com/models");
		const body = await response.json() as { models: Array<{ meters: Array<{ meter: string; price_per_unit: string; conditions: unknown[] }> }> };

		expect(response.status).toBe(200);
		expect(body.models).toHaveLength(1);
		expect(body.models[0]!.meters).toHaveLength(6006);
		expect(body.models[0]!.meters.filter((meter) => meter.meter === "input_text_tokens" && meter.conditions.length))
			.toEqual([expect.objectContaining({ price_per_unit: String(9 / 1_000_000_000) })]);
	});
});
