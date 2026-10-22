// Purpose: Executor for google-vertex / text-generate.
// Why: Uses Vertex native endpoints with model-family-specific converters.
// How: IR -> provider-specific Vertex payload -> IR, with protocol conversion handled downstream.

import type { IRChatRequest, IRChatResponse, IRContentPart, IRChoice } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, Bill } from "@executors/types";
import { fetchUpstream } from "@executors/_shared/timing/upstream";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { bufferStreamToIR, resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { createSyntheticResponsesStreamFromIR } from "@executors/_shared/text-generate/synthetic-responses-stream";
import { irToAnthropicMessages, anthropicMessagesToIR, anthropicUsageForPricing, anthropicUnsupportedMediaResult, bufferAnthropicStreamToMessage, mapAnthropicStopReason } from "@executors/anthropic/text-generate";
import { ANTHROPIC_CACHE_USAGE_SEMANTICS, createAnthropicToResponsesStreamTransformer, createAnthropicStreamAccounting, createAnthropicPassthroughStreamTransformer } from "@executors/anthropic/text-generate/stream-transformer";
import { inlineClaudeMediaForBase64OnlyPlatform } from "@executors/anthropic/text-generate/inline-media";
import { isClaudeOpus55 } from "@core/claudeModelCapabilities";
import { assertClaudeRequestSupported } from "@core/claudeRequestValidation";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import {
	createGeminiStreamUsageRecorder,
	transformStream as transformGoogleGeminiStream,
} from "@executors/google-ai-studio/text-generate";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { resolveProviderKey } from "@providers/keys";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";
import { normalizeGoogleServiceTier } from "@executors/google/shared/service-tier";
import { applyGoogleOutputTokenFallback, applyOpenAIUsageFallback } from "@executors/google/shared/usage-fallback";
import { getBindings } from "@/runtime/env";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { withNormalizedReasoning } from "@executors/google/text-generate/normalize-reasoning";
import { irPartsToGeminiParts } from "@executors/google/shared/media";
import {
	appendGeminiFunctionResponse,
	geminiFunctionResponsePart,
	geminiFunctionCallId,
	geminiReplayableAssistantParts,
	geminiThoughtPartToIR,
	irToolCallsToGeminiParts,
	withoutEmptyGeminiTextParts,
} from "@executors/google/shared/function-history";
import {
	getLowestGoogleThinkingLevel,
	modelRejectsGoogleThinkingBudget,
	modelSupportsGoogleThinkingLevels,
	resolveGoogleThinkingLevelForEffort,
} from "@executors/google/shared/thinking";
import { sanitizeGeminiSchema } from "@executors/google/shared/schema";
import type { ProviderExecutor } from "../../types";
import { resolveVertexAccessToken } from "@providers/google-vertex/auth";

type VertexModelRoute = {
	family: "anthropic" | "gemini" | "openapi_chat";
	modelForPath: string;
	modelForPayload: string;
};

function vertexError(code: string): Error & { code: string } {
	const error = new Error(code) as Error & { code: string };
	error.code = code;
	return error;
}

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	assertClaudeRequestSupported(ir, args.providerModelSlug ?? ir.model, args.providerId);
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	let irRequest = args.ir as IRChatRequest;
	const model = args.providerModelSlug ?? irRequest.model;
	assertClaudeRequestSupported(irRequest, model, args.providerId);
	const bindings = getBindings() as any;
	const keyInfo = resolveProviderKey(args, () =>
		bindings.GOOGLE_VERTEX_ACCESS_TOKEN || bindings.GOOGLE_VERTEX_API_KEY,
	);
	const route = resolveVertexModelRoute(model);
	const refuse = (error: string): ExecutorResult => ({
		kind: "completed",
		ir: undefined,
		upstream: new Response(JSON.stringify({ error }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		}),
		bill: { cost_cents: 0, currency: "USD" },
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	});
	// A cachedContent name is resolved in the project of the credential that serves the
	// request. With Phaseo's credential that is Phaseo's project, so a customer could reach
	// a cache that is not theirs: refuse, as on Google AI Studio.
	if (route.family === "gemini" && irRequest.googleCachedContent !== undefined && keyInfo.source !== "byok") {
		return refuse("cachedContent requires a customer-managed Vertex AI credential");
	}
	// The customer's own credential runs in the customer's project, not Phaseo's, and a
	// cache is used from the project and location it was created in.
	let scope: VertexResourceScope | undefined;
	if (keyInfo.source === "byok") {
		scope = vertexCredentialScope(keyInfo.key);
		if (route.family === "gemini" && irRequest.googleCachedContent !== undefined) {
			const cache = resolveVertexCachedContentScope(irRequest.googleCachedContent, scope, args.providerId, route);
			if ("error" in cache) return refuse(cache.error);
			scope = cache.scope;
			irRequest = { ...irRequest, googleCachedContent: cache.cachedContent };
		}
	}
	const apiBase = resolveVertexApiBase(bindings, args.providerId, route.family, route.modelForPayload, scope);

	let payload: any;
	let endpoint: string;

	if (route.family === "anthropic") {
		const unsupportedMedia = anthropicUnsupportedMediaResult(irRequest, args.requestId);
		if (unsupportedMedia) return unsupportedMedia;
		// Claude on Vertex AI reads base64 sources only.
		const inlined = await inlineClaudeMediaForBase64OnlyPlatform(irRequest, args);
		if (inlined.ok === false) return inlined.result;
		payload = irToAnthropicMessages(inlined.ir, args.maxOutputTokens, route.modelForPath, { providerId: args.providerId || "google-vertex" });
		delete payload.model;
		payload.anthropic_version = "vertex-2023-10-16";
		payload.stream = true;
		endpoint = `${apiBase}/publishers/anthropic/models/${encodeURIComponent(route.modelForPath)}:streamRawPredict`;
	} else if (route.family === "gemini") {
		const normalizedIr = withNormalizedReasoning(irRequest, args.capabilityParams, route.modelForPath);
		payload = await irToGemini(normalizedIr, route.modelForPath, args.upstreamTiming);
		endpoint = `${apiBase}/publishers/google/models/${encodeURIComponent(route.modelForPath)}:streamGenerateContent?alt=sse`;
	} else {
		payload = irToOpenAIChat(irRequest, route.modelForPayload, args.providerId, args.capabilityParams);
		payload.stream = true;
		payload.stream_options = {
			...(payload.stream_options ?? {}),
			include_usage: true,
		};
		endpoint = `${apiBase}/endpoints/openapi/chat/completions`;
	}

	const requestBody = JSON.stringify(payload);
	const geminiTier = route.family === "gemini" ? normalizeGoogleServiceTier(irRequest.serviceTier) : undefined;
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	const accessToken = await resolveVertexAccessToken(keyInfo.key, args.upstreamTiming);

	const res = await fetchUpstream(args, endpoint, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			...((geminiTier === "flex" || geminiTier === "priority") ? {
				"X-Vertex-AI-LLM-Request-Type": "shared",
				"X-Vertex-AI-LLM-Shared-Request-Type": geminiTier,
			} : {}),
			...upstreamTestHeaders(args.meta),
		},
		body: requestBody,
	});
	const selectedDispatchAtMs = args.upstreamTiming?.timingFor(res)?.dispatchAtMs ?? Date.now();

	const bill: Bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined,
		upstream_id:
			res.headers.get("x-request-id") ??
			res.headers.get("x-cloud-trace-context") ??
			undefined,
		finish_reason: null,
	};

	if (!res.ok) {
		return {
			kind: "completed",
			ir: undefined,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	const contentType = String(res.headers.get("content-type") || "").toLowerCase();
	const isJsonResponse = contentType.includes("application/json") && !contentType.includes("text/event-stream");

	if (res.body && !isJsonResponse) {
		if (irRequest.stream) {
			// Every Claude stream records usage from the upstream frames, so cache writes are
			// billed whichever model it is.
			const accounting = route.family === "anthropic" ? createAnthropicStreamAccounting() : undefined;
			// Gemini streams are billed from the upstream usageMetadata, which keeps image,
			// audio and video input apart from text.
			const geminiUsage = route.family === "gemini" ? createGeminiStreamUsageRecorder(bill) : undefined;
			const stream = (() => {
				if (geminiUsage) {
					return transformGoogleGeminiStream(res.body!, args, undefined, { onUsage: geminiUsage.onUsage });
				}
				if (route.family === "openapi_chat") {
					return resolveStreamForProtocol(
						new Response(res.body!, {
							status: res.status,
							headers: res.headers,
						}),
						args,
						"chat",
					);
				}
				if (accounting && isClaudeOpus55(model) && args.protocol === "anthropic.messages") {
					return res.body!.pipeThrough(createAnthropicPassthroughStreamTransformer(accounting));
				}
				const responsesStream = res.body!.pipeThrough(
					createAnthropicToResponsesStreamTransformer(args.requestId, model, { accounting, providerId: args.providerId }),
				);
				return resolveStreamForProtocol(
					new Response(responsesStream, {
						status: res.status,
						headers: res.headers,
					}),
					args,
					"responses",
					{ canonicalResponsesEvents: true },
				);
			})();
			return {
				kind: "stream",
				allowEmptySuccess: true,
				stream,
				usageFinalizer: async () => {
					if (geminiUsage) return geminiUsage.finalize();
					if (!accounting) return null;
					const final = accounting.snapshot();
					return { ...bill, usage: anthropicUsageForPricing(final.usage),
						finish_reason: mapAnthropicStopReason(final.stopReason) };
				},
				usageFinalizerAuthoritative: accounting !== undefined || geminiUsage !== undefined,
				usageSnapshot: () => {
					if (geminiUsage) return geminiUsage.snapshot();
					return accounting ? anthropicUsageForPricing(accounting.snapshot().usage) ?? null : null;
				},
				bill,
				upstream: res,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
				timing: {
					latencyMs: undefined,
					generationMs: undefined,
				},
			};
		}
		if (route.family === "anthropic" && isClaudeOpus55(model)) {
			const { message, firstFrameMs, totalMs } = await bufferAnthropicStreamToMessage(res, selectedDispatchAtMs);
			const ir = anthropicMessagesToIR(message, args.requestId, model, args.providerId);
			bill.usage = normalizeTextUsageForPricing(message.usage, ANTHROPIC_CACHE_USAGE_SEMANTICS) ?? undefined;
			bill.finish_reason = ir.choices[0]?.finishReason ?? null;
			return { kind: "completed", ir, bill, upstream: res, keySource: keyInfo.source, byokKeyId: keyInfo.byokId,
				mappedRequest, rawResponse: message, timing: { latencyMs: firstFrameMs ?? undefined, generationMs: totalMs } };
		}

		const bufferingStream = (() => {
			if (route.family === "gemini") {
				const bufferingArgs = {
					...args,
					endpoint: "chat.completions",
					protocol: "openai.chat.completions",
				} as ExecutorExecuteArgs;
				return transformGoogleGeminiStream(res.body!, bufferingArgs);
			}
			if (route.family === "openapi_chat") {
				return res.body!;
			}
			return res.body!.pipeThrough(
				createAnthropicToResponsesStreamTransformer(args.requestId, model, { providerId: args.providerId }),
			);
		})();
		const routeForBuffer = route.family === "anthropic" ? "responses" : "chat";
		const transformedResponse = new Response(bufferingStream, {
			status: res.status,
			headers: res.headers,
		});
		const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(
			transformedResponse,
			args,
			routeForBuffer,
			selectedDispatchAtMs,
		);
		if (route.family === "gemini") {
			const fallback = applyGoogleOutputTokenFallback(ir);
			if (fallback.applied) {
				applyOpenAIUsageFallback(
					(rawResponse as any)?.usage,
					ir.usage?.inputTokens ?? 0,
					ir.usage?.outputTokens ?? 0,
					ir.usage?.totalTokens ?? 0,
				);
			}
		}
		const usageMeters = normalizeTextUsageForPricing(ir?.usage ?? usage);
		if (usageMeters) {
			bill.usage = usageMeters;
		}
		bill.finish_reason = ir?.choices?.[0]?.finishReason ?? null;

		return {
			kind: "completed",
			allowEmptySuccess: true,
			ir,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse,
			timing: {
			latencyMs: firstByteMs ?? undefined,
				generationMs: totalMs,
			},
		};
	}

	const json = await res.json();
	let ir: IRChatResponse;
	if (route.family === "anthropic") {
		ir = anthropicMessagesToIR(json, args.requestId, model, args.providerId);
	} else if (route.family === "gemini") {
		ir = geminiToIR(json, args.requestId, model, args.providerId);
		applyGoogleOutputTokenFallback(ir);
	} else {
		ir = openAIChatToIR(json, args.requestId, model, args.providerId);
	}
	return finalizeResult({
		args,
		ir,
		bill,
		res,
		keyInfo,
		mappedRequest,
		rawResponse: json,
		upstreamStartMs: selectedDispatchAtMs,
	});
}

function finalizeResult(input: {
	args: ExecutorExecuteArgs;
	ir: IRChatResponse;
	bill: Bill;
	res: Response;
	keyInfo: { source: "gateway" | "byok"; byokId: string | null };
	mappedRequest?: string;
	rawResponse: any;
	upstreamStartMs: number;
}): ExecutorResult {
	const { args, ir, bill, res, keyInfo, mappedRequest, rawResponse, upstreamStartMs } = input;
	const irRequest = args.ir as IRChatRequest;

	if (irRequest.stream) {
		const responsesStream = createSyntheticResponsesStreamFromIR(ir, args.requestId);
		const normalized = resolveStreamForProtocol(
			new Response(responsesStream, {
				status: res.status,
				headers: res.headers,
			}),
			args,
			"responses",
		);
		return {
			kind: "stream",
			allowEmptySuccess: true,
			stream: normalized,
			usageFinalizer: async () => null,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			timing: {
				latencyMs: undefined,
				generationMs: Date.now() - upstreamStartMs,
			},
		};
	}

	const usageMeters = normalizeTextUsageForPricing(ir.usage);
	if (usageMeters) {
		bill.usage = usageMeters;
	}
	bill.finish_reason = ir.choices?.[0]?.finishReason ?? null;

	return {
		kind: "completed",
		allowEmptySuccess: true,
		ir,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse,
		timing: {
			latencyMs: undefined,
			generationMs: Date.now() - upstreamStartMs,
		},
	};
}

export function postprocess(ir: any): any {
	return ir;
}

export function transformStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	return stream;
}

export function resolveVertexModelRoute(model: string): VertexModelRoute {
	const value = model.trim();
	const lower = value.toLowerCase();

	const publisherFromPrefix = /^([a-z0-9-]+)\/(.+)$/.exec(value);
	if (publisherFromPrefix) {
		const publisher = publisherFromPrefix[1].toLowerCase();
		const modelId = publisherFromPrefix[2];
		if (publisher === "anthropic") {
			return { family: "anthropic", modelForPath: modelId, modelForPayload: value };
		}
		if (publisher === "google") {
			return { family: "gemini", modelForPath: modelId, modelForPayload: value };
		}
		return { family: "openapi_chat", modelForPath: modelId, modelForPayload: value };
	}

	if (lower.includes("claude") || lower.includes("anthropic")) {
		return { family: "anthropic", modelForPath: value, modelForPayload: value };
	}
	if (lower.startsWith("gemini")) {
		return { family: "gemini", modelForPath: value, modelForPayload: value };
	}
	return { family: "openapi_chat", modelForPath: value, modelForPayload: value };
}

/** The only Vertex location some models are served in, whatever location is configured. */
export function vertexRequiredLocation(providerId?: string, family?: VertexModelRoute["family"], model?: string): string | undefined {
	return providerId === "google-vertex-eu" && family === "anthropic" ? "eu"
		// Served only on global and the us/eu multi-regions, no single region
		// (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite).
		: providerId === "google-vertex-eu" && family === "gemini" && /^(?:google\/)?gemini-3\.1-flash-lite$/.test(model ?? "") ? "eu"
		: providerId === "google-vertex" && family === "anthropic" ? "global"
		// Gemini Transcribe is served on global only
		// (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-transcribe).
		: providerId === "google-vertex" && family === "gemini" && /^(?:google\/)?(?:gemini-4-argon|gemini-3\.1-flash-lite|gemini-3\.5-transcribe(?:-preview)?)$/.test(model ?? "") ? "global"
		: providerId === "google-vertex" && family === "openapi_chat" && model?.endsWith("-maas")
			? model === "openai/gpt-oss-20b-maas" ? "us-central1" : "global" : undefined;
}

/**
 * The location Phaseo's own google-vertex credential uses for a model family, in place of
 * GOOGLE_VERTEX_LOCATION. Gemini 3 and later, Gemini Embedding 2 and Gemini Transcribe are
 * served on global and the us/eu multi-regions, not in single US regions such as us-central1
 * (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash), and
 * the google-vertex prices are Google's global prices. A customer credential that names a
 * region keeps it; google-vertex-eu never uses this.
 */
export function vertexDefaultLocation(providerId?: string, family?: VertexModelRoute["family"]): string | undefined {
	return providerId === "google-vertex" && family === "gemini" ? "global" : undefined;
}

/** A Google Cloud project and location taken from the customer's request or credential. */
export type VertexResourceScope = { project?: string; location?: string };

const VERTEX_LOCATION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERTEX_CACHED_CONTENT_NAME = /^projects\/([^/]+)\/locations\/([^/]+)\/cachedContents\/([^/]+)$/;
const VERTEX_SHORT_CACHED_CONTENT_NAME = /^(?:cachedContents\/)?([^/]+)$/;

/**
 * The project and location a customer's Vertex credential names: `project_id` from a
 * service-account JSON (Google always includes it) and the optional `region` (or
 * `location`) field the BYOK form documents. A plain access token names neither.
 */
export function vertexCredentialScope(rawKey: string): VertexResourceScope {
	const value = rawKey.trim();
	if (!value.startsWith("{")) return {};
	try {
		const parsed = JSON.parse(value) as Record<string, unknown>;
		if (!parsed || typeof parsed !== "object") return {};
		const project = typeof parsed.project_id === "string" ? parsed.project_id.trim() : "";
		const rawLocation = typeof parsed.region === "string" ? parsed.region
			: typeof parsed.location === "string" ? parsed.location : "";
		const location = rawLocation.trim().toLowerCase();
		return {
			...(project && !project.includes("/") ? { project } : {}),
			...(VERTEX_LOCATION_PATTERN.test(location) ? { location } : {}),
		};
	} catch {
		return {};
	}
}

/**
 * Where a customer's cachedContent lives. Vertex names a cache
 * `projects/{project}/locations/{location}/cachedContents/{id}`, and a cache is used from
 * the project and location it was created in, so a full name decides the endpoint. A
 * short name (`cachedContents/{id}`) needs the project and region from the credential.
 */
export function resolveVertexCachedContentScope(
	cachedContent: string,
	credential: VertexResourceScope,
	providerId: string | undefined,
	route: VertexModelRoute,
): { scope: VertexResourceScope; cachedContent: string } | { error: string } {
	const name = cachedContent.trim();
	const full = VERTEX_CACHED_CONTENT_NAME.exec(name);
	const shortId = full ? undefined : VERTEX_SHORT_CACHED_CONTENT_NAME.exec(name)?.[1];
	if (!full && !shortId) {
		return { error: "cachedContent must be a Vertex AI cache name: projects/{project}/locations/{location}/cachedContents/{id}" };
	}
	const project = full ? full[1] : credential.project;
	const location = full ? full[2].toLowerCase() : credential.location;
	if (!project || !location) {
		return {
			error: "cachedContent on Vertex AI needs the cache's project and location. Send the full name, projects/{project}/locations/{location}/cachedContents/{id}, or use a service-account credential with project_id and region",
		};
	}
	if (!VERTEX_LOCATION_PATTERN.test(location)) {
		return { error: `cachedContent names an invalid Vertex AI location: ${location}` };
	}
	const required = vertexRequiredLocation(providerId, route.family, route.modelForPayload);
	if (required && required !== location) {
		return { error: `This model is served on Vertex AI only in ${required}, but the cache is in ${location}` };
	}
	if (providerId === "google-vertex-eu" && !required && !/^europe-/.test(location)) {
		return { error: `Google Vertex EU serves only European locations, but the cache is in ${location}` };
	}
	return {
		scope: { project, location },
		cachedContent: full ? name : `projects/${project}/locations/${location}/cachedContents/${shortId}`,
	};
}

export function isGoogleVertexHost(rawBase: string): boolean {
	try {
		const host = new URL(rawBase).hostname;
		// Exact Vertex host shapes only: global, "{location}-aiplatform" and the regional "rep" hosts.
		return /^(?:[a-z0-9-]+-)?aiplatform\.googleapis\.com$/.test(host) || /^aiplatform\.[a-z0-9-]+\.rep\.googleapis\.com$/.test(host);
	} catch {
		return false;
	}
}

/**
 * The Vertex base URL for a request. `scope` replaces the configured project and location
 * when the customer's own credential is used, so the request runs in their project; a
 * model that Google serves in one location only keeps that location.
 */
export function resolveVertexApiBase(bindings: Record<string, any>, providerId?: string, family?: VertexModelRoute["family"], model?: string, scope?: VertexResourceScope): string {
	const configuredBase = String(bindings.GOOGLE_VERTEX_BASE_URL || "").replace(/\/+$/, "");
	const defaultLocation = vertexDefaultLocation(providerId, family);
	// A Google host is regional, so a customer location needs its own host.
	const rawBase = (scope?.location || defaultLocation) && isGoogleVertexHost(configuredBase) ? "" : configuredBase;
	const project = scope?.project || String(bindings.GOOGLE_VERTEX_PROJECT || "").trim();
	const configuredLocation = scope?.location || defaultLocation || String(bindings.GOOGLE_VERTEX_LOCATION || "").trim().toLowerCase();
	const requiredLocation = vertexRequiredLocation(providerId, family, model);
	const location = requiredLocation || configuredLocation || "global";
	const scoped = Boolean(scope?.project || scope?.location);
	if (providerId === "google-vertex-eu" && !requiredLocation && !/^europe-/.test(location)) {
		throw vertexError("google-vertex_eu_location_required");
	}
	if (rawBase && (requiredLocation || providerId === "google-vertex-eu")) {
		const url = new URL(rawBase);
		const expectedHost = location === "global" ? "aiplatform.googleapis.com"
			: location === "eu" ? "aiplatform.eu.rep.googleapis.com" : `${location}-aiplatform.googleapis.com`;
		const pathLocation = url.pathname.match(/\/locations\/([^/]+)/)?.[1];
		if (url.protocol !== "https:" || url.hostname !== expectedHost || (!scoped && pathLocation && pathLocation !== location)) {
			throw vertexError("google-vertex_endpoint_region_mismatch");
		}
	}

	if (rawBase) {
		const fullBase = /^(.*\/v\d+(?:beta\d+)?)\/projects\/[^/]+\/locations\/[^/]+$/i.exec(rawBase);
		if (fullBase && !scoped) {
			return rawBase;
		}
		if (!project) throw vertexError("google-vertex_project_missing");
		const versionedBase = fullBase ? fullBase[1] : /\/v\d+(?:beta\d+)?$/i.test(rawBase) ? rawBase : `${rawBase}/v1`;
		return `${versionedBase}/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
	}

	if (!project) throw vertexError("google-vertex_project_missing");
	const hostname = location === "global" ? "aiplatform.googleapis.com"
		: location === "us" || location === "eu" ? `aiplatform.${location}.rep.googleapis.com`
		: `${encodeURIComponent(location)}-aiplatform.googleapis.com`;
	return `https://${hostname}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
}

export async function irToGemini(ir: IRChatRequest, modelOverride?: string | null, upstreamTiming?: ExecutorExecuteArgs["upstreamTiming"]): Promise<any> {
	const contents: any[] = [];
	const systemInstructionParts: any[] = [];
	const toolNamesById = new Map<string, string>();

	for (const msg of ir.messages) {
		if (msg.role !== "assistant" || !Array.isArray(msg.toolCalls)) continue;
		for (const toolCall of msg.toolCalls) {
			if (!toolCall?.id || !toolCall?.name) continue;
			toolNamesById.set(toolCall.id, toolCall.name);
		}
	}

	for (const msg of ir.messages) {
		if (msg.role === "system" || msg.role === "developer") {
			const parts = await irPartsToGeminiParts(msg.content, { preserveReasoningAsThought: true, upstreamTiming });
			systemInstructionParts.push(...parts);
			continue;
		}
		if (msg.role === "user") {
			contents.push({
				role: "user",
				parts: await irPartsToGeminiParts(msg.content, { preserveReasoningAsThought: true, upstreamTiming }),
			});
			continue;
		}
		if (msg.role === "assistant") {
			const parts = [
				...withoutEmptyGeminiTextParts(await irPartsToGeminiParts(
					geminiReplayableAssistantParts(msg.content, { providerId: "google-vertex", model: modelOverride ?? ir.model }),
					{ preserveReasoningAsThought: true, upstreamTiming },
				)),
				...irToolCallsToGeminiParts(msg.toolCalls, modelOverride ?? ir.model, "google-vertex"),
			];
			if (parts.length > 0) contents.push({ role: "model", parts });
			continue;
		}
		if (msg.role === "tool") {
			for (const toolResult of msg.toolResults) {
				let responsePayload: any = toolResult.content;
				if (typeof toolResult.content === "string") {
					try {
						responsePayload = JSON.parse(toolResult.content);
					} catch {
						responsePayload = { content: toolResult.content };
					}
				}
				appendGeminiFunctionResponse(contents, geminiFunctionResponsePart(
					toolResult.toolCallId,
					toolNamesById.get(toolResult.toolCallId) ?? toolResult.toolCallId,
					responsePayload,
				));
			}
		}
	}

	const request: any = { contents };

	if (ir.googleCachedContent !== undefined) {
		request.cachedContent = ir.googleCachedContent;
	}

	const generationConfig: any = {};
	if (ir.temperature !== undefined) generationConfig.temperature = ir.temperature;
	if (ir.maxTokens !== undefined) generationConfig.maxOutputTokens = ir.maxTokens;
	if (ir.topP !== undefined) generationConfig.topP = ir.topP;
	if (ir.topK !== undefined) generationConfig.topK = ir.topK;
	if (ir.stop) generationConfig.stopSequences = Array.isArray(ir.stop) ? ir.stop : [ir.stop];
	// GenerationConfig.seed (https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1/GenerationConfig).
	if (ir.seed !== undefined) generationConfig.seed = ir.seed;

	const thinkingModelName = modelOverride ?? ir.model ?? "";
	if (ir.reasoning?.enabled === false && modelSupportsGoogleThinkingLevels(thinkingModelName)) {
		// Gemini 3 and later cannot switch thinking off; the least they accept is their
		// lowest level (MINIMAL, or LOW where MINIMAL is a validation error).
		generationConfig.thinkingConfig = {
			includeThoughts: false,
			thinkingLevel: getLowestGoogleThinkingLevel(thinkingModelName),
		};
	} else if (
		ir.reasoning?.enabled ||
		ir.reasoning?.effort ||
		(ir.reasoning?.maxTokens !== undefined) ||
		(ir.reasoning?.includeThoughts !== undefined)
	) {
		const thinkingConfig: any = { includeThoughts: ir.reasoning?.includeThoughts ?? true };
		const modelName = thinkingModelName;
		const supportsThinkingLevel = modelSupportsGoogleThinkingLevels(modelName ?? "");
		if (ir.reasoning?.effort && supportsThinkingLevel) {
			const level = resolveGoogleThinkingLevelForEffort(modelName ?? "", ir.reasoning.effort);
			if (level) thinkingConfig.thinkingLevel = level;
		} else if (ir.reasoning?.maxTokens !== undefined && modelRejectsGoogleThinkingBudget(modelName ?? "")) {
			// Gemini 4 Argon returns 400 for any thinkingBudget; a budget becomes a level,
			// as on Google AI Studio.
			thinkingConfig.thinkingLevel = ir.reasoning.maxTokens > 0 ? "HIGH" : getLowestGoogleThinkingLevel(modelName ?? "");
		} else if (ir.reasoning?.maxTokens !== undefined) {
			thinkingConfig.thinkingBudget = ir.reasoning.maxTokens;
		} else if (ir.reasoning?.enabled) {
			if (supportsThinkingLevel) {
				thinkingConfig.thinkingLevel = "HIGH";
			} else {
				thinkingConfig.thinkingBudget = -1;
			}
		}
		generationConfig.thinkingConfig = thinkingConfig;
	}

	if (ir.responseFormat?.type === "json_object") {
		generationConfig.responseMimeType = "application/json";
	} else if (ir.responseFormat?.type === "json_schema") {
		generationConfig.responseMimeType = "application/json";
		generationConfig.responseSchema = sanitizeGeminiSchema(ir.responseFormat.schema);

		const schemaText = (() => {
			try {
				return JSON.stringify(ir.responseFormat?.schema ?? {});
			} catch {
				return "";
			}
		})();
		if (schemaText) {
			systemInstructionParts.push({
				text:
					`Return only valid JSON that matches this schema exactly: ${schemaText}. ` +
					"Do not include markdown or any extra text.",
			});
		}
	}

	if (Array.isArray(ir.modalities) && ir.modalities.length > 0) {
		const mapped = ir.modalities
			.map((mode) => (typeof mode === "string" ? mode.toUpperCase() : ""))
			.filter((mode) => mode === "TEXT" || mode === "IMAGE");
		if (mapped.length > 0) generationConfig.responseModalities = mapped;
	}

	if (ir.imageConfig) {
		const imageConfig: any = {};
		if (ir.imageConfig.aspectRatio) {
			imageConfig.aspectRatio = ir.imageConfig.aspectRatio;
		}
		if (ir.imageConfig.imageSize) {
			imageConfig.imageSize = ir.imageConfig.imageSize;
		}
		if (typeof ir.imageConfig.includeRaiReason === "boolean") {
			imageConfig.includeRaiReason = ir.imageConfig.includeRaiReason;
		}
		if (
			Array.isArray(ir.imageConfig.referenceImages) &&
			ir.imageConfig.referenceImages.length > 0
		) {
			imageConfig.referenceImages = ir.imageConfig.referenceImages;
		}
		if (Object.keys(imageConfig).length > 0) {
			generationConfig.imageConfig = imageConfig;
		}
	}

	if (Object.keys(generationConfig).length > 0) request.generationConfig = generationConfig;
	if (systemInstructionParts.length > 0) request.systemInstruction = { parts: systemInstructionParts };

	if (ir.tools && ir.tools.length > 0) {
		request.tools = [{
			functionDeclarations: ir.tools.map(tool => ({
				name: tool.name,
				description: tool.description,
				parameters: sanitizeGeminiSchema(tool.parameters),
			})),
		}];
		if (ir.toolChoice === "auto") request.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
		if (ir.toolChoice === "none") request.toolConfig = { functionCallingConfig: { mode: "NONE" } };
		if (ir.toolChoice === "required") request.toolConfig = { functionCallingConfig: { mode: "ANY" } };
		if (typeof ir.toolChoice === "object" && "name" in ir.toolChoice) {
			request.toolConfig = {
				functionCallingConfig: {
					mode: "ANY",
					allowedFunctionNames: [ir.toolChoice.name],
				},
			};
		}
	}

	return request;
}

export function geminiToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRChatResponse {
	const choices: IRChoice[] = [];

	for (const candidate of json.candidates || []) {
		const contentParts: IRContentPart[] = [];
		const toolCalls: any[] = [];
		const callIds = new Map<string, number>();

		if (candidate.content?.parts) {
			for (const part of candidate.content.parts) {
				const inlineData = normalizeGeminiInlineData(part);
				if (part.thought && (part.text || part.thoughtSignature || part.thought_signature)) {
					contentParts.push(geminiThoughtPartToIR(part, model, provider));
				} else if (part.text) {
					contentParts.push({ type: "text", text: part.text });
				} else if (inlineData?.data) {
					contentParts.push({
						type: "image",
						source: "data",
						data: inlineData.data,
						mimeType: inlineData.mime_type,
						thoughtSignature: inlineData.thought_signature,
					});
				} else if (part.functionCall) {
					const signature = part.thoughtSignature ?? part.thought_signature;
					toolCalls.push({
						id: geminiFunctionCallId(part, callIds),
						name: part.functionCall.name,
						arguments: JSON.stringify(part.functionCall.args || {}),
						...(typeof signature === "string" && signature
							? { thoughtSignature: signature, thoughtSignatureModel: model }
							: {}),
					});
				}
			}
		}

		const finishReason = mapGeminiFinishReason(candidate.finishReason);
		choices.push({
			index: candidate.index || 0,
			message: {
				role: "assistant",
				content: contentParts,
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			},
			finishReason: finishReason === "stop" && toolCalls.length > 0 ? "tool_calls" : finishReason,
		});
	}

	const usage = googleUsageMetadataToIRUsage(json.usageMetadata);

	return {
		id: requestId,
		nativeId: json.id,
		created: Math.floor(Date.now() / 1000),
		model,
		provider,
		choices,
		usage,
	};
}

function mapGeminiFinishReason(reason: string | undefined): IRChoice["finishReason"] {
	switch (reason) {
		case "STOP":
			return "stop";
		case "MAX_TOKENS":
			return "length";
		// Filter outcomes documented for the Gemini API and Vertex; each can end a candidate with no content.
		case "SAFETY":
		case "RECITATION":
		case "PROHIBITED_CONTENT":
		case "SPII":
		case "BLOCKLIST":
		case "LANGUAGE":
		case "MODEL_ARMOR":
		case "ESCALATION":
		case "IMAGE_SAFETY":
		case "IMAGE_PROHIBITED_CONTENT":
		case "IMAGE_RECITATION":
			return "content_filter";
		case "MALFORMED_FUNCTION_CALL":
			return "error";
		default:
			return "stop";
	}
}

function normalizeGeminiInlineData(part: any): {
	data?: string;
	mime_type?: string;
	thought_signature?: string;
} | null {
	if (part?.inline_data && typeof part.inline_data === "object") {
		return part.inline_data;
	}
	if (part?.inlineData && typeof part.inlineData === "object") {
		return {
			data: part.inlineData.data,
			mime_type: part.inlineData.mimeType ?? part.inlineData.mime_type,
			thought_signature:
				part.inlineData.thoughtSignature ??
				part.inlineData.thought_signature,
		};
	}
	return null;
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess,
	transformStream,
});
