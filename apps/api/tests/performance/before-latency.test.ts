import { afterEach, describe, expect, it } from "vitest";
import { fetchGatewayContext } from "@/pipeline/before/context";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../helpers/runtime";

type CountingKv = KVNamespace & {
	getCount: (key: string) => number;
	resetCounts: () => void;
};

function createCountingMemoryKv(): CountingKv {
	const store = new Map<string, { value: string; expiresAt?: number }>();
	const getCounts = new Map<string, number>();

	function isExpired(entry: { value: string; expiresAt?: number } | undefined): boolean {
		if (!entry) return true;
		if (!entry.expiresAt) return false;
		return Date.now() >= entry.expiresAt;
	}

	const kv = {
		async get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream") {
			getCounts.set(key, (getCounts.get(key) ?? 0) + 1);
			const entry = store.get(key);
			if (isExpired(entry)) {
				store.delete(key);
				return null;
			}
			if (!entry) return null;
			if (!type || type === "text") return entry.value as any;
			if (type === "json") return JSON.parse(entry.value) as any;
			if (type === "arrayBuffer") return new TextEncoder().encode(entry.value).buffer as any;
			if (type === "stream") return new Response(entry.value).body as any;
			return entry.value as any;
		},
		async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: KVNamespacePutOptions) {
			let textValue = "";
			if (typeof value === "string") {
				textValue = value;
			} else if (value instanceof ArrayBuffer) {
				textValue = new TextDecoder().decode(value);
			} else if (ArrayBuffer.isView(value)) {
				textValue = new TextDecoder().decode(value.buffer);
			} else {
				textValue = await new Response(value).text();
			}
			const ttl = options?.expirationTtl;
			store.set(key, {
				value: textValue,
				expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
			});
		},
		async delete(key: string) {
			store.delete(key);
		},
		getCount(key: string) {
			return getCounts.get(key) ?? 0;
		},
		resetCounts() {
			getCounts.clear();
		},
	} as CountingKv;

	return kv;
}

function percentile(values: number[], p: number): number {
	const sorted = values.slice().sort((a, b) => a - b);
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

describe("before context warm-cache latency", () => {
	afterEach(() => {
		teardownTestRuntime();
	});

	it("reuses key-version L1 cache between warm context fetches", async () => {
		const kv = createCountingMemoryKv();
		setupRuntimeFromEnv({ GATEWAY_CACHE: kv as KVNamespace } as any);

		const teamId = "team_perf";
		const apiKeyId = "key_perf";
		const endpoint = "text.generate";
		const model = "openai/gpt-5-nano";
		const version = 7;

		const versionKey = `gateway:keyver:id:${apiKeyId}`;
		const dynamicKey = `gateway:dynamic:default:${teamId}:${apiKeyId}:v${version}`;
		const staticKey = `gateway:static:default:${teamId}:${endpoint}:${model}`;

		await kv.put(versionKey, String(version));
		await kv.put(
			dynamicKey,
			JSON.stringify({
				teamId,
				key: { ok: true, reason: null },
				keyLimit: { ok: true, reason: null },
				credit: { ok: true, reason: null },
				teamSettings: { routingMode: null, byokFallbackEnabled: null, betaChannelEnabled: false, billingMode: "wallet" },
			}),
		);
		await kv.put(
			staticKey,
			JSON.stringify({
				teamId,
				resolvedModel: model,
				providers: [],
				pricing: {},
				testingMode: false,
			}),
		);

		kv.resetCounts();

		const first = await fetchGatewayContext({
			teamId,
			model,
			endpoint,
			apiKeyId,
			disableCache: false,
		});
		const second = await fetchGatewayContext({
			teamId,
			model,
			endpoint,
			apiKeyId,
			disableCache: false,
		});

		expect(first.contextTelemetry?.cacheStatus).toBe("hit");
		expect(second.contextTelemetry?.cacheStatus).toBe("hit");
		expect(kv.getCount(versionKey)).toBe(1);
		expect(kv.getCount(dynamicKey)).toBe(2);
		expect(kv.getCount(staticKey)).toBe(2);
	});

	it("keeps warm-cache context fetch p95 under 5ms in test runtime", async () => {
		const kv = createCountingMemoryKv();
		setupRuntimeFromEnv({ GATEWAY_CACHE: kv as KVNamespace } as any);

		const teamId = "team_perf";
		const apiKeyId = "key_perf_p95";
		const endpoint = "text.generate";
		const model = "openai/gpt-5-nano";
		const version = 1;

		const versionKey = `gateway:keyver:id:${apiKeyId}`;
		const dynamicKey = `gateway:dynamic:default:${teamId}:${apiKeyId}:v${version}`;
		const staticKey = `gateway:static:default:${teamId}:${endpoint}:${model}`;

		await kv.put(versionKey, String(version));
		await kv.put(
			dynamicKey,
			JSON.stringify({
				teamId,
				key: { ok: true, reason: null },
				keyLimit: { ok: true, reason: null },
				credit: { ok: true, reason: null },
				teamSettings: { routingMode: null, byokFallbackEnabled: null, betaChannelEnabled: false, billingMode: "wallet" },
			}),
		);
		await kv.put(
			staticKey,
			JSON.stringify({
				teamId,
				resolvedModel: model,
				providers: [],
				pricing: {},
				testingMode: false,
			}),
		);

		await fetchGatewayContext({
			teamId,
			model,
			endpoint,
			apiKeyId,
			disableCache: false,
		});

		const samples: number[] = [];
		const iterations = 300;
		for (let i = 0; i < iterations; i += 1) {
			const started = performance.now();
			await fetchGatewayContext({
				teamId,
				model,
				endpoint,
				apiKeyId,
				disableCache: false,
			});
			samples.push(performance.now() - started);
		}

		const p50 = percentile(samples, 50);
		const p95 = percentile(samples, 95);
		const p99 = percentile(samples, 99);
		const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;

		console.log(
			`[perf][before-context] iterations=${iterations} avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
		);

		expect(p95).toBeLessThan(5);
	});

	it("reuses dynamic cache across different models for the same key", async () => {
		const kv = createCountingMemoryKv();
		setupRuntimeFromEnv({ GATEWAY_CACHE: kv as KVNamespace } as any);

		const teamId = "team_perf_multi";
		const apiKeyId = "key_perf_multi";
		const endpoint = "text.generate";
		const modelA = "openai/gpt-5-nano";
		const modelB = "anthropic/claude-3-5-haiku";
		const version = 11;

		const versionKey = `gateway:keyver:id:${apiKeyId}`;
		const dynamicKey = `gateway:dynamic:default:${teamId}:${apiKeyId}:v${version}`;
		const staticKeyA = `gateway:static:default:${teamId}:${endpoint}:${modelA}`;
		const staticKeyB = `gateway:static:default:${teamId}:${endpoint}:${modelB}`;

		await kv.put(versionKey, String(version));
		await kv.put(
			dynamicKey,
			JSON.stringify({
				teamId,
				key: { ok: true, reason: null },
				keyLimit: { ok: true, reason: null },
				credit: { ok: true, reason: null },
				teamSettings: { routingMode: null, byokFallbackEnabled: null, betaChannelEnabled: false, billingMode: "wallet" },
			}),
		);
		await kv.put(
			staticKeyA,
			JSON.stringify({
				teamId,
				resolvedModel: modelA,
				providers: [],
				pricing: {},
				testingMode: false,
			}),
		);
		await kv.put(
			staticKeyB,
			JSON.stringify({
				teamId,
				resolvedModel: modelB,
				providers: [],
				pricing: {},
				testingMode: false,
			}),
		);

		kv.resetCounts();

		const a = await fetchGatewayContext({
			teamId,
			model: modelA,
			endpoint,
			apiKeyId,
			disableCache: false,
		});
		const b = await fetchGatewayContext({
			teamId,
			model: modelB,
			endpoint,
			apiKeyId,
			disableCache: false,
		});

		expect(a.contextTelemetry?.cacheStatus).toBe("hit");
		expect(b.contextTelemetry?.cacheStatus).toBe("hit");
		expect(kv.getCount(versionKey)).toBe(1);
		expect(kv.getCount(dynamicKey)).toBe(2);
		expect(kv.getCount(staticKeyA)).toBe(1);
		expect(kv.getCount(staticKeyB)).toBe(1);
	});
});
