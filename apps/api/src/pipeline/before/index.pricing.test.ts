import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const guardJsonMock = vi.fn();
const guardZodMock = vi.fn();
const guardModelMock = vi.fn();
const guardContextMock = vi.fn();
const makeMetaMock = vi.fn();

const validateCapabilitiesMock = vi.fn();
const isTestingModeRequestedMock = vi.fn();
const resolveTestingModeMock = vi.fn();
const isProviderCapabilityEnabledMock = vi.fn();
const normalizeCapabilityMock = vi.fn();
const resolveCapabilityFromEndpointMock = vi.fn();
const fetchWorkspacePolicyMock = vi.fn();
const applyWorkspacePolicyMock = vi.fn();

vi.mock("@core/schemas", () => ({
	schemaFor: vi.fn(() => null),
}));

vi.mock("./guards", () => ({
	guardAuth: (...args: any[]) => guardAuthMock(...args),
	guardJson: (...args: any[]) => guardJsonMock(...args),
	guardZod: (...args: any[]) => guardZodMock(...args),
	guardModel: (...args: any[]) => guardModelMock(...args),
	guardContext: (...args: any[]) => guardContextMock(...args),
	makeMeta: (...args: any[]) => makeMetaMock(...args),
	normalizeReturnFlag: (value: unknown) => value === true || value === "true" || value === "1",
}));

vi.mock("./capabilityValidation", () => ({
	validateCapabilities: (...args: any[]) => validateCapabilitiesMock(...args),
}));

vi.mock("./testingMode", () => ({
	isTestingModeRequested: (...args: any[]) => isTestingModeRequestedMock(...args),
	resolveTestingMode: (...args: any[]) => resolveTestingModeMock(...args),
}));

vi.mock("@/executors", () => ({
	isProviderCapabilityEnabled: (...args: any[]) => isProviderCapabilityEnabledMock(...args),
	normalizeCapability: (...args: any[]) => normalizeCapabilityMock(...args),
}));

vi.mock("@/lib/config/capabilityToEndpoints", () => ({
	resolveCapabilityFromEndpoint: (...args: any[]) => resolveCapabilityFromEndpointMock(...args),
}));

vi.mock("./workspacePolicy", () => ({
	fetchWorkspacePolicy: (...args: any[]) => fetchWorkspacePolicyMock(...args),
	applyWorkspacePolicy: (...args: any[]) => applyWorkspacePolicyMock(...args),
}));

import { beforeRequest } from "./index";
import { Timer } from "../telemetry/timer";

function providerWithPricingRules(ruleCount: number): any {
	return {
		providerId: "openai",
		providerStatus: "active",
		providerRoutingStatus: "active",
		modelRoutingStatus: "active",
		capabilityStatus: "active",
		adapter: {
			name: "openai",
			supports: () => true,
			execute: async () => new Response("{}"),
		},
		baseWeight: 1,
		byokMeta: [],
		pricingCard: {
			provider: "openai",
			model: "openai/gpt-4.1-mini",
			endpoint: "text.generate",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: Array.from({ length: ruleCount }, () => ({
				pricing_plan: "standard",
				meter: "requests",
				unit: "request",
				unit_size: 1,
				price_per_unit: "0.01",
				currency: "USD",
				match: [],
				priority: 100,
			})),
		},
		providerModelSlug: null,
		inputModalities: ["text"],
		outputModalities: ["text"],
		capabilityParams: {},
		maxInputTokens: null,
		maxOutputTokens: null,
	};
}

describe("beforeRequest pricing loss-prevention", () => {
	beforeEach(() => {
		guardAuthMock.mockReset();
		guardJsonMock.mockReset();
		guardZodMock.mockReset();
		guardModelMock.mockReset();
		guardContextMock.mockReset();
		makeMetaMock.mockReset();
		validateCapabilitiesMock.mockReset();
		isTestingModeRequestedMock.mockReset();
		resolveTestingModeMock.mockReset();
		isProviderCapabilityEnabledMock.mockReset();
		normalizeCapabilityMock.mockReset();
		resolveCapabilityFromEndpointMock.mockReset();
		fetchWorkspacePolicyMock.mockReset();
		applyWorkspacePolicyMock.mockReset();

		guardAuthMock.mockResolvedValue({
			ok: true,
			value: {
				requestId: "req_123",
				workspaceId: "team_123",
				apiKeyId: "key_123",
				apiKeyRef: "kid_123",
				apiKeyKid: "kid_123",
				userId: null,
				internal: false,
			},
		});
		guardJsonMock.mockResolvedValue({ ok: true, value: { model: "openai/gpt-4.1-mini" } });
		guardZodMock.mockReturnValue({ ok: true, value: { model: "openai/gpt-4.1-mini" } });
		guardModelMock.mockReturnValue({
			ok: true,
			value: { body: { model: "openai/gpt-4.1-mini" }, model: "openai/gpt-4.1-mini", stream: false },
		});
		makeMetaMock.mockReturnValue({
			apiKeyId: "key_123",
			apiKeyRef: "kid_123",
			apiKeyKid: "kid_123",
			requestId: "req_123",
			stream: false,
			startedAtMs: Date.now(),
		});
		validateCapabilitiesMock.mockImplementation((args: any) => ({
			ok: true,
			body: args.body,
			providers: args.providers,
			requestedParams: [],
			paramRoutingDiagnostics: {
				requestedParams: [],
				unknownParams: [],
				providerCountBefore: args.providers.length,
				providerCountAfter: args.providers.length,
				perParamSupport: [],
				droppedProviders: [],
				filteringStages: [],
			},
		}));
		isTestingModeRequestedMock.mockReturnValue(false);
		resolveTestingModeMock.mockResolvedValue({ enabled: false, reason: "not_requested" });
		isProviderCapabilityEnabledMock.mockReturnValue(true);
		normalizeCapabilityMock.mockImplementation((value: string) => value);
		resolveCapabilityFromEndpointMock.mockReturnValue("text.generate");
		fetchWorkspacePolicyMock.mockResolvedValue(null);
		applyWorkspacePolicyMock.mockImplementation((args: any) => ({
			ok: true,
			providers: args.providers,
			diagnostics: {
				resolvedModel: args.resolvedModel,
				allowedApiModels: [],
				providerAllowlist: [],
				providerBlocklist: [],
				requestProviderOnly: [],
				requestProviderIgnore: [],
				activeGuardrailIds: [],
				beforeCount: args.providers.length,
				afterCount: args.providers.length,
			},
		}));
	});

	it("allows request when pricing rules are present", async () => {
		const provider = providerWithPricingRules(1);
		guardContextMock.mockResolvedValue({
			ok: true,
			value: {
				context: {
					pricing: { openai: provider.pricingCard },
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
					teamSettings: { billingMode: "wallet" },
				},
				providers: [provider],
				resolvedModel: "openai/gpt-4.1-mini",
				candidateDiagnostics: {
					totalProviders: 1,
					supportsEndpointCount: 1,
					droppedUnsupportedEndpoint: [],
					droppedMissingAdapter: [],
					candidateCount: 1,
				},
			},
		});

		const req = new Request("https://gateway.local/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "openai/gpt-4.1-mini" }),
		});
		const result = await beforeRequest(req, "responses", new Timer(), null);
		expect(result.ok).toBe(true);
	});

	it("rejects request when pricing card has zero rules", async () => {
		const provider = providerWithPricingRules(0);
		guardContextMock.mockResolvedValue({
			ok: true,
			value: {
				context: {
					pricing: { openai: provider.pricingCard },
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
					teamSettings: { billingMode: "wallet" },
				},
				providers: [provider],
				resolvedModel: "openai/gpt-4.1-mini",
				candidateDiagnostics: {
					totalProviders: 1,
					supportsEndpointCount: 1,
					droppedUnsupportedEndpoint: [],
					droppedMissingAdapter: [],
					candidateCount: 1,
				},
			},
		});

		const req = new Request("https://gateway.local/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "openai/gpt-4.1-mini" }),
		});
		const result = await beforeRequest(req, "responses", new Timer(), null);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const payload = await result.response.json();
		expect(payload.error).toBe("unsupported_model_or_endpoint");
		expect(payload.reason).toBe("pricing_not_configured");
		expect(payload.provider_candidate_diagnostics).toEqual({
			totalProviders: 1,
			supportsEndpointCount: 1,
			candidateCount: 1,
			droppedUnsupportedEndpoint: [],
			droppedMissingAdapter: [],
		});
		expect(payload.provider_enablement).toEqual({
			capability: "text.generate",
			providersBefore: ["openai"],
			providersAfter: [],
			dropped: [{ providerId: "openai", reason: "pricing_missing" }],
		});
		expect(payload.missing_pricing_providers).toEqual(["openai"]);
	});

	it("rejects request when workspace policy blocks the resolved model", async () => {
		const provider = providerWithPricingRules(1);
		guardContextMock.mockResolvedValue({
			ok: true,
			value: {
				context: {
					pricing: { openai: provider.pricingCard },
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
					teamSettings: { billingMode: "wallet" },
				},
				providers: [provider],
				resolvedModel: "blocked-model",
				candidateDiagnostics: {
					totalProviders: 1,
					supportsEndpointCount: 1,
					droppedUnsupportedEndpoint: [],
					droppedMissingAdapter: [],
					candidateCount: 1,
				},
			},
		});
		applyWorkspacePolicyMock.mockReturnValue({
			ok: false,
			reason: "model_not_allowed",
			diagnostics: {
				resolvedModel: "blocked-model",
				allowedApiModels: ["allowed-model"],
				providerAllowlist: [],
				providerBlocklist: [],
				requestProviderOnly: [],
				requestProviderIgnore: [],
				activeGuardrailIds: ["gr_123"],
				beforeCount: 1,
				afterCount: 0,
			},
		});

		const req = new Request("https://gateway.local/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "blocked-model" }),
		});
		const result = await beforeRequest(req, "responses", new Timer(), null);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const payload = await result.response.json();
		expect(payload.error).toBe("validation_error");
		expect(payload.details?.[0]?.keyword).toBe("model_not_allowed_by_workspace_policy");
	});

	it("rejects request when workspace policy filters out all providers", async () => {
		const provider = providerWithPricingRules(1);
		guardContextMock.mockResolvedValue({
			ok: true,
			value: {
				context: {
					pricing: { openai: provider.pricingCard },
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
					teamSettings: { billingMode: "wallet" },
				},
				providers: [provider],
				resolvedModel: "openai/gpt-4.1-mini",
				candidateDiagnostics: {
					totalProviders: 1,
					supportsEndpointCount: 1,
					droppedUnsupportedEndpoint: [],
					droppedMissingAdapter: [],
					candidateCount: 1,
				},
			},
		});
		applyWorkspacePolicyMock.mockReturnValue({
			ok: false,
			reason: "no_providers",
			diagnostics: {
				resolvedModel: "openai/gpt-4.1-mini",
				allowedApiModels: [],
				providerAllowlist: ["anthropic"],
				providerBlocklist: [],
				requestProviderOnly: [],
				requestProviderIgnore: [],
				activeGuardrailIds: ["gr_456"],
				beforeCount: 1,
				afterCount: 0,
			},
		});

		const req = new Request("https://gateway.local/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "openai/gpt-4.1-mini" }),
		});
		const result = await beforeRequest(req, "responses", new Timer(), null);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const payload = await result.response.json();
		expect(payload.error).toBe("validation_error");
		expect(payload.details?.[0]?.keyword).toBe("no_providers_after_workspace_policy_filter");
	});
});

