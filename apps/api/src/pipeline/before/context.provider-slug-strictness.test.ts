import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
	const cache = {
		get: vi.fn(async () => null),
		put: vi.fn(async () => undefined),
		delete: vi.fn(async () => undefined),
	};

	const rpc = vi.fn(async (_name: string, args: { model: string }) => ({
		data: [
			{
				workspace_id: "ws_poolside",
				resolved_model: args.model,
				key_ok: { ok: true, reason: null },
				key_limit_ok: { ok: true, reason: null },
				credit_ok: { ok: true, reason: null },
				providers: [],
				pricing: {},
			},
		],
		error: null,
	}));

	const from = vi.fn((table: string) => {
		if (table === "data_api_provider_models") {
			return {
				select: () => ({
					eq: (column: string, value: string) => {
						expect(column).toBe("provider_id");
						expect(value).toBe("poolside");
						return {
							eq: (slugColumn: string, slugValue: string) => {
								expect(slugColumn).toBe("provider_model_slug");
								expect(slugValue).toBe("laguna-m.1");
								return {
									eq: async (activeColumn: string, active: boolean) => {
										expect(activeColumn).toBe("is_active_gateway");
										expect(active).toBe(true);
										return {
											data: [],
											error: null,
										};
									},
								};
							},
						};
					},
				}),
			};
		}
		if (table === "workspace_settings") {
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({
							data: {
								routing_mode: "balanced",
								byok_fallback_enabled: true,
								beta_channel_enabled: false,
								alpha_channel_enabled: false,
								cache_aware_routing_enabled: true,
							},
							error: null,
						}),
					}),
				}),
			};
		}
		if (table === "workspaces") {
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({
							data: { billing_mode: "wallet" },
							error: null,
						}),
					}),
				}),
			};
		}
		throw new Error(`Unexpected table: ${table}`);
	});

	return {
		cache,
		supabase: { rpc, from },
	};
});

const loadPriceCardMock = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/env", () => ({
	getCache: () => runtime.cache as unknown as KVNamespace,
	getSupabaseAdmin: () => runtime.supabase,
}));

vi.mock("@pipeline/pricing", () => ({
	loadPriceCard: (...args: any[]) => loadPriceCardMock(...args),
}));

describe("fetchGatewayContext provider-scoped strictness", () => {
	beforeEach(() => {
		runtime.cache.get.mockClear();
		runtime.cache.put.mockClear();
		runtime.cache.delete.mockClear();
		runtime.supabase.rpc.mockClear();
		runtime.supabase.from.mockClear();
		loadPriceCardMock.mockReset();
		vi.resetModules();
	});

	it("does not remap a canonical model id to a :free api_model_id unless it is explicitly configured", async () => {
		const { fetchGatewayContext } = await import("./context");
		const context = await fetchGatewayContext({
			workspaceId: "ws_poolside",
			model: "poolside/laguna-m.1",
			endpoint: "responses",
			apiKeyId: "key_poolside",
			disableCache: true,
		});

		expect(context.resolvedModel).toBe("poolside/laguna-m.1");
		expect(context.providers).toEqual([]);
		expect(runtime.supabase.rpc.mock.calls.map(([, args]) => args.model)).toEqual([
			"poolside/laguna-m.1",
			"poolside/laguna-m.1",
		]);
	});
});
