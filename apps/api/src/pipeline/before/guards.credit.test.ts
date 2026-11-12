import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatUsdFromNanos, guardContext, keyLimitRetryAfterSeconds } from "./guards";
import { fetchGatewayContext } from "./context";

vi.mock("./context", () => ({
	fetchGatewayContext: vi.fn(),
}));

const fetchGatewayContextMock = vi.mocked(fetchGatewayContext);

function makeContext(args: {
	model?: string;
	creditOk?: boolean;
	creditReason?: string | null;
	keyLimit?: {
		ok?: boolean;
		reason?: string | null;
		resetAt?: string | null;
		now?: string | null;
		limitWindow?: "daily" | "weekly" | "monthly" | null;
		limitMetric?: "requests" | "cost" | "soft_blocked" | null;
		currentValue?: number | null;
		limitValue?: number | null;
		buckets?: {
			daily?: {
				windowStart: string | null;
				requestsUsed: number;
				requestsLimit: number;
				costUsedNanos: number;
				costLimitNanos: number;
			};
			weekly?: {
				windowStart: string | null;
				requestsUsed: number;
				requestsLimit: number;
				costUsedNanos: number;
				costLimitNanos: number;
			};
			monthly?: {
				windowStart: string | null;
				requestsUsed: number;
				requestsLimit: number;
				costUsedNanos: number;
				costLimitNanos: number;
			};
		} | null;
	};
	providers?: Array<{
		providerId: string;
		supportsEndpoint?: boolean;
	}>;
	pricingByProvider?: Record<
		string,
		| Array<{
				pricing_plan?: string;
				price_per_unit?: string | number;
		  }>
		| undefined
	>;
	pricingRules?: Array<{
		pricing_plan?: string;
		price_per_unit?: string | number;
	}>;
}) {
	const rules = args.pricingRules ?? [
		{
			pricing_plan: "standard",
			price_per_unit: "0.01",
		},
	];
	const providers =
		args.providers ??
		([
			{
				providerId: "openai",
				supportsEndpoint: true,
			},
		] as const);
	const pricingByProvider = args.pricingByProvider ?? {
		openai: rules,
	};
	const pricing = Object.fromEntries(
		Object.entries(pricingByProvider)
			.filter(([, providerRules]) => Array.isArray(providerRules))
			.map(([providerId, providerRules]) => [
				providerId,
				{
					provider: providerId,
					model: args.model ?? "openai/gpt-4.1-mini",
					endpoint: "text.generate",
					effective_from: null,
					effective_to: null,
					currency: "USD",
					version: null,
					rules: (providerRules ?? []).map((rule) => ({
						pricing_plan: rule.pricing_plan ?? "standard",
						meter: "requests",
						unit: "request",
						unit_size: 1,
						price_per_unit: String(rule.price_per_unit ?? "0.01"),
						currency: "USD",
						match: [],
						priority: 100,
					})),
				},
			]),
	);

	return {
		workspaceId: "team_123",
		resolvedModel: args.model ?? "openai/gpt-4.1-mini",
		key: { ok: true, reason: null, resetAt: null },
		keyLimit: {
			ok: args.keyLimit?.ok ?? true,
			reason: args.keyLimit?.reason ?? null,
			resetAt: args.keyLimit?.resetAt ?? null,
			now: args.keyLimit?.now ?? null,
			limitWindow: args.keyLimit?.limitWindow ?? null,
			limitMetric: args.keyLimit?.limitMetric ?? null,
			currentValue: args.keyLimit?.currentValue ?? null,
			limitValue: args.keyLimit?.limitValue ?? null,
			buckets: args.keyLimit?.buckets ?? null,
		},
		credit: {
			ok: args.creditOk ?? false,
			reason: args.creditReason ?? "insufficient_funds",
			resetAt: null,
			balanceNanos: 0,
		},
		providers: providers.map((provider) => ({
			providerId: provider.providerId,
			supportsEndpoint: provider.supportsEndpoint ?? true,
			baseWeight: 1,
			byokMeta: [],
			providerModelSlug: null,
			capabilityParams: {},
		})),
		pricing,
		teamSettings: {
			routingMode: null,
			byokFallbackEnabled: null,
			betaChannelEnabled: false,
			alphaChannelEnabled: false,
			cacheAwareRoutingEnabled: null,
			billingMode: "wallet",
		},
	};
}

describe("guardContext credit gating for free models", () => {
	beforeEach(() => {
		fetchGatewayContextMock.mockReset();
	});

	it("keeps insufficient_funds for paid pricing when credits are insufficient", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "openai/gpt-4.1-mini",
				creditOk: false,
				pricingRules: [{ pricing_plan: "standard", price_per_unit: "0.01" }],
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "openai/gpt-4.1-mini",
			requestId: "req_paid_1",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(402);
		const payload = await result.response.json();
		expect(payload.code).toBe("insufficient_funds");
	});

	it("allows :free model requests with zero credits", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "google/gemma-3-27b:free",
				creditOk: false,
				pricingRules: [{ pricing_plan: "free", price_per_unit: "0" }],
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "google/gemma-3-27b:free",
			requestId: "req_free_1",
		});

		expect(result.ok).toBe(true);
	});

	it("keeps insufficient_funds for :free model names without free pricing", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "provider/model-no-suffix:free",
				creditOk: false,
				pricingRules: [{ pricing_plan: "standard", price_per_unit: "0.01" }],
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "provider/model-no-suffix:free",
			requestId: "req_fake_free_suffix",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(402);
		const payload = await result.response.json();
		expect(payload.code).toBe("insufficient_funds");
	});

	// Production, 2026-10-18: a $0 workspace got 402 for :free models and
	// phaseo/free. The v2 catalogue labels a SKU's rules with its service tier,
	// so a $0 free route can arrive as pricing_plan "standard".
	it("allows a :free model whose $0 route is labelled with the standard plan", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "google/gemma-4-26b-a4b:free",
				creditOk: false,
				providers: [{ providerId: "google-ai-studio" }],
				pricingByProvider: {
					"google-ai-studio": [
						{ pricing_plan: "standard", price_per_unit: "0" },
						{ pricing_plan: "standard", price_per_unit: 0 },
					],
				},
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "chat.completions",
			capability: "text.generate",
			model: "google/gemma-4-26b-a4b:free",
			requestId: "req_free_standard_label",
		});

		expect(result.ok).toBe(true);
	});

	it("allows a model whose every routable route is all-zero priced", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "apodex/apodex-1.1-mini:free",
				creditOk: false,
				providers: [{ providerId: "novita" }, { providerId: "gmicloud" }],
				pricingByProvider: {
					novita: [{ pricing_plan: "standard", price_per_unit: "0" }],
					gmicloud: [{ pricing_plan: "free", price_per_unit: "0" }],
				},
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "apodex/apodex-1.1-mini:free",
			requestId: "req_free_all_zero",
		});

		expect(result.ok).toBe(true);
	});

	it("allows the phaseo/free router when its pool is all-zero priced", async () => {
		fetchGatewayContextMock.mockResolvedValue({
			...makeContext({
				model: "phaseo/free",
				creditOk: false,
				providers: [{ providerId: "google-ai-studio" }, { providerId: "novita" }],
				pricingByProvider: {
					"google-ai-studio": [{ pricing_plan: "free", price_per_unit: "0" }],
					novita: [{ pricing_plan: "standard", price_per_unit: "0" }],
				},
			}),
			resolvedModel: "phaseo/free",
		} as any);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "chat.completions",
			capability: "text.generate",
			model: "phaseo/free",
			requestId: "req_free_router",
		});

		expect(result.ok).toBe(true);
	});

	it("keeps insufficient_funds when one routable route of the model is paid", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "google/gemma-4-31b",
				creditOk: false,
				providers: [{ providerId: "google-ai-studio" }, { providerId: "novita" }],
				pricingByProvider: {
					"google-ai-studio": [{ pricing_plan: "standard", price_per_unit: "0" }],
					novita: [{ pricing_plan: "standard", price_per_unit: "0.0000002" }],
				},
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "chat.completions",
			capability: "text.generate",
			model: "google/gemma-4-31b",
			requestId: "req_mixed",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(402);
		const payload = await result.response.json();
		expect(payload.code).toBe("insufficient_funds");
	});

	it("keeps insufficient_funds for a workspace private model's $0 placeholder card", async () => {
		// makeContext sets each card's provider to its provider ID.
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "acme/private-model",
				creditOk: false,
				providers: [{ providerId: "private-model" }],
				pricingByProvider: {
					"private-model": [{ pricing_plan: "standard", price_per_unit: "0" }],
				},
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "acme/private-model",
			requestId: "req_private_model",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(402);
	});

	it("keeps insufficient_funds for free-plan pricing with a positive price", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "provider/model-no-suffix",
				creditOk: false,
				pricingRules: [{ pricing_plan: "free", price_per_unit: "0.01" }],
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "provider/model-no-suffix",
			requestId: "req_free_positive_price",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(402);
		const payload = await result.response.json();
		expect(payload.code).toBe("insufficient_funds");
	});

	it("fails closed when a routable provider has missing pricing", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "provider/model-no-suffix",
				creditOk: false,
				providers: [
					{ providerId: "openai" },
					{ providerId: "anthropic" },
				],
				pricingByProvider: {
					openai: [{ pricing_plan: "free", price_per_unit: "0" }],
				},
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "provider/model-no-suffix",
			requestId: "req_free_missing_pricing",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(402);
		const payload = await result.response.json();
		expect(payload.code).toBe("insufficient_funds");
	});

	it("ignores providers that are not routable for free-credit bypass", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "provider/model-no-suffix",
				creditOk: false,
				providers: [
					{ providerId: "openai" },
					{ providerId: "non-existent-provider" },
				],
				pricingByProvider: {
					openai: [{ pricing_plan: "free", price_per_unit: "0" }],
					"non-existent-provider": [{ pricing_plan: "standard", price_per_unit: "0.2" }],
				},
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "provider/model-no-suffix",
			requestId: "req_free_non_routable",
		});

		expect(result.ok).toBe(true);
	});

	it("returns structured key limit diagnostics when an API key limit is reached", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "openai/gpt-4.1-mini",
				creditOk: true,
				keyLimit: {
					ok: false,
					reason: "daily_request_limit_reached",
					resetAt: "2026-05-09T23:59:59.000Z",
					now: "2026-05-09T12:00:00.000Z",
					limitWindow: "daily",
					limitMetric: "requests",
					currentValue: 100,
					limitValue: 100,
					buckets: {
						daily: {
							windowStart: "2026-05-09T00:00:00.000Z",
							requestsUsed: 100,
							requestsLimit: 100,
							costUsedNanos: 0,
							costLimitNanos: 0,
						},
					},
				},
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "openai/gpt-4.1-mini",
			requestId: "req_key_limit_1",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(429);
		expect(result.response.headers.get("Retry-After")).toBe("43199");
		const payload = await result.response.json();
		expect(payload).toMatchObject({
			code: "key_limit_exceeded",
			reason: "daily_request_limit_reached",
			reset_at: "2026-05-09T23:59:59.000Z",
			now: "2026-05-09T12:00:00.000Z",
			limit_window: "daily",
			limit_metric: "requests",
			current_value: 100,
			limit_value: 100,
			buckets: {
				daily: {
					windowStart: "2026-05-09T00:00:00.000Z",
					requestsUsed: 100,
					requestsLimit: 100,
					costUsedNanos: 0,
					costLimitNanos: 0,
				},
			},
			description:
				"This API key has reached its daily request limit (100/100).",
			request_id: "req_key_limit_1",
			workspace_id: "team_123",
		});
	});

	it("omits Retry-After when the limit has no reset", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "openai/gpt-4.1-mini",
				creditOk: true,
				keyLimit: { ok: false, reason: "key_limit_soft_blocked", resetAt: null, limitMetric: "soft_blocked" },
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "openai/gpt-4.1-mini",
			requestId: "req_key_limit_2",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(429);
		expect(result.response.headers.get("Retry-After")).toBeNull();
	});
});

describe("monthly key spend cap", () => {
	it("describes the cap in dollars and keeps a Retry-After beyond a day", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "openai/text-embedding-3-small",
				creditOk: true,
				keyLimit: {
					ok: false,
					reason: "monthly_cost_limit_reached",
					resetAt: "2026-11-01T00:00:00.000Z",
					now: "2026-10-27T12:00:00.000Z",
					limitWindow: "monthly",
					limitMetric: "cost",
					currentValue: 11_660_720,
					limitValue: 10_000_000,
				},
			}) as any,
		);

		const result = await guardContext({
			workspaceId: "team_123",
			apiKeyId: "key_123",
			endpoint: "embeddings",
			capability: "embeddings",
			model: "openai/text-embedding-3-small",
			requestId: "req_key_spend_cap",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(429);
		// 4.5 days to the reset, well past the 24h ceiling for provider values.
		expect(result.response.headers.get("Retry-After")).toBe("388800");
		const payload = await result.response.json();
		expect(payload).toMatchObject({
			code: "key_limit_exceeded",
			current_value: 11_660_720,
			limit_value: 10_000_000,
			description: "This API key has reached its monthly spend limit ($0.0117 of $0.01).",
		});
	});
});

describe("formatUsdFromNanos", () => {
	it.each([
		[11_660_720, "$0.0117"],
		[10_000_000, "$0.01"],
		[1, "$0.000000001"],
		[0, "$0.00"],
		[500_000_000, "$0.50"],
		[1_000_000_000, "$1.00"],
		[1_234_500_000_000, "$1,234.50"],
	])("formats %d nanos as %s", (nanos, expected) => {
		expect(formatUsdFromNanos(nanos)).toBe(expected);
	});
});

describe("keyLimitRetryAfterSeconds", () => {
	it("rounds up to whole seconds and never returns less than one", () => {
		expect(keyLimitRetryAfterSeconds("2026-05-09T12:00:01.200Z", "2026-05-09T12:00:00.000Z")).toBe(2);
		expect(keyLimitRetryAfterSeconds("2026-05-09T11:59:00.000Z", "2026-05-09T12:00:00.000Z")).toBe(1);
	});

	it("returns null without a parseable reset time", () => {
		expect(keyLimitRetryAfterSeconds(null)).toBeNull();
		expect(keyLimitRetryAfterSeconds("not-a-date", "2026-05-09T12:00:00.000Z")).toBeNull();
	});
});

