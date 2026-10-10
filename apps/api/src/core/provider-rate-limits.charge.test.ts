import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
	rows: [] as Record<string, unknown>[],
	objects: new Map<string, Record<"acquireLease" | "returnLeases" | "reconcileTokens" | "recordRequests", ReturnType<typeof vi.fn>>>(),
	acquire: vi.fn(),
	background: [] as Promise<unknown>[],
}));
vi.mock("@/runtime/env", () => ({
	getCache: () => ({ get: async () => null, put: async () => undefined }),
	getBindingsIfConfigured: () => null,
	dispatchBackground: (promise: Promise<unknown>) => { runtime.background.push(promise.catch(() => undefined)); },
	getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: runtime.rows, error: null }) }) }) }),
	getBindings: () => ({
		PROVIDER_RATE_LIMITS: {
			getByName: (name: string) => {
				let object = runtime.objects.get(name);
				if (!object) {
					object = {
						acquireLease: vi.fn((...args: unknown[]) => runtime.acquire(name, ...args)),
						returnLeases: vi.fn(async () => undefined),
						reconcileTokens: vi.fn(async () => undefined),
						recordRequests: vi.fn(async () => undefined),
					};
					runtime.objects.set(name, object);
				}
				return object;
			},
		},
	}),
}));

const limit = (overrides: Record<string, unknown>) => ({ provider_id: "openai", provider_model_slug: "*", enabled: true, headroom_bps: 0, ...overrides });
const grant = (need: { requests: number; units: number }) =>
	({ ok: true, lease: { id: `lease-${Math.random()}`, expiresAt: Date.now() + 50_000, requests: need.requests + 10, units: null, meta: { minuteWindow: 1, dayWindow: 1 } } });
const flush = async () => { while (runtime.background.length) await Promise.all(runtime.background.splice(0)); };

describe("non-blocking provider quota charges", () => {
	beforeEach(() => {
		vi.resetModules(); runtime.objects.clear(); runtime.background.length = 0;
		runtime.acquire.mockReset().mockImplementation(async (_name: string, _config: unknown, need: { requests: number; units: number }) => grant(need));
	});

	it("returns without awaiting the coordinator, even on a cold isolate", async () => {
		runtime.rows = [limit({ requests_per_minute: 100 })];
		runtime.acquire.mockImplementation(() => new Promise(() => undefined));
		const { chargeManagedProvider } = await import("./provider-rate-limits");
		const charge = chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: 10 });
		expect(charge).toMatchObject({ providerId: "openai", model: "gpt-x" });
		await vi.waitFor(() => expect(runtime.acquire).toHaveBeenCalled());
	});

	it("counts against the provider-wide limit and the model's own limit only", async () => {
		runtime.rows = [
			limit({ requests_per_minute: 100 }),
			limit({ provider_model_slug: "gpt-x", requests_per_minute: 10 }),
			limit({ provider_model_slug: "gpt-y", requests_per_minute: 10 }),
		];
		const { chargeManagedProvider } = await import("./provider-rate-limits");
		await chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: 10 }).reservations;
		expect([...runtime.objects.keys()].sort()).toEqual(["managed:openai", "managed:openai::gpt-x"]);
	});

	it("deranks only the refused scope until its window resets", async () => {
		runtime.rows = [limit({ provider_model_slug: "gpt-x", requests_per_minute: 1 })];
		runtime.acquire.mockResolvedValue({ ok: false, denial: { allowed: false, reason: "requests_per_minute", retryAfterSeconds: 30, reservation: null } });
		const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
		try {
			const { chargeManagedProvider, providerQuotaPressure } = await import("./provider-rate-limits");
			expect(providerQuotaPressure("openai", "gpt-x")).toBe(0);
			await chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: 10 }).reservations;
			expect(providerQuotaPressure("openai", "gpt-x")).toBeGreaterThan(0);
			expect(providerQuotaPressure("openai", "gpt-y")).toBe(0);
			expect(providerQuotaPressure("anthropic", "gpt-x")).toBe(0);
			clock.mockReturnValue(now + 31_000);
			expect(providerQuotaPressure("openai", "gpt-x")).toBe(0);
		} finally { clock.mockRestore(); }
	});

	it("still counts a refused attempt, which is sent anyway, toward longer windows", async () => {
		runtime.rows = [limit({ provider_model_slug: "gpt-x", requests_per_minute: 1, tokens_per_day: 1_000_000 })];
		runtime.acquire.mockResolvedValue({ ok: false, denial: { allowed: false, reason: "requests_per_minute", retryAfterSeconds: 30, reservation: null } });
		const { chargeManagedProvider, recordManagedProviderTokensOnce } = await import("./provider-rate-limits");
		const charge = chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: 400, reservationId: "attempt-2" });
		expect(await charge.reservations).toEqual([expect.objectContaining({ scope: "openai::gpt-x", tokens: 0 })]);
		const object = runtime.objects.get("managed:openai::gpt-x") as any;
		expect(object.recordRequests).toHaveBeenCalledWith(1);

		const ctx = { testingMode: false, requestId: "req", meta: {} } as any;
		await recordManagedProviderTokensOnce({ ctx, providerId: "openai", keySource: "gateway", usage: { total_tokens: 450 }, reservation: charge });
		expect(object.reconcileTokens).toHaveBeenCalledWith(expect.objectContaining({ id: "attempt-2", tokens: 0 }), 450);
	});

	it("keeps a refused attempt's token accounting when recording its request fails", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		runtime.rows = [limit({ provider_model_slug: "gpt-x", requests_per_minute: 1, tokens_per_day: 1_000_000 })];
		runtime.acquire.mockResolvedValue({ ok: false, denial: { allowed: false, reason: "requests_per_minute", retryAfterSeconds: 30, reservation: null } });
		try {
			const recordRequests = vi.fn(async () => { throw new Error("object overloaded"); });
			runtime.objects.set("managed:openai::gpt-x", {
				acquireLease: vi.fn((...args: unknown[]) => runtime.acquire("managed:openai::gpt-x", ...args)),
				returnLeases: vi.fn(async () => undefined),
				reconcileTokens: vi.fn(async () => undefined),
				recordRequests,
			});
			const { chargeManagedProvider } = await import("./provider-rate-limits");
			const charge = chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: 400 });
			expect(await charge.reservations).toEqual([expect.objectContaining({ scope: "openai::gpt-x", tokens: 0 })]);
			await flush();
			expect(recordRequests).toHaveBeenCalledWith(1);
			expect(log).toHaveBeenCalledWith("[gateway] provider rate-limit request recording failed", expect.anything());
		} finally { log.mockRestore(); }
	});

	it("a provider-wide refusal deranks every model of that provider", async () => {
		runtime.rows = [limit({ requests_per_day: 5 })];
		runtime.acquire.mockResolvedValue({ ok: false, denial: { allowed: false, reason: "requests_per_day", retryAfterSeconds: 3_600, reservation: null } });
		const { chargeManagedProvider, providerQuotaPressure } = await import("./provider-rate-limits");
		await chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: 10 }).reservations;
		expect(providerQuotaPressure("openai", "gpt-y")).toBeGreaterThan(0);
		expect(providerQuotaPressure("openai", null)).toBeGreaterThan(0);
	});

	it("reports how far over its limit a provider and model is, worst scope first", async () => {
		runtime.rows = [limit({ requests_per_minute: 100 }), limit({ provider_model_slug: "gpt-x", requests_per_minute: 10 })];
		runtime.acquire.mockImplementation(async (name: string, _config: unknown, need: { requests: number; units: number }) =>
			name === "managed:openai::gpt-x"
				? { ok: false, denial: { allowed: false, reason: "requests_per_minute", retryAfterSeconds: 30, reservation: null, overage: 1.5 } }
				: grant(need));
		const { chargeManagedProvider, providerQuotaPressure } = await import("./provider-rate-limits");
		await chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: 10 }).reservations;
		expect(providerQuotaPressure("openai", "gpt-x")).toBe(1.5);
		expect(providerQuotaPressure("openai", "gpt-y")).toBe(0);
	});

	it("measures overage against the provider's own limit", async () => {
		const { resolveProviderRateLimitDenial } = await import("./provider-rate-limits");
		const counters = { minuteWindow: 0, dayWindow: 0, minuteRequests: 12, dayRequests: 50, minuteTokens: 900, dayTokens: 0 };
		const config = { providerId: "openai", requestsPerMinute: 10, requestsPerDay: 1_000, tokensPerMinute: 1_000, tokensPerDay: null, headroomBps: 1_000 };
		// 13/10 requests beats 1,000/1,000 tokens (refused only because of the 10% headroom).
		expect(resolveProviderRateLimitDenial(config, counters, 0, 100)?.overage).toBeCloseTo(1.3);
		// An unbounded reservation is not counted as overage.
		expect(resolveProviderRateLimitDenial({ ...config, requestsPerMinute: null }, counters, 0, Number.MAX_SAFE_INTEGER)?.overage).toBeCloseTo(0.9);
	});

	it("fails open without saturating anything when the coordinator is unavailable", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		runtime.rows = [limit({ requests_per_minute: 1 })];
		runtime.acquire.mockRejectedValue(new Error("object overloaded"));
		try {
			const { chargeManagedProvider, providerQuotaPressure } = await import("./provider-rate-limits");
			expect(await chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: 10 }).reservations).toEqual([]);
			expect(providerQuotaPressure("openai", "gpt-x")).toBe(0);
		} finally { log.mockRestore(); }
	});

	it("counts usage after the response when no token upper bound is known", async () => {
		runtime.rows = [limit({ provider_model_slug: "gpt-x", tokens_per_minute: 1_000 })];
		const { chargeManagedProvider, recordManagedProviderTokensOnce } = await import("./provider-rate-limits");
		const charge = chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: () => null, reservationId: "attempt-1" });
		const [reservation] = await charge.reservations;
		expect(reservation).toMatchObject({ id: "attempt-1", scope: "openai::gpt-x", tokens: 0 });
		// Nothing is reserved up front, so the coordinator is not asked to refuse it.
		expect(runtime.acquire.mock.calls[0][2]).toEqual({ requests: 1, units: 0 });

		const ctx = { testingMode: false, requestId: "req", meta: {} } as any;
		const usage = { prompt_tokens: 300, completion_tokens: 200, total_tokens: 500 };
		await recordManagedProviderTokensOnce({ ctx, providerId: "openai", keySource: "gateway", usage, reservation: charge });
		await recordManagedProviderTokensOnce({ ctx, providerId: "openai", keySource: "gateway", usage, reservation: charge });
		const object = runtime.objects.get("managed:openai::gpt-x")!;
		expect(object.reconcileTokens).toHaveBeenCalledTimes(1);
		expect(object.reconcileTokens).toHaveBeenCalledWith(expect.objectContaining({ id: "attempt-1", tokens: 0 }), 500);
	});

	it("estimates tokens at most once across scopes", async () => {
		runtime.rows = [limit({ tokens_per_minute: 100_000 }), limit({ provider_model_slug: "gpt-x", tokens_per_minute: 10_000 })];
		const estimate = vi.fn(() => 500);
		const { chargeManagedProvider } = await import("./provider-rate-limits");
		const reservations = await chargeManagedProvider({ providerId: "openai", model: "gpt-x", reservationTokens: estimate }).reservations;
		expect(estimate).toHaveBeenCalledTimes(1);
		expect(reservations.map((reservation) => reservation.scope).sort()).toEqual(["openai", "openai::gpt-x"]);
		await flush();
	});
});
