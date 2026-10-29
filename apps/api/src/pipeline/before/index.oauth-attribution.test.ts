// Purpose: requests made with a delegated OAuth key are attributed to the OAuth app and its user.
// Why: delegated keys authenticate as `kid_…`, so a check on an `oauth_` key reference recorded
//      them as plain API key requests with no client ID, hiding every app's usage.
// How: Run beforeRequest with the same stubbed guards as the other index.*.test.ts files and read
//      what it passes to makeMeta and guardContext.

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

const model = "openai/gpt-4.1-mini";
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
		model,
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

const apiKeyAuth = {
	requestId: "req_1", workspaceId: "ws_user", apiKeyId: "key_1", apiKeyRef: "kid_abc", apiKeyKid: "abc",
	userId: "user_creator", internal: false, authMethod: "api_key", oauthClientId: null,
};
const delegatedKeyAuth = {
	...apiKeyAuth,
	apiKeyId: "key_delegated", apiKeyRef: "kid_delegated", apiKeyKid: "delegated",
	userId: "user_end", authMethod: "oauth", oauthClientId: "client_app", oauthScopes: ["gateway:access"],
};

async function runWith(auth: Record<string, unknown>) {
	guardAuthMock.mockResolvedValue({ ok: true, value: auth });
	const rawBody = { model, input: "hello" };
	guardJsonMock.mockResolvedValue({ ok: true, value: rawBody });
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
	return {
		meta: makeMetaMock.mock.calls.at(-1)?.[0] as Record<string, unknown>,
		context: guardContextMock.mock.calls.at(-1)?.[0] as Record<string, unknown>,
	};
}

describe("beforeRequest OAuth app attribution", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		makeMetaMock.mockImplementation((input: any) => ({ ...input, stream: false, startedAtMs: Date.now() }));
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
					preset: null,
				},
				providers: [provider],
				resolvedModel: model,
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
				privacyZdrOnly: false,
				beforeCount: args.providers.length,
				afterCount: args.providers.length,
			},
		}));
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

	it("attributes a delegated OAuth key's request to its app and the user who authorised it", async () => {
		const { meta, context } = await runWith(delegatedKeyAuth);
		expect(meta).toMatchObject({
			apiKeyId: "key_delegated",
			apiKeyRef: "kid_delegated",
			authMethod: "oauth",
			oauthClientId: "client_app",
			oauthUserId: "user_end",
		});
		// The key ID is the delegated key's own, so it still opts in to key spend-limit checks,
		// in shadow mode and in enforce mode (guardContext gets the request's admission slot).
		expect(context).toMatchObject({ apiKeyId: "key_delegated", shadowSpendLimit: true });
		expect(context.spendLimit).toEqual(expect.any(Object));
	});

	it("records a plain API key request without an OAuth app", async () => {
		const { meta, context } = await runWith(apiKeyAuth);
		expect(meta).toMatchObject({ authMethod: "api_key", oauthClientId: null, oauthUserId: null });
		expect(context).toMatchObject({ apiKeyId: "key_1", shadowSpendLimit: true });
	});

	it("keeps an OAuth access token's client ID out of key spend-limit checks", async () => {
		const { meta, context } = await runWith({
			...apiKeyAuth,
			apiKeyId: "client_app", apiKeyRef: "oauth_client_app", apiKeyKid: "client_app",
			userId: "user_end", authMethod: "oauth", oauthClientId: "client_app",
		});
		expect(meta).toMatchObject({ authMethod: "oauth", oauthClientId: "client_app", oauthUserId: "user_end" });
		expect(context).toMatchObject({ shadowSpendLimit: false, spendLimit: null });
	});
});
