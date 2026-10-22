// Purpose: ctx.zeroDataRetention, which keeps a request's content out of the I/O log, the
//          response cache, data contribution sampling and Phaseo's own telemetry.
// Why: ZDR comes from the workspace setting, a key guardrail, or the request's own (or its
//      preset's) require_zero_data_retention; each must reach the context.
// How: Run beforeRequest with the same stubbed guards as the other index.*.test.ts files.

import { beforeEach, describe, expect, it, vi } from "vitest";

const guardAuthMock = vi.fn();
const guardJsonMock = vi.fn();
const guardZodMock = vi.fn();
const guardModelMock = vi.fn();
const guardContextMock = vi.fn();
const makeMetaMock = vi.fn();
const validateCapabilitiesMock = vi.fn();
const fetchWorkspacePolicyMock = vi.fn();
const applyWorkspacePolicyMock = vi.fn();

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
	isTestingModeRequested: () => false,
	resolveTestingMode: async () => ({ enabled: false, reason: "not_requested" }),
	resolvePerfGatewayAccess: () => ({ allowed: true, perfEnvironment: false }),
	isPerfGatewayEndpointAllowed: () => true,
}));

vi.mock("@/executors", () => ({
	EXECUTORS_BY_PROVIDER: { openai: {} },
	isProviderCapabilityEnabled: () => true,
	normalizeCapability: (value: string) => value,
}));

vi.mock("@/lib/config/capabilityToEndpoints", () => ({
	resolveCapabilityFromEndpoint: () => "text.generate",
}));

vi.mock("./workspacePolicy", () => ({
	fetchWorkspacePolicy: (...args: any[]) => fetchWorkspacePolicyMock(...args),
	applyWorkspacePolicy: (...args: any[]) => applyWorkspacePolicyMock(...args),
}));

vi.mock("./promptInjection", () => ({
	applyPromptInjectionGuardrails: (args: any) => ({ ok: true, body: args.body, rawBody: args.rawBody, enforcement: null }),
}));

vi.mock("./sensitiveInfo", () => ({
	applySensitiveInfoGuardrails: (args: any) => ({ ok: true, body: args.body, rawBody: args.rawBody, enforcement: args.existingEnforcement ?? null }),
}));

import { beforeRequest } from "./index";
import { Timer } from "../telemetry/timer";

const provider = {
	providerId: "openai",
	providerStatus: "active",
	providerRoutingStatus: "active",
	modelRoutingStatus: "active",
	capabilityStatus: "active",
	adapter: { name: "openai", supports: () => true, execute: async () => new Response("{}") },
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
		rules: [{ pricing_plan: "standard", meter: "requests", unit: "request", unit_size: 1, price_per_unit: "0.01", currency: "USD", match: [], priority: 100 }],
	},
	providerModelSlug: null,
	inputModalities: ["text"],
	outputModalities: ["text"],
	capabilityParams: {},
	maxInputTokens: null,
	maxOutputTokens: null,
};

function useRequest(rawBody: Record<string, unknown>, options: { preset?: unknown; guardrailZdr?: boolean } = {}) {
	guardJsonMock.mockResolvedValue({ ok: true, value: rawBody });
	guardZodMock.mockImplementation((_schema: unknown, body: unknown) => ({ ok: true, value: body }));
	guardModelMock.mockImplementation((body: any) => ({ ok: true, value: { body, model: body.model, stream: false } }));
	guardContextMock.mockResolvedValue({
		ok: true,
		value: {
			context: {
				pricing: { openai: provider.pricingCard },
				key: { ok: true, reason: null, resetAt: null },
				keyLimit: { ok: true, reason: null, resetAt: null },
				credit: { ok: true, reason: null, resetAt: null },
				teamSettings: { billingMode: "wallet" },
				preset: options.preset ?? null,
			},
			providers: [provider],
			resolvedModel: "openai/gpt-4.1-mini",
			candidateDiagnostics: { totalProviders: 1, supportsEndpointCount: 1, droppedUnsupportedEndpoint: [], droppedMissingAdapter: [], candidateCount: 1 },
		},
	});
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
			privacyZdrOnly: options.guardrailZdr === true,
			beforeCount: args.providers.length,
			afterCount: args.providers.length,
		},
	}));
}

async function contextFor(rawBody: Record<string, unknown>, options?: { preset?: unknown; guardrailZdr?: boolean }) {
	useRequest(rawBody, options);
	const result = await beforeRequest(
		new Request("https://gateway.local/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(rawBody),
		}),
		"responses",
		new Timer(),
		null,
	);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error("beforeRequest failed");
	return result.ctx;
}

describe("beforeRequest zero data retention", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		guardAuthMock.mockResolvedValue({
			ok: true,
			value: { requestId: "req_zdr", workspaceId: "team_zdr", apiKeyId: "key_zdr", apiKeyRef: "kid_zdr", apiKeyKid: "kid_zdr", userId: null, internal: false },
		});
		makeMetaMock.mockReturnValue({ apiKeyId: "key_zdr", apiKeyRef: "kid_zdr", apiKeyKid: "kid_zdr", requestId: "req_zdr", stream: false, startedAtMs: Date.now() });
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
		fetchWorkspacePolicyMock.mockResolvedValue({ dynamicRoute: null });
	});

	const model = "openai/gpt-4.1-mini";

	it.each([
		["provider.require_zero_data_retention", { provider: { require_zero_data_retention: true } }],
		["provider.requireZeroDataRetention", { provider: { requireZeroDataRetention: true } }],
		["routing.require_zero_data_retention", { routing: { require_zero_data_retention: true } }],
		["provider.zdr", { provider: { zdr: true } }],
	])("applies when the request asks for it (%s)", async (_name, routing) => {
		const ctx = await contextFor({ model, input: "hello", ...routing });
		expect(ctx.zeroDataRetention).toBe(true);
	});

	it("applies when the request's preset asks for it", async () => {
		const ctx = await contextFor({ model, input: "hello" }, {
			preset: { id: "preset_zdr", name: "@private", slug: "private", description: null, visibility: "team", config: { provider: { requireZeroDataRetention: true } } },
		});
		expect(ctx.body.provider).toMatchObject({ require_zero_data_retention: true });
		expect(ctx.zeroDataRetention).toBe(true);
	});

	it("applies when the workspace or a key guardrail requires it", async () => {
		const ctx = await contextFor({ model, input: "hello" }, { guardrailZdr: true });
		expect(ctx.zeroDataRetention).toBe(true);
	});

	it("does not apply otherwise, nor when the request turns it off", async () => {
		expect((await contextFor({ model, input: "hello" })).zeroDataRetention).toBe(false);
		expect((await contextFor({ model, input: "hello", provider: { require_zero_data_retention: false } })).zeroDataRetention).toBe(false);
	});
});
