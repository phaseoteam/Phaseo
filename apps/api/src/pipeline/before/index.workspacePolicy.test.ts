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
const adapterForMock = vi.fn();
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
	normalizeReturnFlag: (value: unknown) =>
		value === true || value === "true" || value === "1",
}));

vi.mock("./capabilityValidation", () => ({
	validateCapabilities: (...args: any[]) => validateCapabilitiesMock(...args),
}));

vi.mock("./testingMode", () => ({
	isTestingModeRequested: (...args: any[]) => isTestingModeRequestedMock(...args),
	resolveTestingMode: (...args: any[]) => resolveTestingModeMock(...args),
}));

vi.mock("@/executors", () => ({
	isProviderCapabilityEnabled: (...args: any[]) =>
		isProviderCapabilityEnabledMock(...args),
	normalizeCapability: (...args: any[]) => normalizeCapabilityMock(...args),
}));

vi.mock("@/lib/config/capabilityToEndpoints", () => ({
	resolveCapabilityFromEndpoint: (...args: any[]) =>
		resolveCapabilityFromEndpointMock(...args),
}));

vi.mock("@/providers/index", () => ({
	adapterFor: (...args: any[]) => adapterForMock(...args),
}));

vi.mock("./workspacePolicy", () => ({
	fetchWorkspacePolicy: (...args: any[]) => fetchWorkspacePolicyMock(...args),
	applyWorkspacePolicy: (...args: any[]) => applyWorkspacePolicyMock(...args),
}));

import { beforeRequest } from "./index";
import { Timer } from "../telemetry/timer";

function provider(providerId: string): any {
	return {
		providerId,
		providerStatus: "active",
		providerRoutingStatus: "active",
		modelRoutingStatus: "active",
		capabilityStatus: "active",
		baseWeight: 1,
		byokMeta: [],
		pricingCard: {
			provider: providerId,
			model: "openai/gpt-5-nano",
			endpoint: "text.generate",
			effective_from: null,
			effective_to: null,
			currency: "USD",
			version: null,
			rules: [
				{
					pricing_plan: "standard",
					meter: "requests",
					unit: "request",
					unit_size: 1,
					price_per_unit: "0.01",
					currency: "USD",
					match: [],
					priority: 100,
				},
			],
		},
		providerModelSlug: null,
		inputModalities: ["text"],
		outputModalities: ["text"],
		capabilityParams: {},
		maxInputTokens: null,
		maxOutputTokens: null,
	};
}

describe("beforeRequest workspace policy enforcement", () => {
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
		adapterForMock.mockReset();
		fetchWorkspacePolicyMock.mockReset();
		applyWorkspacePolicyMock.mockReset();

		guardAuthMock.mockResolvedValue({
			ok: true,
			value: {
				requestId: "req_workspace_policy",
				workspaceId: "ws_123",
				apiKeyId: "key_123",
				apiKeyRef: "kid_123",
				apiKeyKid: "kid_123",
				userId: null,
				internal: false,
			},
		});
		guardJsonMock.mockResolvedValue({
			ok: true,
			value: { model: "openai/gpt-5-nano", input: "hi" },
		});
		guardZodMock.mockReturnValue({
			ok: true,
			value: { model: "openai/gpt-5-nano", input: "hi" },
		});
		guardModelMock.mockReturnValue({
			ok: true,
			value: {
				body: { model: "openai/gpt-5-nano", input: "hi" },
				model: "openai/gpt-5-nano",
				stream: false,
			},
		});
		guardContextMock.mockResolvedValue({
			ok: true,
			value: {
				context: {
					pricing: { openai: provider("openai").pricingCard },
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
					teamSettings: { billingMode: "wallet", routingMode: null },
				},
				providers: [provider("openai"), provider("anthropic")],
				resolvedModel: "openai/gpt-5-nano",
				candidateDiagnostics: {
					totalProviders: 2,
					supportsEndpointCount: 2,
					droppedUnsupportedEndpoint: [],
					droppedMissingAdapter: [],
					candidateCount: 2,
				},
			},
		});
		makeMetaMock.mockReturnValue({
			apiKeyId: "key_123",
			apiKeyRef: "kid_123",
			apiKeyKid: "kid_123",
			requestId: "req_workspace_policy",
			stream: false,
			requestPath: "/v1/responses",
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
		resolveTestingModeMock.mockResolvedValue({
			enabled: false,
			reason: "not_requested",
		});
		isProviderCapabilityEnabledMock.mockReturnValue(true);
		normalizeCapabilityMock.mockImplementation((value: string) => value);
		resolveCapabilityFromEndpointMock.mockReturnValue("text.generate");
		adapterForMock.mockReturnValue({ name: "openai" });
		fetchWorkspacePolicyMock.mockResolvedValue({
			providerAllowlist: ["openai"],
			providerBlocklist: null,
			allowedApiModels: ["openai/gpt-5-nano"],
			enforceAllowed: true,
			activeGuardrailIds: ["guardrail_123"],
		});
	});

	it("rejects models outside the workspace allowed api model set", async () => {
		applyWorkspacePolicyMock.mockReturnValue({
			ok: false,
			reason: "model_not_allowed",
			diagnostics: {
				resolvedModel: "openai/gpt-5-nano",
				allowedApiModels: ["openai/gpt-4.1-mini"],
				providerAllowlist: ["openai"],
				providerBlocklist: [],
				requestProviderOnly: [],
				requestProviderIgnore: [],
				activeGuardrailIds: ["guardrail_123"],
				beforeCount: 2,
				afterCount: 0,
			},
		});

		const req = new Request("https://gateway.local/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "openai/gpt-5-nano", input: "hi" }),
		});

		const result = await beforeRequest(req, "responses", new Timer(), null);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const payload = await result.response.json();
		expect(payload.error).toBe("validation_error");
		expect(payload.details?.[0]?.keyword).toBe(
			"model_not_allowed_by_workspace_policy",
		);
		expect(fetchWorkspacePolicyMock).toHaveBeenCalledWith({
			workspaceId: "ws_123",
			apiKeyId: "key_123",
		});
	});

	it("rejects when workspace and request provider filters remove every provider", async () => {
		applyWorkspacePolicyMock.mockReturnValue({
			ok: false,
			reason: "no_providers",
			diagnostics: {
				resolvedModel: "openai/gpt-5-nano",
				allowedApiModels: ["openai/gpt-5-nano"],
				providerAllowlist: ["openai"],
				providerBlocklist: [],
				requestProviderOnly: [],
				requestProviderIgnore: ["openai"],
				activeGuardrailIds: [],
				beforeCount: 2,
				afterCount: 0,
			},
		});

		const req = new Request("https://gateway.local/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "openai/gpt-5-nano",
				input: "hi",
				provider: { ignore: ["openai"] },
			}),
		});

		const result = await beforeRequest(req, "responses", new Timer(), null);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const payload = await result.response.json();
		expect(payload.error).toBe("validation_error");
		expect(payload.details?.[0]?.keyword).toBe(
			"no_providers_after_workspace_policy_filter",
		);
	});

	it("attaches workspace policy to pipeline context after filtering", async () => {
		applyWorkspacePolicyMock.mockReturnValue({
			ok: true,
			providers: [provider("openai")],
			diagnostics: {
				resolvedModel: "openai/gpt-5-nano",
				allowedApiModels: ["openai/gpt-5-nano"],
				providerAllowlist: ["openai"],
				providerBlocklist: [],
				requestProviderOnly: [],
				requestProviderIgnore: [],
				activeGuardrailIds: ["guardrail_123"],
				beforeCount: 2,
				afterCount: 1,
			},
		});

		const req = new Request("https://gateway.local/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "openai/gpt-5-nano", input: "hi" }),
		});

		const result = await beforeRequest(req, "responses", new Timer(), null);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.ctx.workspacePolicy).toEqual({
			providerAllowlist: ["openai"],
			providerBlocklist: null,
			allowedApiModels: ["openai/gpt-5-nano"],
			enforceAllowed: true,
			activeGuardrailIds: ["guardrail_123"],
		});
		expect(result.ctx.providers.map((entry) => entry.providerId)).toEqual([
			"openai",
		]);
		expect(validateCapabilitiesMock).toHaveBeenCalledWith(
			expect.objectContaining({
				providers: [expect.objectContaining({ providerId: "openai" })],
			}),
		);
	});
});
