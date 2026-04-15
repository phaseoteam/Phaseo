import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardContext } from "./guards";
import { fetchGatewayContext } from "./context";

vi.mock("./context", () => ({
	fetchGatewayContext: vi.fn(),
}));

const fetchGatewayContextMock = vi.mocked(fetchGatewayContext);

function makeContext(args: {
	model?: string;
	creditOk?: boolean;
	creditReason?: string | null;
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

	return {
		teamId: "team_123",
		resolvedModel: args.model ?? "openai/gpt-4.1-mini",
		key: { ok: true, reason: null, resetAt: null },
		keyLimit: { ok: true, reason: null, resetAt: null },
		credit: {
			ok: args.creditOk ?? false,
			reason: args.creditReason ?? "insufficient_funds",
			resetAt: null,
			balanceNanos: 0,
		},
		providers: [
			{
				providerId: "openai",
				supportsEndpoint: true,
				baseWeight: 1,
				byokMeta: [],
				providerModelSlug: null,
				capabilityParams: {},
			},
		],
		pricing: {
			openai: {
				provider: "openai",
				model: args.model ?? "openai/gpt-4.1-mini",
				endpoint: "text.generate",
				effective_from: null,
				effective_to: null,
				currency: "USD",
				version: null,
				rules: rules.map((rule) => ({
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
		},
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
			teamId: "team_123",
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
		expect(payload.error).toBe("insufficient_funds");
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
			teamId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "google/gemma-3-27b:free",
			requestId: "req_free_1",
		});

		expect(result.ok).toBe(true);
	});

	it("allows zero-credit requests when all routable pricing cards are free/zero-cost", async () => {
		fetchGatewayContextMock.mockResolvedValue(
			makeContext({
				model: "provider/model-no-suffix",
				creditOk: false,
				pricingRules: [{ pricing_plan: "standard", price_per_unit: "0" }],
			}) as any,
		);

		const result = await guardContext({
			teamId: "team_123",
			apiKeyId: "key_123",
			endpoint: "responses",
			capability: "text.generate",
			model: "provider/model-no-suffix",
			requestId: "req_free_2",
		});

		expect(result.ok).toBe(true);
	});
});

