import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	query: vi.fn(),
	get: vi.fn(), put: vi.fn(),
	acquireLease: vi.fn(),
	returnLeases: vi.fn(),
	background: [] as Promise<unknown>[],
}));
vi.mock("@/runtime/env", () => ({
	getCache: () => ({ get: runtime.get, put: runtime.put }),
	getBindingsIfConfigured: () => null,
	dispatchBackground: (promise: Promise<unknown>) => { runtime.background.push(promise.catch(() => undefined)); },
	getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => runtime.query() }) }) }),
	getBindings: () => ({ PROVIDER_RATE_LIMITS: { getByName: () => ({ acquireLease: runtime.acquireLease, returnLeases: runtime.returnLeases }) } }),
}));

const row = (overrides: Record<string, unknown> = {}) => [{ provider_id: "openai", provider_model_slug: "*", enabled: true, requests_per_minute: 100, ...overrides }];
const envelope = (value: unknown, at = Date.now()) => JSON.stringify({ v: [value], at });
const config = (overrides: Record<string, unknown> = {}) => ({ providerId: "openai", modelSlug: "*", requestsPerMinute: 100, requestsPerDay: null,
	tokensPerMinute: null, tokensPerDay: null, headroomBps: 0, ...overrides });
const lease = (requests: number | null, units: number | null = null, expiresAt = Date.now() + 50_000) =>
	({ ok: true, lease: { id: `lease-${Math.random()}`, expiresAt, requests, units, meta: { minuteWindow: 1, dayWindow: 1 } } });
const flush = async () => { while (runtime.background.length) await Promise.all(runtime.background.splice(0)); };

describe("provider rate-limit configuration and leases", () => {
	beforeEach(() => {
		vi.resetModules(); vi.resetAllMocks(); runtime.background.length = 0;
		runtime.get.mockResolvedValue(null); runtime.put.mockResolvedValue(undefined);
		runtime.returnLeases.mockResolvedValue(undefined);
		runtime.acquireLease.mockImplementation(async () => lease(20));
	});

	it("shares cold configuration reads and admits concurrent requests from one slice", async () => {
		let resolve!: (value: unknown) => void;
		runtime.query.mockReturnValue(new Promise((done) => { resolve = done; }));
		const { admitManagedProvider } = await import("./provider-rate-limits");
		const requests = Array.from({ length: 20 }, () => admitManagedProvider("openai", 32));
		await vi.waitFor(() => expect(runtime.query).toHaveBeenCalledTimes(1));
		resolve({ data: row(), error: null });
		const results = await Promise.all(requests);
		expect(results.every((result) => result.allowed)).toBe(true);
		// Waiters share the first grant instead of each awaiting the coordinator; the only
		// other call is a background top-up (need of zero requests).
		const needs = runtime.acquireLease.mock.calls.map((call: unknown[]) => (call[1] as { requests: number }).requests);
		expect(needs.filter((requests: number) => requests > 0)).toHaveLength(1);
		expect(needs.filter((requests: number) => requests === 0).length).toBeLessThanOrEqual(1);
		expect(results.filter((result) => result.source === "lease")).toHaveLength(19);
		await admitManagedProvider("openai", 32);
		expect(runtime.query).toHaveBeenCalledTimes(1);
	});

	it("admits from a held slice without awaiting the coordinator", async () => {
		runtime.query.mockResolvedValue({ data: row(), error: null });
		const { admitManagedProvider } = await import("./provider-rate-limits");
		await admitManagedProvider("openai", 32);
		await flush();
		let settled = false;
		runtime.acquireLease.mockImplementation(() => new Promise(() => undefined));
		const pending = admitManagedProvider("openai", 32).then((result) => { settled = true; return result; });
		// Microtasks only: no coordinator call is outstanding for this admission.
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(settled).toBe(true);
		expect((await pending).source).toBe("lease");
	});

	it("does not estimate tokens for providers without a token limit", async () => {
		runtime.query.mockResolvedValue({ data: row(), error: null });
		const estimate = vi.fn(() => 500);
		const { admitManagedProvider } = await import("./provider-rate-limits");
		const result = await admitManagedProvider("openai", estimate);
		expect(estimate).not.toHaveBeenCalled();
		expect(result.reservation).toBeNull();
		expect(runtime.acquireLease.mock.calls[0][1]).toEqual({ requests: 1, units: 0 });
	});

	it("estimates lazily and reserves tokens against the lease when a token limit exists", async () => {
		runtime.query.mockResolvedValue({ data: row({ requests_per_minute: null, tokens_per_minute: 100_000 }), error: null });
		runtime.acquireLease.mockImplementation(async (_c, need) => lease(null, need.units * 4));
		const estimate = vi.fn(() => 500);
		const { admitManagedProvider } = await import("./provider-rate-limits");
		const result = await admitManagedProvider("openai", estimate, "reservation-1");
		expect(estimate).toHaveBeenCalledTimes(1);
		expect(result.reservation).toMatchObject({ id: "reservation-1", tokens: 500, minuteWindow: 1, dayWindow: 1 });
		expect(result.reservation?.leaseId).toMatch(/^lease-/);
	});

	it("shares a negative result across isolates without another database lookup", async () => {
		runtime.query.mockResolvedValue({ data: null, error: null });
		await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
		await flush();
		const [key, raw] = runtime.put.mock.calls[0];
		expect(key).toBe("gateway:provider-rate-limit-config:v3:openai");
		vi.resetModules(); runtime.get.mockResolvedValue(raw);
		await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
		expect(runtime.query).toHaveBeenCalledTimes(1);
		expect(runtime.acquireLease).not.toHaveBeenCalled();
	});

	it("preserves coordinator denials", async () => {
		runtime.get.mockResolvedValue(envelope(config({ requestsPerMinute: 1 })));
		const denial = { allowed: false, reason: "requests_per_minute", retryAfterSeconds: 12, reservation: null };
		runtime.acquireLease.mockResolvedValueOnce({ ok: false, denial });
		const result = await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
		expect(result).toEqual({ ...denial, source: "coordinator" });
		expect(runtime.query).not.toHaveBeenCalled();
	});

	it("fails open when the coordinator is unavailable", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		runtime.get.mockResolvedValue(envelope(config()));
		runtime.acquireLease.mockRejectedValue(new Error("object overloaded"));
		try {
			const result = await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
			expect(result).toMatchObject({ allowed: true, reservation: null, source: "fail_open" });
		} finally { log.mockRestore(); }
	});

	it.each([
		JSON.stringify({ v: [{ ...config(), providerId: "another" }], at: Date.now() }),
		JSON.stringify({ v: [{ ...config(), requestsPerMinute: -1 }], at: Date.now() }),
		JSON.stringify({ v: [config()], at: Date.now() - 16 * 60_000 }),
		JSON.stringify({ v: config(), at: Date.now() }),
		"not json",
	])("ignores mismatched, malformed or too-old snapshots: %s", async (raw) => {
		runtime.get.mockResolvedValue(raw);
		runtime.query.mockResolvedValue({ data: row({ requests_per_minute: 10 }), error: null });
		await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
		expect(runtime.query).toHaveBeenCalledTimes(1);
		expect(runtime.acquireLease.mock.calls[0][0]).toMatchObject({ requestsPerMinute: 10 });
	});

	it("serves stale configuration while revalidating in the background", async () => {
		const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
		runtime.query.mockResolvedValueOnce({ data: row({ requests_per_minute: 100 }), error: null });
		try {
			const { admitManagedProvider } = await import("./provider-rate-limits");
			await admitManagedProvider("openai", 32);
			await flush();
			clock.mockReturnValue(now + 61_000);
			let resolve!: (value: unknown) => void;
			runtime.query.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
			runtime.get.mockResolvedValue(envelope(config(), now));
			const result = await admitManagedProvider("openai", 32);
			expect(result.allowed).toBe(true);
			expect(runtime.acquireLease.mock.calls.at(-1)?.[0]).toMatchObject({ requestsPerMinute: 100 });
			resolve({ data: row({ requests_per_minute: 7 }), error: null });
			await flush();
			expect(runtime.query).toHaveBeenCalledTimes(2);
			await admitManagedProvider("openai", 32);
			expect(runtime.acquireLease.mock.calls.at(-1)?.[0]).toMatchObject({ requestsPerMinute: 7 });
			// Slices sized for the old limits are returned when the limits change.
			expect(runtime.returnLeases).toHaveBeenCalled();
		} finally { clock.mockRestore(); }
	});

	it("uses authoritative configuration when KV is unavailable", async () => {
		runtime.get.mockRejectedValue(new Error("KV unavailable"));
		runtime.put.mockRejectedValue(new Error("KV unavailable"));
		runtime.query.mockResolvedValue({ data: row({ requests_per_minute: 10 }), error: null });
		const result = await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
		expect(result.allowed).toBe(true);
		expect(runtime.query).toHaveBeenCalledTimes(1);
		expect(runtime.acquireLease).toHaveBeenCalledTimes(1);
	});

	it("fails open while configuration is unavailable and retries the next request", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		runtime.query.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
			.mockResolvedValueOnce({ data: null, error: null });
		try {
			const { admitManagedProvider } = await import("./provider-rate-limits");
			expect(await admitManagedProvider("poolside", 32)).toMatchObject({ allowed: true, source: "fail_open" });
			await admitManagedProvider("poolside", 32);
			expect(runtime.query).toHaveBeenCalledTimes(2);
			expect(runtime.acquireLease).not.toHaveBeenCalled();
		} finally { log.mockRestore(); }
	});

	it("does not wait for configuration persistence before returning admission", async () => {
		let release!: () => void;
		runtime.put.mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
		runtime.query.mockResolvedValue({ data: null, error: null });
		try {
			const result = await (await import("./provider-rate-limits")).admitManagedProvider("openai", 32);
			expect(result.allowed).toBe(true);
			expect(runtime.put).toHaveBeenCalledTimes(1);
		} finally { release(); }
	});
});
