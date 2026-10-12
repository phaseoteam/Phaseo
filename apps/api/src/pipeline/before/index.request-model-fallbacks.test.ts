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
const applyPromptInjectionGuardrailsMock = vi.fn();
const applySensitiveInfoGuardrailsMock = vi.fn();

vi.mock("@core/schemas", () => ({
	schemaFor: vi.fn(() => null),
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ ENV: "test" }),
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
	resolvePerfGatewayAccess: () => ({ allowed: true, perfEnvironment: false }),
	isPerfGatewayEndpointAllowed: () => true,
}));

vi.mock("@/executors", () => ({
	EXECUTORS_BY_PROVIDER: { openai: {} },
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

vi.mock("./promptInjection", () => ({
	applyPromptInjectionGuardrails: (...args: any[]) =>
		applyPromptInjectionGuardrailsMock(...args),
}));

vi.mock("./sensitiveInfo", () => ({
	applySensitiveInfoGuardrails: (...args: any[]) =>
		applySensitiveInfoGuardrailsMock(...args),
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

describe("beforeRequest request model fallbacks", () => {
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
		applyPromptInjectionGuardrailsMock.mockReset();
		applySensitiveInfoGuardrailsMock.mockReset();

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
		fetchWorkspacePolicyMock.mockResolvedValue({ dynamicRoute: null });
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
		applyPromptInjectionGuardrailsMock.mockImplementation((args: any) => ({
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement: null,
		}));
		applySensitiveInfoGuardrailsMock.mockImplementation((args: any) => ({
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement: args.existingEnforcement ?? null,
		}));
	});

	function contextFor(model: string) {
		const provider = providerWithPricingRules(1);
		return {
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
				resolvedModel: model,
				candidateDiagnostics: {
					totalProviders: 1,
					supportsEndpointCount: 1,
					droppedUnsupportedEndpoint: [],
					droppedMissingAdapter: [],
					candidateCount: 1,
				},
			},
		};
	}

	function request(body: unknown) {
		return new Request("https://gateway.local/v1/messages", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	it("strips models before schema and parameter validation and records the fallback plan", async () => {
		const rawBody = {
			model: "openai/gpt-4.1-mini",
			models: ["openai/gpt-4.1-mini", "anthropic/claude-haiku-5-5", "anthropic/claude-haiku-5-5", "@support"],
			messages: [{ role: "user", content: "hi" }],
		};
		guardJsonMock.mockResolvedValue({ ok: true, value: rawBody });
		guardZodMock.mockImplementation((_schema: unknown, body: unknown) => ({ ok: true, value: body }));
		guardContextMock.mockResolvedValue(contextFor("openai/gpt-4.1-mini"));

		const result = await beforeRequest(request(rawBody), "messages", new Timer(), null);

		expect(result.ok).toBe(true);
		expect(guardZodMock.mock.calls[0]?.[1]).not.toHaveProperty("models");
		expect(validateCapabilitiesMock.mock.calls[0]?.[0].rawBody).not.toHaveProperty("models");
		if (result.ok) {
			expect(result.ctx.rawBody).not.toHaveProperty("models");
			expect(result.ctx.routingDiagnostics?.requestModelFallbacks).toEqual({
				requested: rawBody.models,
				models: ["anthropic/claude-haiku-5-5", "@support"],
			});
		}
	});

	it("replaces the request model for a fallback attempt without re-reading models", async () => {
		const rawBody = { model: "openai/gpt-4.1-mini", models: ["openai/gpt-5-nano"], input: "hi" };
		guardJsonMock.mockResolvedValue({ ok: true, value: rawBody });
		guardZodMock.mockImplementation((_schema: unknown, body: unknown) => ({ ok: true, value: body }));
		guardModelMock.mockImplementation((body: any) => ({ ok: true, value: { body, model: body.model, stream: false } }));
		guardContextMock.mockResolvedValue(contextFor("openai/gpt-5-nano"));

		const result = await beforeRequest(request(rawBody), "responses", new Timer(), null, {
			requestModelOverride: "openai/gpt-5-nano",
		});

		expect(result.ok).toBe(true);
		expect(guardZodMock.mock.calls[0]?.[1]).toEqual({ model: "openai/gpt-5-nano", input: "hi" });
		expect(guardContextMock.mock.calls[0]?.[0].model).toBe("openai/gpt-5-nano");
		if (result.ok) {
			expect(result.ctx.model).toBe("openai/gpt-5-nano");
			expect(result.ctx.routingDiagnostics?.requestModelFallbacks).toBeUndefined();
		}
	});

	it.each([
		[{ model: "openai/gpt-4.1-mini", models: "openai/gpt-5-nano" }, "invalid_models"],
		[{ model: "openai/gpt-4.1-mini", models: [] }, "invalid_models"],
		[{ model: "openai/gpt-4.1-mini", models: [""] }, "invalid_models"],
		[{ model: "openai/gpt-4.1-mini", models: Array.from({ length: 9 }, (_, i) => `m/${i}`) }, "too_many_models"],
		[{ models: ["openai/gpt-5-nano"] }, "model_required_with_models"],
		[{ model: "phaseo/auto", models: ["openai/gpt-5-nano"] }, "models_not_supported_with_auto_router"],
		[{ model: "openai/gpt-4.1-mini", models: ["phaseo/auto"] }, "auto_router_not_allowed_in_models"],
	])("rejects invalid models with a 400 before routing (%j)", async (rawBody, reason) => {
		guardJsonMock.mockResolvedValue({ ok: true, value: rawBody });

		const result = await beforeRequest(request(rawBody), "embeddings", new Timer(), null);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.response.status).toBe(400);
			const payload = await result.response.json();
			expect(payload).toMatchObject({ error: "validation_error", reason });
			expect(payload.details[0].path).toEqual(["models"]);
		}
		expect(guardZodMock).not.toHaveBeenCalled();
		expect(guardContextMock).not.toHaveBeenCalled();
	});
});
