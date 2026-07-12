import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type KeyRow = {
	id: string;
	workspace_id: string;
	status: string;
	hash: string;
	expires_at?: string | null;
};

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

const runtime = vi.hoisted(() => {
	const store = new Map<string, string>();
	const backgroundTasks: Promise<unknown>[] = [];
	const dbRow = { value: null as KeyRow | null };

	const maybeSingle = vi.fn(async () => ({
		data: dbRow.value,
		error: null,
	}));

	const cache = {
		get: vi.fn(async (key: string, type?: "text" | "json" | "arrayBuffer" | "stream") => {
			const value = store.get(key);
			if (value == null) return null;
			if (type === "json") return JSON.parse(value);
			return value;
		}),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
	};

	const supabase = {
		from: vi.fn((table: string) => {
			if (table !== "keys") {
				throw new Error(`Unexpected table: ${table}`);
			}
			return {
				select: () => ({
					eq: () => ({
						maybeSingle,
					}),
				}),
				update: () => ({
					eq: vi.fn(async () => ({ error: null })),
				}),
			};
		}),
	};

	return {
		store,
		backgroundTasks,
		dbRow,
		maybeSingle,
		cache,
		supabase,
		bindings: {
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
			GATEWAY_CACHE: cache as unknown as KVNamespace,
			KEY_PEPPER_ACTIVE: "pepper_test_value",
			KEY_PEPPER_PREVIOUS: undefined as string | undefined,
		},
	};
});

vi.mock("@/runtime/env", () => ({
	getBindings: () => runtime.bindings,
	getCache: () => runtime.cache as unknown as KVNamespace,
	getSupabaseAdmin: () => runtime.supabase,
	dispatchBackground: (promise: Promise<unknown>) => {
		runtime.backgroundTasks.push(promise.catch(() => undefined));
	},
	configureRuntime: () => undefined,
	clearRuntime: () => undefined,
}));

function buildRequest(token: string): Request {
	return new Request("https://example.com/v1/responses", {
		headers: {
			authorization: `Bearer ${token}`,
		},
	});
}

function hashSecret(secret: string): string {
	const pepper = runtime.bindings.KEY_PEPPER_ACTIVE;
	return createHmac("sha256", pepper).update(secret).digest("hex");
}

const { __resetKeyVersionL1ForTests } = await import("@/core/kv");
const { __resetAuthCachesForTests, authenticate } = await import("@/pipeline/before/auth");

describe("authenticate warm-cache latency", () => {
	beforeEach(() => {
		runtime.store.clear();
		runtime.backgroundTasks.length = 0;
		runtime.dbRow.value = null;
		runtime.cache.get.mockClear();
		runtime.cache.put.mockClear();
		runtime.cache.delete.mockClear();
		runtime.supabase.from.mockClear();
		runtime.maybeSingle.mockClear();
		__resetKeyVersionL1ForTests();
		__resetAuthCachesForTests();
	});

	afterEach(() => {
		__resetKeyVersionL1ForTests();
		__resetAuthCachesForTests();
	});

	it("keeps warm-cache auth checks under 10ms p95 with no extra KV or DB reads", async () => {
		const kid = "KIDPERFAUTH123";
		const secret = "secret_perf_auth";
		const hash = hashSecret(secret);
		const token = `phaseo_v1_sk_${kid}_${secret}`;
		const row: KeyRow = {
			id: "key_perf_auth",
			workspace_id: "team_perf_auth",
			status: "active",
			hash,
		};

		await runtime.cache.put(`gateway:keyver:kid:${kid}`, "7");
		await runtime.cache.put(`gateway:key:${kid}:v7`, JSON.stringify(row));

		const request = buildRequest(token);
		const warm = await authenticate(request, { useKvCache: true });
		expect(warm.ok).toBe(true);

		runtime.cache.get.mockClear();
		runtime.supabase.from.mockClear();
		runtime.maybeSingle.mockClear();

		const samples: number[] = [];
		const iterations = 300;
		for (let i = 0; i < iterations; i += 1) {
			const started = performance.now();
			const result = await authenticate(request, { useKvCache: true });
			samples.push(performance.now() - started);
			expect(result.ok).toBe(true);
		}

		const p50 = percentile(samples, 50);
		const p95 = percentile(samples, 95);
		const p99 = percentile(samples, 99);
		const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;

		console.log(
			`[perf][auth] iterations=${iterations} avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
		);

		expect(p95).toBeLessThan(10);
		expect(runtime.cache.get).toHaveBeenCalledTimes(0);
		expect(runtime.maybeSingle).not.toHaveBeenCalled();
	});
});
