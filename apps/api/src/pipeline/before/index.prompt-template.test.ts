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

describe("beforeRequest prompt templates", () => {
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

	const preset = {
		id: "preset_1",
		name: "@support-triage",
		slug: "support-triage",
		description: null,
		visibility: "team" as const,
		config: {
			systemPrompt: "Follow the house style.",
			prompt: {
				messages: [
					{ role: "system", content: "You triage tickets for {{company}}." },
					{ role: "user", content: "Ticket: {{ticket}}" },
				],
				variables: { company: { type: "string", required: true }, ticket: { type: "string", required: true } },
			},
		},
	};

	function presetContext() {
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
					preset,
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
		};
	}

	function request(body: unknown) {
		return new Request("https://gateway.local/v1/chat/completions", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	function useBody(rawBody: unknown) {
		guardJsonMock.mockResolvedValue({ ok: true, value: rawBody });
		guardZodMock.mockImplementation((_schema: unknown, body: unknown) => ({ ok: true, value: body }));
		guardModelMock.mockImplementation((body: any) => ({ ok: true, value: { body, model: body.model, stream: false } }));
		guardContextMock.mockResolvedValue(presetContext());
	}

	it("renders the template before guardrails and capability checks", async () => {
		const rawBody = { prompt: { id: "@support-triage", variables: { company: "Acme", ticket: "Login fails" } } };
		useBody(rawBody);

		const result = await beforeRequest(request(rawBody), "chat.completions", new Timer(), null);

		expect(result.ok).toBe(true);
		// The reference supplies the model and an empty conversation before validation.
		expect(guardZodMock.mock.calls[0]?.[1]).toMatchObject({ model: "@support-triage", messages: [] });
		expect(guardContextMock.mock.calls[0]?.[0].model).toBe("@support-triage");
		const expectedMessages = [
			{ role: "system", content: "Follow the house style.\n\nYou triage tickets for Acme." },
			{ role: "user", content: "Ticket: Login fails" },
		];
		expect(applyPromptInjectionGuardrailsMock.mock.calls[0]?.[0].body.messages).toEqual(expectedMessages);
		expect(applyPromptInjectionGuardrailsMock.mock.calls[0]?.[0].templateVariables.map((target: any) => target.text)).toEqual(["Acme", "Login fails"]);
		expect(applySensitiveInfoGuardrailsMock.mock.calls[0]?.[0].templateVariables).toHaveLength(2);
		expect(validateCapabilitiesMock.mock.calls[0]?.[0].body.messages).toEqual(expectedMessages);
		if (result.ok) {
			expect(result.ctx.body.prompt).toBeUndefined();
			expect(result.ctx.rawBody.prompt.variables).toEqual({ company: "Acme", ticket: "Login fails" });
			expect(result.ctx.promptTemplate).toEqual({
				presetId: "preset_1",
				presetSlug: "support-triage",
				variableNames: ["company", "ticket"],
				messageCount: 2,
			});
		}
	});

	it("returns every variable problem as a 400 before guardrails run", async () => {
		const rawBody = { model: "@support-triage", prompt: { id: "@support-triage", variables: { ticket: 4, extra: "x" } } };
		useBody(rawBody);

		const result = await beforeRequest(request(rawBody), "chat.completions", new Timer(), null);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const payload = await result.response.json();
		expect(payload).toMatchObject({ code: "validation_error", reason: "template_variable_required" });
		expect(payload.details.map((detail: any) => [detail.keyword, detail.path.join(".")])).toEqual([
			["template_variable_required", "prompt.variables.company"],
			["template_variable_type", "prompt.variables.ticket"],
			["template_variable_unknown", "prompt.variables.extra"],
		]);
		expect(applyPromptInjectionGuardrailsMock).not.toHaveBeenCalled();
	});

	it.each([
		[{ model: "openai/gpt-4.1-mini", prompt: { id: "@support-triage" } }, "prompt_model_conflict", ["model"]],
		[{ model: "@support-triage", models: ["openai/gpt-4.1-mini"], prompt: { id: "@support-triage" } }, "prompt_model_fallbacks_unsupported", ["models"]],
		[{ prompt: { id: "@support-triage", version: "2" } }, "prompt_version_unsupported", ["prompt", "version"]],
	])("rejects %j before loading the preset", async (rawBody, reason, path) => {
		useBody(rawBody);

		const result = await beforeRequest(request(rawBody), "chat.completions", new Timer(), null);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		const payload = await result.response.json();
		expect(payload).toMatchObject({ code: "validation_error", reason });
		expect(payload.details[0].path).toEqual(path);
		expect(guardContextMock).not.toHaveBeenCalled();
	});
});
