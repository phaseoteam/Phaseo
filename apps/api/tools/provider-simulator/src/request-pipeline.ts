// Purpose: Push one client request through the gateway's real request path for one provider route.
// Why: The upstream request must be the one production would send, not a re-implementation of it.
// How: Mirrors pipeline/before (zod schema, capability validation), surfaces/text-generate (server tools,
//      decode, IR contract, forced upstream streaming) and execute (normalizeIRForProvider, catalogue
//      service tier) before calling the registered executor with fetch captured.

import { schemaFor } from "@core/schemas";
import { validateCapabilities } from "@pipeline/before/capabilityValidation";
import { prepareServerToolsForTextRequest } from "@pipeline/surfaces/server-tools";
import { decodeProtocol } from "@protocols/index";
import { validateTextIRContract } from "@pipeline/text-ir-contract";
import { normalizeIRForProvider } from "@pipeline/execute/normalize";
import { readProviderCatalogTier } from "@core/serviceTiers";
import { resolveProviderExecutor } from "@executors/index";
import { createUpstreamTimingTracker } from "@executors/_shared/timing/upstream";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { IRChatRequest } from "@core/ir";
import type { PriceCard } from "@pipeline/pricing/types";
import { defaultSideResponse, withCapturedFetch, type CapturedRequest, type Responder } from "./fetch-capture";
import { SURFACE_ENDPOINT, SURFACE_PROTOCOL, type ClientScenario } from "./client-requests";
import type { CatalogueRoute } from "./catalogue";
import { detectDialect, synthesiseResponse, wantsStreamingResponse, type ResponseVariant } from "./dialects";

export const WORKSPACE_ID = "ws_sim_0001";

export type RouteUnderTest = {
	providerId: string;
	executorProviderId: string;
	route: CatalogueRoute;
	priceCard: PriceCard | null;
};

export type ValidationOutcome = {
	ok: boolean;
	status?: number;
	errorKeywords?: string[];
	errorDetail?: string;
	requestedParams?: string[];
	unsupportedForProvider?: string[];
	unknownForProvider?: string[];
	providerDropped?: boolean;
};

export type RequestRun = {
	scenarioId: string;
	providerId: string;
	model: string;
	zod: { ok: boolean; issues?: string[] };
	validation: ValidationOutcome;
	irIssues: string[];
	clientBody: any;
	parsedBody: any;
	ir?: IRChatRequest;
	providerCall?: CapturedRequest;
	sideCalls: CapturedRequest[];
	extraProviderCalls: CapturedRequest[];
	executorError?: string;
	result?: ExecutorResult;
};

const BASIC_VARIANT: ResponseVariant = { id: "basic", text: "SIM-UPSTREAM-TEXT-0001", finish: "stop", usage: "basic" };

function isSideCall(call: CapturedRequest): boolean {
	return defaultSideResponse(call) !== null;
}

/** Responds to the provider call with a variant; everything else gets the default media/auth answer. */
export function makeResponder(variant: ResponseVariant, onProviderCall?: (call: CapturedRequest) => ResponseVariant | void): Responder {
	return (call) => {
		const side = defaultSideResponse(call);
		if (side) return side;
		const chosen = (onProviderCall?.(call) as ResponseVariant | undefined) ?? variant;
		const dialect = detectDialect(call.url);
		return synthesiseResponse(dialect, chosen, wantsStreamingResponse(dialect, call.url, call.bodyJson));
	};
}

async function readValidationResponse(response: Response): Promise<Pick<ValidationOutcome, "status" | "errorKeywords" | "errorDetail">> {
	const status = response.status;
	try {
		const json: any = await response.clone().json();
		const details = Array.isArray(json?.details) ? json.details : [];
		return {
			status,
			errorKeywords: details.map((d: any) => `${d.keyword ?? json.reason ?? json.error}:${Array.isArray(d.path) ? d.path.join(".") : ""}`),
			errorDetail: details.map((d: any) => d.message).filter(Boolean).join("; ") || json?.description || json?.error,
		};
	} catch {
		return { status };
	}
}

export function buildCandidate(route: RouteUnderTest): any {
	return {
		accessScope: "public",
		providerId: route.providerId,
		apiModelId: route.route.apiModelId,
		pricingKey: route.providerId,
		providerStatus: "active",
		providerRoutingStatus: "active",
		modelRoutingStatus: "active",
		capabilityStatus: "active",
		adapter: {},
		baseWeight: 1,
		byokMeta: [],
		pricingCard: route.priceCard,
		providerModelSlug: route.route.providerModelSlug,
		capabilityParams: route.route.capabilityParams,
		inputModalities: route.route.inputModalities,
		outputModalities: ["text"],
		maxInputTokens: route.route.contextLength,
		maxOutputTokens: route.route.maxOutputTokens,
	};
}

export async function runRequest(args: {
	scenario: ClientScenario;
	route: RouteUnderTest;
	requestId: string;
	variant?: ResponseVariant;
	onProviderCall?: (call: CapturedRequest) => ResponseVariant | void;
	/** Client streaming mode; production always streams upstream and materialises buffered clients. */
	clientStream?: boolean;
}): Promise<RequestRun> {
	const { scenario, route, requestId } = args;
	const endpoint = SURFACE_ENDPOINT[scenario.surface];
	const protocol = SURFACE_PROTOCOL[scenario.surface];
	const model = route.route.apiModelId;
	const clientBody = JSON.parse(JSON.stringify({ model, ...scenario.body, ...(args.clientStream === undefined ? {} : { stream: args.clientStream }) }));
	const run: RequestRun = {
		scenarioId: scenario.id,
		providerId: route.providerId,
		model,
		zod: { ok: true },
		validation: { ok: true },
		irIssues: [],
		clientBody,
		parsedBody: null,
		sideCalls: [],
		extraProviderCalls: [],
	};

	// pipeline/before/index.ts:388 guardZod(schemaFor(endpoint), rawBody)
	const schema = schemaFor(endpoint as any);
	let body: any = clientBody;
	if (schema) {
		const parsed = schema.safeParse(JSON.parse(JSON.stringify(clientBody)));
		if (!parsed.success) {
			run.zod = { ok: false, issues: parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
			return run;
		}
		body = parsed.data;
	}
	run.parsedBody = JSON.parse(JSON.stringify(body));

	// pipeline/before/index.ts:1273 validateCapabilities with this route as the only candidate.
	const candidate = buildCandidate(route);
	const validation = validateCapabilities({
		endpoint: endpoint as any,
		rawBody: clientBody,
		body,
		requestId,
		workspaceId: WORKSPACE_ID,
		providers: [candidate],
		model,
	});
	if (!validation.ok) {
		run.validation = { ok: false, ...(await readValidationResponse((validation as { response: Response }).response)) };
		return run;
	}
	body = validation.body;
	const diagnostics = validation.paramRoutingDiagnostics;
	const support = diagnostics?.perParamSupport ?? [];
	run.validation = {
		ok: true,
		requestedParams: diagnostics?.requestedParams ?? [],
		unsupportedForProvider: support.filter((entry) => entry.unsupportedProviders.includes(route.providerId)).map((entry) => entry.param),
		unknownForProvider: support.filter((entry) => entry.unknownProviders.includes(route.providerId)).map((entry) => entry.param),
		providerDropped: validation.providers.length === 0,
	};

	// pipeline/surfaces/text-generate.ts:660-691
	const preparedTools = prepareServerToolsForTextRequest(body, protocol);
	if (preparedTools.ok === false) {
		run.validation = { ok: false, status: 400, errorKeywords: ["server_tools"], errorDetail: preparedTools.message };
		return run;
	}
	body = preparedTools.body;
	let ir: IRChatRequest;
	try {
		ir = decodeProtocol(protocol, body);
	} catch (error) {
		run.executorError = `decode_failed: ${error instanceof Error ? error.message : String(error)}`;
		return run;
	}
	ir.rawRequest = clientBody;
	const irForExecution: IRChatRequest = { ...ir, stream: true };
	run.irIssues = validateTextIRContract(ir).map((issue: any) => `${issue.path ?? issue.code ?? ""}: ${issue.message ?? JSON.stringify(issue)}`);
	if (run.irIssues.length) return run;

	// pipeline/execute/index.ts:915-962
	const providerModelSlug = route.route.providerModelSlug?.trim() || null;
	const normalizedIr = normalizeIRForProvider(irForExecution, route.providerId, protocol as any, {
		capabilityParams: route.route.capabilityParams as any,
		providerMaxOutputTokens: route.route.maxOutputTokens,
		modelForReasoning: providerModelSlug || model,
	});
	const catalogTier = readProviderCatalogTier(route.route.capabilityParams as any);
	const executorIr = catalogTier ? { ...normalizedIr, serviceTier: catalogTier.upstream ?? undefined } : normalizedIr;
	run.ir = executorIr;

	const executor = resolveProviderExecutor(route.executorProviderId, "text.generate");
	if (!executor) {
		run.executorError = "no_text_executor";
		return run;
	}
	const tracker = createUpstreamTimingTracker(undefined, { applyHeadersDeadline: false });
	const executorArgs: ExecutorExecuteArgs = {
		ir: executorIr,
		requestId,
		workspaceId: WORKSPACE_ID,
		providerId: route.executorProviderId,
		apiKeyId: "key_sim_0001",
		endpoint: endpoint as any,
		protocol: protocol as any,
		capability: "text.generate",
		providerModelSlug,
		privateEndpoint: null,
		capabilityParams: route.route.capabilityParams as any,
		maxInputTokens: route.route.contextLength,
		maxOutputTokens: route.route.maxOutputTokens,
		byokMeta: [],
		pricingCard: route.priceCard,
		upstreamTiming: tracker.timing,
		hasAlternateCandidates: false,
		meta: {
			returnMeta: false,
			echoUpstreamRequest: false,
			returnUpstreamRequest: false,
			returnUpstreamResponse: false,
			requestedModel: model,
			appId: null,
			sessionId: null,
			requestUserId: null,
			trace: null,
			testId: null,
			authMethod: "api_key",
			oauthClientId: null,
			oauthUserId: null,
			forceGatewayKey: true,
		},
	};
	const captured = await withCapturedFetch(
		makeResponder(args.variant ?? BASIC_VARIANT, args.onProviderCall),
		async () => await executor(executorArgs),
	);
	const providerCalls = captured.calls.filter((call) => !isSideCall(call));
	run.sideCalls = captured.calls.filter(isSideCall);
	run.providerCall = providerCalls[0];
	run.extraProviderCalls = providerCalls.slice(1);
	if (captured.error) {
		const error = captured.error as any;
		run.executorError = `${error?.code ?? error?.name ?? "error"}: ${error?.message ?? String(error)}`.slice(0, 400);
	}
	run.result = captured.result;
	return run;
}
