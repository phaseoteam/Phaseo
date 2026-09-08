import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
	const store = new Map<string, string>();
	const background: Promise<unknown>[] = [];
	const pendingWrites: Array<{ key: string; resolve: () => void }> = [];
	let deferWrites = false;
	let walletResult: {
		data: { balance_nanos: number; reserved_nanos: number } | null;
		error: { message: string } | null;
	} = {
		data: { balance_nanos: 5_000_000_000, reserved_nanos: 1_000_000_000 },
		error: null,
	};

	const cache = {
		get: vi.fn(async (key: string | string[]) => {
			if (Array.isArray(key)) {
				return new Map(key.flatMap((entry) => {
					const value = store.get(entry);
					return value == null ? [] : [[entry, value] as const];
				}));
			}
			return store.get(key) ?? null;
		}),
		put: vi.fn(async (key: string, value: string) => {
			if (deferWrites) {
				await new Promise<void>((resolve) => pendingWrites.push({ key, resolve }));
			}
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
	};

	const contextPayload = {
		workspace_id: "workspace_credit",
		resolved_model: "resolved/openai-gpt-5.4-nano",
		key_ok: { ok: true, reason: null },
		key_limit_ok: { ok: true, reason: null },
		credit_ok: { ok: true, reason: null, balance_nanos: 4_000_000_000 },
		providers: [],
		pricing: {},
	};
	const rpc = vi.fn(async () => ({ data: [contextPayload], error: null }));
	const from = vi.fn((table: string) => {
		if (table === "workspace_private_models") {
			return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) };
		}
		if (table === "wallets") {
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: async () => walletResult,
					}),
				}),
			};
		}
		if (table === "workspace_settings") {
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({
							data: {
								routing_mode: null,
								byok_fallback_enabled: false,
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
		store,
		background,
		pendingWrites,
		cache,
		supabase: { rpc, from },
		get deferWrites() {
			return deferWrites;
		},
		set deferWrites(value: boolean) {
			deferWrites = value;
		},
		get walletResult() {
			return walletResult;
		},
		set walletResult(value) {
			walletResult = value;
		},
	};
});

vi.mock("@/runtime/env", () => ({
	getCache: () => runtime.cache as unknown as KVNamespace,
	getSupabaseAdmin: () => runtime.supabase,
	dispatchBackground: (promise: Promise<unknown>) => {
		runtime.background.push(promise);
	},
}));

const workspaceId = "workspace_credit";
const apiKeyId = "key_credit";
const model = "openai/gpt-5.4-nano";
const endpoint = "chat.completions";

const teamEnrichment = {
	tier: "basic",
	created_at: "2026-01-01T00:00:00.000Z",
	account_age_days: 1,
	balance_nanos: 9_000_000_000,
	balance_usd: 9,
	balance_is_low: false,
	total_requests: 10,
	total_spend_nanos: 1,
	total_spend_usd: 0,
	spend_24h_nanos: 1,
	spend_24h_usd: 0,
	spend_7d_nanos: 1,
	spend_7d_usd: 0,
	spend_30d_nanos: 1,
	spend_30d_usd: 0,
	requests_1h: 1,
	requests_24h: 1,
};

function seedContextCache(options: { legacyCredit?: boolean; credit?: unknown } = {}): void {
	runtime.store.set(`gateway:keyver:id:${apiKeyId}`, "1");
	runtime.store.set(
		`gateway:dynamic:default:${workspaceId}:${apiKeyId}:v1`,
		JSON.stringify({
			workspaceId,
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null, buckets: null },
			teamEnrichment,
			teamSettings: { billingMode: "wallet" },
			...(options.legacyCredit
				? { credit: { ok: true, reason: null, resetAt: null, balanceNanos: 9_000_000_000 } }
				: {}),
		}),
	);
	runtime.store.set(
		`gateway:static:v3:default:${workspaceId}:v1:${endpoint}:${model}`,
		JSON.stringify({
			workspaceId,
			resolvedModel: model,
			preset: null,
			providers: [],
			pricing: {},
			testingMode: false,
		}),
	);
	if (options.credit) {
		runtime.store.set(`gateway:credit:${workspaceId}`, JSON.stringify(options.credit));
	}
}

describe("fetchGatewayContext credit-only cache refresh", () => {
	beforeEach(() => {
		runtime.store.clear();
		runtime.background.length = 0;
		runtime.pendingWrites.length = 0;
		runtime.deferWrites = false;
		runtime.walletResult = {
			data: { balance_nanos: 5_000_000_000, reserved_nanos: 1_000_000_000 },
			error: null,
		};
		runtime.cache.get.mockClear();
		runtime.cache.put.mockClear();
		runtime.cache.delete.mockClear();
		runtime.supabase.rpc.mockClear();
		runtime.supabase.from.mockClear();
		vi.resetModules();
	});

	it("refreshes only wallet credit and preserves the cached gateway context", async () => {
		seedContextCache();
		const { fetchGatewayContext } = await import("./context");

		const context = await fetchGatewayContext({
			workspaceId,
			model,
			endpoint,
			apiKeyId,
			disableCache: false,
		});

		expect(context.credit).toMatchObject({ ok: true, balanceNanos: 4_000_000_000 });
		expect(context.teamEnrichment).toMatchObject({
			balance_nanos: 4_000_000_000,
			balance_usd: 4,
			balance_is_low: false,
		});
		expect(context.contextTelemetry).toMatchObject({
			cacheStatus: "credit_refresh",
			rpcMs: null,
			enrichMs: null,
		});
		expect(context.contextTelemetry?.creditRefreshMs).toEqual(expect.any(Number));
		expect(runtime.supabase.rpc).not.toHaveBeenCalled();
		expect(runtime.supabase.from).toHaveBeenCalledTimes(1);
		expect(runtime.supabase.from).toHaveBeenCalledWith("wallets");
		expect(runtime.background).toHaveLength(0);
		expect(JSON.parse(runtime.store.get(`gateway:credit:${workspaceId}`) ?? "null")).toMatchObject({
			credit: { ok: true, balanceNanos: 4_000_000_000 },
		});
	});

	it("awaits a refreshed credit snapshot write before returning cached context", async () => {
		seedContextCache();
		runtime.deferWrites = true;
		const { fetchGatewayContext } = await import("./context");
		let settled = false;
		const fetchPromise = fetchGatewayContext({
			workspaceId,
			model,
			endpoint,
			apiKeyId,
			disableCache: false,
		}).then((context) => {
			settled = true;
			return context;
		});

		await vi.waitFor(() => expect(runtime.pendingWrites).toHaveLength(1));
		expect(runtime.pendingWrites[0]?.key).toBe(`gateway:credit:${workspaceId}`);
		expect(settled).toBe(false);

		runtime.pendingWrites.shift()?.resolve();
		await fetchPromise;
		expect(settled).toBe(true);
	});

	it("ignores stale legacy credit and fails closed using reserved funds", async () => {
		seedContextCache({ legacyCredit: true });
		runtime.walletResult = {
			data: { balance_nanos: 1_500_000_000, reserved_nanos: 750_000_001 },
			error: null,
		};
		const { fetchGatewayContext } = await import("./context");

		const context = await fetchGatewayContext({
			workspaceId,
			model,
			endpoint,
			apiKeyId,
			disableCache: false,
		});

		expect(context.credit).toMatchObject({
			ok: false,
			reason: "insufficient_funds",
			balanceNanos: 749_999_999,
		});
		expect(context.contextTelemetry?.cacheStatus).toBe("credit_refresh");
		expect(runtime.supabase.rpc).not.toHaveBeenCalled();
	});

	it("uses a valid separate credit snapshot without querying the wallet", async () => {
		seedContextCache({
			credit: {
				workspaceId,
				credit: { ok: true, reason: null, resetAt: null, balanceNanos: 3_000_000_000 },
				teamEnrichment,
			},
		});
		const { fetchGatewayContext } = await import("./context");

		const context = await fetchGatewayContext({
			workspaceId,
			model,
			endpoint,
			apiKeyId,
			disableCache: false,
		});

		expect(context.credit.balanceNanos).toBe(3_000_000_000);
		expect(context.contextTelemetry).toMatchObject({
			cacheStatus: "hit",
			creditRefreshMs: null,
		});
		expect(runtime.supabase.from).not.toHaveBeenCalled();
	});

	it("awaits full-context credit writes but leaves unrelated cache writes in the background", async () => {
		runtime.store.set(`gateway:keyver:id:${apiKeyId}`, "1");
		runtime.deferWrites = true;
		const { fetchGatewayContext } = await import("./context");
		let settled = false;
		const fetchPromise = fetchGatewayContext({
			workspaceId,
			model,
			endpoint,
			apiKeyId,
			disableCache: false,
		}).then((context) => {
			settled = true;
			return context;
		});

		await vi.waitFor(() => expect(runtime.pendingWrites).toHaveLength(1));
		expect(runtime.pendingWrites[0]?.key).toBe(`gateway:credit:${workspaceId}`);
		expect(settled).toBe(false);

		runtime.pendingWrites.shift()?.resolve();
		await vi.waitFor(() => expect(runtime.cache.put).toHaveBeenCalledTimes(3));
		await vi.waitFor(() => expect(settled).toBe(true));
		expect(runtime.background).toHaveLength(1);
		expect(runtime.pendingWrites.map(({ key }) => key).sort()).toEqual([
			`gateway:dynamic:default:${workspaceId}:${apiKeyId}:v1`,
			`gateway:static:v3:default:${workspaceId}:v1:${endpoint}:${model}`,
		]);

		await fetchPromise;
		runtime.store.delete(`gateway:credit:${workspaceId}`);

		for (const pending of runtime.pendingWrites.splice(0)) pending.resolve();
		await Promise.all(runtime.background);
		expect(runtime.store.has(`gateway:credit:${workspaceId}`)).toBe(false);
	});
});
