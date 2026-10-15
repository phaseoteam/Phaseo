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

const findModelSuccessorMock = vi.fn();
const findWorkspaceModelSuccessorMock = vi.fn();
const loadSuccessorRedirectPolicyMock = vi.fn();
const successorRedirectEnabledMock = vi.fn();

vi.mock("./modelSuccessor", async (importOriginal) => ({
	...(await importOriginal<typeof import("./modelSuccessor")>()),
	findModelSuccessor: (...args: any[]) => findModelSuccessorMock(...args),
	findWorkspaceModelSuccessor: (...args: any[]) => findWorkspaceModelSuccessorMock(...args),
	loadSuccessorRedirectPolicy: (...args: any[]) => loadSuccessorRedirectPolicyMock(...args),
	successorRedirectEnabled: () => successorRedirectEnabledMock(),
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

describe("beforeRequest model successor redirect", () => {
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
		findModelSuccessorMock.mockReset();
		findWorkspaceModelSuccessorMock.mockReset();
		loadSuccessorRedirectPolicyMock.mockReset();
		successorRedirectEnabledMock.mockReset();
		successorRedirectEnabledMock.mockReturnValue(true);
		loadSuccessorRedirectPolicyMock.mockResolvedValue({ enabled: true, pricePolicy: "never", maxPriceIncreasePercent: 0, overrides: {} });
		findModelSuccessorMock.mockResolvedValue({
			model: "openai/gpt-old",
			replacementModel: "openai/gpt-new",
			unservedSince: "2026-10-01T00:00:00Z",
			target: "openai/gpt-new",
			chain: ["openai/gpt-new"],
			reason: "eligible",
			priceRatio: 1,
			priceComparable: true,
			workspaceOverride: false,
		});

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

	function unserved(model: string) {
		return {
			ok: false,
			unservedModel: model,
			response: new Response(JSON.stringify({ error: "model_retired" }), { status: 410 }),
		};
	}

	function primary(body: Record<string, unknown> = {}) {
		const rawBody = { model: "openai/gpt-old", input: "hi", ...body };
		guardJsonMock.mockResolvedValue({ ok: true, value: rawBody });
		guardZodMock.mockImplementation((_schema: unknown, value: unknown) => ({ ok: true, value }));
		guardModelMock.mockImplementation((value: any) => ({ ok: true, value: { body: value, model: value.model, stream: false } }));
		return rawBody;
	}

	it("serves an unserved model from its approved successor and records the substitution", async () => {
		const rawBody = primary();
		guardContextMock
			.mockResolvedValueOnce(unserved("openai/gpt-old"))
			.mockResolvedValueOnce(contextFor("openai/gpt-new"));

		const result = await beforeRequest(request(rawBody), "responses", new Timer(), null);

		expect(result.ok).toBe(true);
		expect(guardContextMock.mock.calls.map((call) => call[0].model)).toEqual(["openai/gpt-old", "openai/gpt-new"]);
		expect(loadSuccessorRedirectPolicyMock).toHaveBeenCalledWith("team_123");
		expect(findModelSuccessorMock).toHaveBeenCalledWith("openai/gpt-old");
		expect(applyWorkspacePolicyMock.mock.calls[0]?.[0].resolvedModel).toBe("openai/gpt-new");
		if (result.ok) {
			expect(result.ctx.model).toBe("openai/gpt-new");
			expect(result.ctx.requestedModel).toBe("openai/gpt-old");
			expect(result.ctx.body.model).toBe("openai/gpt-new");
			expect(result.ctx.routingDiagnostics?.modelSubstitution).toEqual({
				from: "openai/gpt-old",
				to: "openai/gpt-new",
				reason: "unserved",
				chain: ["openai/gpt-new"],
				unservedSince: "2026-10-01T00:00:00Z",
				priceRatio: 1,
				source: "approved",
			});
		}
	});

	it.each([
		["the workspace has not turned it on", () => loadSuccessorRedirectPolicyMock.mockResolvedValue({ enabled: false, pricePolicy: "any", maxPriceIncreasePercent: 0, overrides: {} })],
		["the kill switch is off", () => successorRedirectEnabledMock.mockReturnValue(false)],
		["the successor costs more than the policy allows", () => findModelSuccessorMock.mockResolvedValue({
			model: "openai/gpt-old", replacementModel: "openai/gpt-new", unservedSince: null, target: "openai/gpt-new",
			chain: ["openai/gpt-new"], reason: "eligible", priceRatio: 1.25, priceComparable: true, workspaceOverride: false,
		})],
		["the workspace never redirects this model", () => loadSuccessorRedirectPolicyMock.mockResolvedValue({ enabled: true, pricePolicy: "any", maxPriceIncreasePercent: 0, overrides: { "openai/gpt-old": null } })],
		["no successor is eligible", () => findModelSuccessorMock.mockResolvedValue(null)],
	])("returns the original failure when %s", async (_label, arrange) => {
		const rawBody = primary();
		arrange();
		guardContextMock.mockResolvedValueOnce(unserved("openai/gpt-old"));

		const result = await beforeRequest(request(rawBody), "responses", new Timer(), null);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.response.status).toBe(410);
			expect(result).not.toHaveProperty("unservedModelFallback");
		}
		expect(guardContextMock).toHaveBeenCalledTimes(1);
	});

	it("uses the workspace's own replacement instead of the approved successor", async () => {
		const rawBody = primary();
		loadSuccessorRedirectPolicyMock.mockResolvedValue({ enabled: true, pricePolicy: "never", maxPriceIncreasePercent: 0, overrides: { "openai/gpt-old": "openai/gpt-custom" } });
		findWorkspaceModelSuccessorMock.mockResolvedValue({
			model: "openai/gpt-old", replacementModel: "openai/gpt-custom", unservedSince: "2026-10-01T00:00:00Z", target: "openai/gpt-custom",
			chain: ["openai/gpt-custom"], reason: "eligible", priceRatio: 3, priceComparable: true, workspaceOverride: true,
		});
		guardContextMock
			.mockResolvedValueOnce(unserved("openai/gpt-old"))
			.mockResolvedValueOnce(contextFor("openai/gpt-custom"));

		const result = await beforeRequest(request(rawBody), "responses", new Timer(), null);

		expect(result.ok).toBe(true);
		expect(findWorkspaceModelSuccessorMock).toHaveBeenCalledWith("openai/gpt-old", "openai/gpt-custom");
		expect(findModelSuccessorMock).not.toHaveBeenCalled();
		if (result.ok) expect(result.ctx.routingDiagnostics?.modelSubstitution).toMatchObject({ to: "openai/gpt-custom", source: "workspace" });
	});

	it("returns the original failure when the successor cannot serve the endpoint either", async () => {
		const rawBody = primary();
		guardContextMock
			.mockResolvedValueOnce(unserved("openai/gpt-old"))
			.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 400 }) });

		const result = await beforeRequest(request(rawBody), "responses", new Timer(), null);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.response.status).toBe(410);
	});

	it("does not look anything up for failures that are not about an unserved model", async () => {
		const rawBody = primary();
		guardContextMock.mockResolvedValueOnce({ ok: false, response: new Response("{}", { status: 402 }) });

		const result = await beforeRequest(request(rawBody), "responses", new Timer(), null);

		expect(result.ok).toBe(false);
		expect(loadSuccessorRedirectPolicyMock).not.toHaveBeenCalled();
		expect(findModelSuccessorMock).not.toHaveBeenCalled();
	});

	it("leaves the request's own fallback list to be tried first", async () => {
		const rawBody = primary({ models: ["anthropic/claude-haiku-5-5"] });
		guardContextMock.mockResolvedValueOnce(unserved("openai/gpt-old"));

		const result = await beforeRequest(request(rawBody), "responses", new Timer(), null);

		expect(result.ok).toBe(false);
		expect(findModelSuccessorMock).not.toHaveBeenCalled();
		if (!result.ok) {
			expect(result).toMatchObject({
				unservedModelFallback: {
					model: "openai/gpt-old",
					requestId: "req_123",
					models: ["anthropic/claude-haiku-5-5"],
					retryRawBody: { model: "openai/gpt-old", input: "hi" },
				},
			});
		}
	});

	it("redirects the last model of a fallback list", async () => {
		const rawBody = primary({ models: ["openai/gpt-old"] });
		guardContextMock
			.mockResolvedValueOnce(unserved("openai/gpt-old"))
			.mockResolvedValueOnce(contextFor("openai/gpt-new"));

		const result = await beforeRequest(request(rawBody), "responses", new Timer(), null, {
			requestModelOverride: "openai/gpt-old",
			allowModelSuccessor: true,
		});

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.ctx.model).toBe("openai/gpt-new");
	});

	it("names both models when policy blocks the successor", async () => {
		const rawBody = primary();
		guardContextMock
			.mockResolvedValueOnce(unserved("openai/gpt-old"))
			.mockResolvedValueOnce(contextFor("openai/gpt-new"));
		applyWorkspacePolicyMock.mockReturnValue({
			ok: false,
			reason: "model_not_allowed",
			diagnostics: { activeGuardrailIds: [] },
		});

		const result = await beforeRequest(request(rawBody), "responses", new Timer(), null);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.response.status).toBe(403);
			const payload = await result.response.json();
			expect(payload.description).toBe(
				'Model "openai/gpt-old" has no provider, and its replacement "openai/gpt-new" is blocked by a workspace policy or guardrail',
			);
			expect(payload).toMatchObject({ requested_model: "openai/gpt-old", replacement_model: "openai/gpt-new" });
		}
	});
});
