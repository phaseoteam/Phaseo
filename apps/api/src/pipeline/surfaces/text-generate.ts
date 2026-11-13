// Purpose: Text generation pipeline surface.
// Why: Isolates text.generate request lifecycle from other surfaces.
// How: Decodes protocol -> IR, executes provider, encodes response.

import type { IRChatRequest, IRChatResponse } from "@core/ir";
import { handleError } from "@core/error-handler";
import { detectProtocol, detectTextProtocol } from "@protocols/detect";
import type { UnifiedStreamEvent } from "../after/stream-events";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import { doRequestWithIR } from "../execute";
import { droppedParamsForClient, restoreDroppedParams } from "../execute/unsupportedParams";
import { finalizeRequest, settleNonBillableFailure } from "../after";
import { handleFailureAudit, handleSuccessAudit } from "../after/audit";
import { makeHeaders, createResponse } from "../after/http";
import { auditFailure } from "../audit";
import { createToolTraceRetention } from "./server-tool-trace";
import { finishStreamingProvider, recordLifecycleEvent } from "../lifecycle";
import type { PipelineRunnerArgs } from "./types";
import { createManagedToolLiveResponse, type ManagedToolLiveSink } from "./server-tools.live";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "../error-response";
import {
	buildTextIRContractErrorResponse,
	validateTextIRContract,
} from "../text-ir-contract";
import {
	attachServerToolUsage,
	attachServerToolUsageToRawUsage,
	buildSyntheticServerToolStream,
	buildServerToolContinuation,
	consumeTextProtocolStreamToIR,
	ADVISOR_DEFAULT_INSTRUCTIONS,
	mergeIRUsageTotals,
	prepareServerToolsForTextRequest,
} from "./server-tools";
import { UpstreamStreamError } from "@core/stream-errors";
import { suppressFailedResponseBilling } from "../after/billing-policy";
import { recordProviderRound } from "../after/timing";
import { recordManagedProviderTokensOnce } from "@core/provider-rate-limits";
import {
	buildResponseCacheFingerprint,
	buildResponseCacheKey,
	isResponseCacheEligible,
	resolveResponseCachePolicy,
	type CachedResponseRecord,
} from "@/core/response-cache";
import {
	dispatchBackground,
	ensureRuntimeForBackground,
	getResponseCache,
} from "@/runtime/env";
import { safeJsonStringify, sanitizeErrorMessage, sanitizeJsonValue } from "@/lib/safe-json";
import {
	buildManagedSearchObservabilityFromToolResults,
	mergeSearchObservability,
} from "../after/search-observability";
import {
	buildManagedWebFetchObservabilityFromToolResults,
	mergeWebFetchObservability,
} from "../after/fetch-observability";
import { fetchGatewayContext } from "../before/context";
import { buildProviderCandidatesWithDiagnostics } from "../before/utils";
import type { PipelineContext, ProviderCandidate, ServerToolSubCallCharge } from "../before/types";
import { presentUsageForClient } from "../after/payload";
import { responsesRequestBody } from "../after/responses-stream-normaliser";
import { applyWorkspacePolicy, fetchWorkspacePolicy } from "../before/workspacePolicy";
import { requestDataLimits } from "../requestRouting";
import { decodeNonTextRequest, encodeNonTextResponse } from "./non-text";
import { priceServerToolResult } from "./server-tool-pricing";
import { gptImageSizeForAspectRatio, isGptImageModel } from "./image-tool-size";
import type { IRImageGenerationResponse } from "@core/ir";
import type { ServerToolPricing } from "@core/types";
import { ImagesGenerationSchema } from "@core/schemas";
import { normalizeCapability } from "@/executors";
import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import { resolveSvgAuthor } from "@providers/openai/endpoints/images-svg";
import { passesWalletCreditCheck, walletCanPay } from "../before/guards";
import { chargeCompletedServerToolRounds, priceServerToolRounds, priceServerToolSubCall, recordsServerToolAccounting } from "../after/server-tool-charges";
import { recordProvisionalStreamCharge } from "../after/charge";
import { BYOK_SERVICE_FEE_RATE } from "../pricing/byok-fee";
import {
	buildEmptyResponseDiagnostics,
	emptyResponseMessage,
	hasUsableIRChatResponse,
	type EmptyResponseDiagnostics,
} from "./empty-response";

function createJsonErrorResponse(
	status: number,
	error: string,
	message: string,
	extra?: Record<string, unknown>,
): Response {
	const safeMessage = sanitizeErrorMessage(message);
	const safeExtra = extra ? sanitizeJsonValue(extra) : undefined;
	return new Response(
		safeJsonStringify({
			error,
			message: safeMessage,
			...(safeExtra && typeof safeExtra === "object" ? safeExtra : {}),
		}),
		{
			status,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		},
	);
}

/**
 * tool_choice for the request that continues after a server tool ran. A forced
 * choice ("required" or a named tool) would make the model call a tool again
 * on every round, so it relaxes to "auto". Anything else is kept as the client
 * sent it, so the follow-up's prefix matches the first request and its cache.
 */
export function serverToolFollowUpToolChoice(
	toolChoice: IRChatRequest["toolChoice"],
): IRChatRequest["toolChoice"] {
	if (toolChoice === "required" || (toolChoice && typeof toolChoice === "object")) return "auto";
	return toolChoice;
}

function cloneJsonValue<T>(value: T): T {
	if (value === null || value === undefined) return value;
	return JSON.parse(JSON.stringify(value)) as T;
}

function extractAssistantText(response: IRChatResponse): string {
	const first = Array.isArray(response.choices) ? response.choices[0] : null;
	const parts = Array.isArray(first?.message?.content) ? first.message.content : [];
	return parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("")
		.trim();
}

const UPSTREAM_STREAM_FAILURE_MESSAGE = "The upstream stream failed before successful completion.";

/**
 * A buffered client asked for one complete response, so an upstream stream
 * that failed after output began is a failed request: the client gets a 502
 * and no partial text. Billing follows the streaming path
 * (pipeline/after/stream.ts): partial output of a failed stream is not charged,
 * but its tokens still count against managed provider rate limits.
 */
export async function settleBufferedUpstreamStreamFailure(
	ctx: PipelineContext,
	result: any,
	error: UpstreamStreamError,
	/** Usage of earlier server-tool rounds of the same request, which the failing round's usage does not include. */
	priorUsage?: IRChatResponse["usage"],
): Promise<Response> {
	const usage = priorUsage
		? mergeIRUsageTotals(priorUsage, (error.partial.ir as IRChatResponse | undefined)?.usage) ?? null
		: error.partial.usageRaw ?? result.bill?.usage ?? null;
	const partialResult = {
		...result,
		kind: "completed" as const,
		ir: error.partial.ir,
		stream: null,
		usageFinalizer: null,
		rawResponse: error.partial.rawResponse,
		bill: { ...result.bill, usage: usage ?? undefined },
	};
	await recordManagedProviderTokensOnce({
		ctx,
		providerId: result.provider,
		keySource: result.keySource,
		usage,
		reservation: result.providerRateLimitReservation,
	});
	suppressFailedResponseBilling({ ctx, result: partialResult, usage: usage ?? undefined, reason: "upstream_failure" });
	await handleFailureAudit(
		ctx,
		partialResult,
		502,
		"upstream",
		"upstream_stream_failure",
		UPSTREAM_STREAM_FAILURE_MESSAGE,
		{ upstream_error_message: sanitizeErrorMessage(error.upstreamMessage) },
		{
			generation_id: ctx.requestId,
			status_code: 502,
			error: "upstream_stream_failure",
			description: UPSTREAM_STREAM_FAILURE_MESSAGE,
		},
	);
	return createJsonErrorResponse(502, "upstream_stream_failure", UPSTREAM_STREAM_FAILURE_MESSAGE, {
		error_origin: "upstream",
	});
}

/**
 * Charges the usage a provider reported for a completed answer that had no visible output, as a
 * failed request's completed round is charged. True when there was something to account for (a
 * charge, or a bill held for reconciliation); false when the provider reported no billable usage.
 */
async function chargeEmptyResponseUsage(
	ctx: PipelineContext,
	protocol: ReturnType<typeof detectTextProtocol>,
	result: any,
): Promise<boolean> {
	const usage = (result.ir as IRChatResponse | undefined)?.usage;
	const round = { result: { ...result, bill: { ...result.bill } }, usage };
	try {
		await chargeCompletedServerToolRounds({ ctx, protocol, rounds: [round], usage, toolMeters: undefined });
	} catch (error) {
		console.error("[gateway] empty response charge failed", {
			requestId: ctx.requestId,
			error: error instanceof Error ? error.message : String(error),
		});
		return false;
	}
	if (!recordsServerToolAccounting(ctx.serverToolPartialCharge)) return false;
	// The failure row and telemetry read the priced usage from the result's bill.
	result.bill = round.result.bill;
	return true;
}

/**
 * Records the running total of a streamed server-tool request (completed rounds, tool meters and
 * the model calls its tools made) as a provisional charge, like a plain stream's checkpoints.
 * Each round is priced on its own credential, so a round on the workspace's own provider key adds only its service fee.
 */
async function recordServerToolRoundsCheckpoint(
	ctx: PipelineContext,
	protocol: ReturnType<typeof detectTextProtocol>,
	rounds: Parameters<typeof priceServerToolRounds>[0]["rounds"],
	metrics: Parameters<typeof attachServerToolUsageToRawUsage>[1],
): Promise<void> {
	try {
		const bill = await priceServerToolRounds({
			ctx,
			protocol,
			rounds,
			toolMeters: attachServerToolUsageToRawUsage(undefined, metrics),
		});
		if (!bill || !(bill.totalNanos > 0)) return;
		// The lines a charge kept from this checkpoint is recorded against (pricingLinesForCharge).
		const checkpointMeta = ctx.meta as Record<string, unknown>;
		checkpointMeta.__checkpointPricedNanos = bill.totalNanos;
		checkpointMeta.__checkpointPricingLines = bill.pricing.lines;
		dispatchBackground(recordProvisionalStreamCharge({ ctx, costNanos: bill.totalNanos, endpoint: ctx.endpoint }));
	} catch (error) {
		console.error("[gateway] server tool checkpoint charge failed", {
			requestId: ctx.requestId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

function emptyProviderResponse(
	result: { provider?: string; upstream?: Response },
	diagnostics: EmptyResponseDiagnostics,
): Response {
	return createJsonErrorResponse(
		502,
		"google_empty_response",
		emptyResponseMessage(diagnostics),
		{
			provider: result.provider ?? null,
			upstream_status: result.upstream?.status ?? null,
			empty_response: diagnostics,
		},
	);
}

function extractAssistantImage(response: IRChatResponse): { imageUrl?: string; b64Json?: string; mimeType?: string } | null {
	const first = Array.isArray(response.choices) ? response.choices[0] : null;
	const parts = Array.isArray(first?.message?.content) ? first.message.content : [];
	const image = parts.find((part) => part.type === "image");
	if (!image || image.type !== "image") return null;
	if (image.source === "url") {
		return {
			imageUrl: image.data,
			mimeType: image.mimeType,
		};
	}
	return {
		b64Json: image.data,
		mimeType: image.mimeType,
	};
}

function formatAdvisorConversation(messages: IRChatRequest["messages"]): string {
	return messages
		.map((message) => {
			if (message.role === "tool") {
				return `tool: ${message.toolResults.map((result) => result.content).join("\n")}`;
			}
			const text = Array.isArray(message.content)
				? message.content
					.filter((part) => part.type === "text")
					.map((part) => part.text)
					.join("")
				: "";
			return `${message.role}: ${text}`;
		})
		.filter((entry) => entry.trim().length > 0)
		.join("\n\n");
}

/**
 * Price a server tool's model call on the called model's own route and add it to the
 * request's bill. A call that cannot be priced is treated as failed so its output is not
 * delivered for free.
 */
async function recordSubCallCharge(
	pre: PipelineRunnerArgs["pre"],
	subCtx: PipelineContext,
	result: any,
	kind: ServerToolSubCallCharge["kind"],
	model: string,
): Promise<string | null> {
	try {
		const charge = await priceServerToolSubCall({ ctx: subCtx, result, kind, model });
		(pre.ctx.serverToolSubCallCharges ??= []).push(charge);
		return null;
	} catch (error) {
		console.error("[gateway] server tool sub-call pricing failed", {
			requestId: pre.ctx.requestId,
			kind,
			model,
			error: error instanceof Error ? error.message : String(error),
		});
		return `Pricing is unavailable for ${model}.`;
	}
}

/**
 * A credit snapshot after what this request has already spent on the models its server tools
 * called: not ok once that spend has reached the snapshot's balance. Sub-model calls on the
 * workspace's own provider key cost nothing here, image calls on it their service fee, and a
 * snapshot without a balance is left as it is.
 */
function creditAfterServerToolSpend<T extends { ok?: boolean; balanceNanos?: number | null }>(
	ctx: PipelineContext,
	credit: T | null | undefined,
): T | null | undefined {
	if (!credit?.ok || typeof credit.balanceNanos !== "number" || !Number.isFinite(credit.balanceNanos)) return credit;
	const subCallNanos = (ctx.serverToolSubCallCharges ?? [])
		.reduce((sum, charge) => sum + Math.max(0, Number(charge.totalNanos) || 0), 0);
	const imageNanos = (ctx.meta.serverToolPricing ?? [])
		.reduce((sum, charge) => sum + Math.max(0, Number(charge.total_nanos) || 0) * (charge.key_source === "byok" ? BYOK_SERVICE_FEE_RATE : 1), 0);
	const spentNanos = subCallNanos + imageNanos;
	return spentNanos > 0 && spentNanos >= credit.balanceNanos ? { ...credit, ok: false } : credit;
}

/** The wallet check the main request passed, applied to the model a server tool calls. */
function subCallCreditDenied(
	pre: PipelineRunnerArgs["pre"],
	model: string,
	context: Awaited<ReturnType<typeof fetchGatewayContext>>,
	candidates: unknown[],
): string | null {
	// Spend is measured against the balance the request was admitted on: a later read of the
	// wallet may already include this request's own provisional charges.
	const admitted = pre.ctx.gating?.credit;
	const remaining = { ...context, credit: creditAfterServerToolSpend(pre.ctx, admitted?.ok ? admitted : context.credit) };
	if (passesWalletCreditCheck({ model, context: remaining, providers: candidates as any[], internal: pre.ctx.internal })) return null;
	return `Insufficient credits to call ${model}. Add credits to use paid models in server tools.`;
}

async function executeAdvisorModel(args: {
	pre: PipelineRunnerArgs["pre"];
	timing: any;
	model: string;
	prompt: string;
	maxTokens: number;
	instructions?: string;
	forwardTranscript: boolean;
	reasoning?: Record<string, unknown>;
	temperature?: number;
	messages: IRChatRequest["messages"];
}): Promise<{ ok: true; content: string; usage?: IRChatResponse["usage"] } | { ok: false; message: string }> {
	const apiKeyId = args.pre.ctx.keyId;
	if (!apiKeyId) {
		return { ok: false, message: "Advisor cannot resolve the current API key context." };
	}
	let advisorContext;
	try {
		advisorContext = await fetchGatewayContext({
			workspaceId: args.pre.ctx.workspaceId,
			model: args.model,
			endpoint: "text.generate",
			apiKeyId,
			includeTestingMode: args.pre.ctx.testingMode,
			disableCache: Boolean(args.pre.ctx.meta.debug?.enabled),
		});
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}

	const { candidates } = buildProviderCandidatesWithDiagnostics(advisorContext);
	if (candidates.length === 0) {
		return {
			ok: false,
			message: `No text.generate providers are available for advisor model ${args.model}.`,
		};
	}
	// The key's own gates, as the before stage reads them for a request of its own. A spend-limit
	// admission already decided the key's limits for this request.
	if (advisorContext.key?.ok === false) {
		return { ok: false, message: `The API key cannot call advisor model ${args.model}.` };
	}
	if (advisorContext.keyLimit?.ok === false && !args.pre.ctx.internal && !args.pre.ctx.spendAdmission) {
		return { ok: false, message: `The API key has reached its limit and cannot call advisor model ${args.model}.` };
	}
	const advisorCreditDenied = subCallCreditDenied(args.pre, args.model, advisorContext, candidates);
	if (advisorCreditDenied) return { ok: false, message: advisorCreditDenied };
	// Sub-model calls follow the same workspace policy and data limits as the main model. The
	// request's provider only/ignore lists name the main model's providers and are not carried.
	const { only: _only, ignore: _ignore, ...parentDataLimits } = requestDataLimits(args.pre.ctx.body) ?? {};
	let advisorPolicy: Awaited<ReturnType<typeof imageToolPolicyCandidates>>;
	try {
		advisorPolicy = await imageToolPolicyCandidates(
			args.pre,
			candidates,
			advisorContext.resolvedModel ?? args.model,
			{ model: args.model },
			"Advisor model",
		);
	} catch (error) {
		console.error("[gateway] server tool sub-call policy lookup failed", {
			requestId: args.pre.ctx.requestId,
			error: error instanceof Error ? error.message : String(error),
		});
		return { ok: false, message: `The workspace policy could not be loaded for advisor model ${args.model}.` };
	}
	if ("message" in advisorPolicy) return { ok: false, message: advisorPolicy.message };
	const advisorDataLimits = {
		...parentDataLimits,
		...(advisorPolicy.policy?.privacyZdrOnly ? { require_zero_data_retention: true } : {}),
	};
	const advisorProviderHints = Object.keys(advisorDataLimits).length > 0 ? { provider: advisorDataLimits } : {};

	const advisorInstructions = [
		ADVISOR_DEFAULT_INSTRUCTIONS,
		args.instructions,
	].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join("\n\n");
	const advisorPrompt = args.forwardTranscript
		? [
			"Conversation:",
			formatAdvisorConversation(args.messages) || "(no prior text conversation)",
			"",
			"Advisor request:",
			args.prompt,
		].join("\n")
		: args.prompt;

	const advisorIr: IRChatRequest = {
		model: args.model,
		stream: false,
		maxTokens: args.maxTokens,
		...(typeof args.temperature === "number" ? { temperature: args.temperature } : {}),
		...(args.reasoning ? { reasoning: args.reasoning as any } : {}),
		messages: [
			{
				role: "system",
				content: [{ type: "text", text: advisorInstructions }],
			},
			{
				role: "user",
				content: [{ type: "text", text: advisorPrompt }],
			},
		],
		tools: [],
		toolChoice: "none",
	};
	const advisorCtx: PipelineContext = {
		...args.pre.ctx,
		requestId: `${args.pre.ctx.requestId}:advisor`,
		model: advisorContext.resolvedModel ?? args.model,
		requestedModel: args.model,
		endpoint: "text.generate" as any,
		capability: "text.generate",
		protocol: "openai.chat",
		rawBody: {
			model: args.model,
			messages: [
				{ role: "system", content: advisorInstructions },
				{ role: "user", content: advisorPrompt },
			],
			max_tokens: args.maxTokens,
			...(typeof args.temperature === "number" ? { temperature: args.temperature } : {}),
			...(args.reasoning ? { reasoning: args.reasoning } : {}),
			...advisorProviderHints,
		},
		body: {
			model: args.model,
			messages: [
				{ role: "system", content: advisorInstructions },
				{ role: "user", content: advisorPrompt },
			],
			max_tokens: args.maxTokens,
			...(typeof args.temperature === "number" ? { temperature: args.temperature } : {}),
			...(args.reasoning ? { reasoning: args.reasoning } : {}),
			...advisorProviderHints,
		},
		stream: false,
		providers: advisorPolicy.providers,
		pricing: advisorContext.pricing,
		gating: {
			key: advisorContext.key,
			keyLimit: advisorContext.keyLimit,
			credit: advisorContext.credit,
		},
		preset: advisorContext.preset
			? {
				id: advisorContext.preset.id,
				name: advisorContext.preset.name,
				slug: advisorContext.preset.slug ?? null,
				config: advisorContext.preset.config,
			}
			: null,
		teamEnrichment: advisorContext.teamEnrichment ?? args.pre.ctx.teamEnrichment,
		keyEnrichment: advisorContext.keyEnrichment ?? args.pre.ctx.keyEnrichment,
		teamSettings: advisorContext.teamSettings ?? args.pre.ctx.teamSettings,
		attemptErrors: [],
		providerAttempts: [],
		lifecycle: undefined,
		lifecycleParentSpanId: undefined,
		lifecycleProviderSpanId: undefined,
		searchObservability: null,
		webFetchObservability: null,
		responseCache: null,
		serverToolSubCallCharges: undefined,
	};

	const executed = await doRequestWithIR(advisorCtx, advisorIr, args.timing);
	if (executed instanceof Response) {
		let message = `Advisor request failed with status ${executed.status}.`;
		try {
			const json = await executed.clone().json() as any;
			message = typeof json?.message === "string"
				? json.message
				: typeof json?.error === "string"
					? json.error
					: message;
		} catch {
			// Keep status message.
		}
		return { ok: false, message };
	}
	if (executed.result.kind !== "completed" || !executed.result.ir) {
		return { ok: false, message: "Advisor request returned an unsupported response kind." };
	}
	const advisorResponse = executed.result.ir as IRChatResponse;
	const advisorPricingError = await recordSubCallCharge(args.pre, advisorCtx, executed.result, "advisor", advisorCtx.model);
	if (advisorPricingError) return { ok: false, message: advisorPricingError };
	return {
		ok: true,
		content: extractAssistantText(advisorResponse),
		usage: advisorResponse.usage,
	};
}

type ImageToolArgs = {
	pre: PipelineRunnerArgs["pre"];
	timing: any;
	model: string;
	prompt: string;
	quality?: string;
	size?: string;
	aspectRatio?: string;
	background?: string;
	outputFormat?: string;
	outputCompression?: number;
	moderation?: string;
	complexity?: string;
	frameCount?: number;
	frameDurationMs?: number;
	svgModel?: string;
};

type ImageToolResult =
	| { ok: true; imageUrl?: string; b64Json?: string; mimeType?: string; model: string; usage?: IRChatResponse["usage"]; pricing?: ServerToolPricing }
	| { ok: false; message: string };

/** Image tool settings that fall back to the image model's default when the value is invalid for it. */
const IMAGE_TOOL_DEFAULTABLE_FIELDS = new Set(["moderation", "quality", "background", "size", "aspect_ratio", "output_compression"]);

const IMAGE_TOOL_MIME_TYPES: Record<string, string> = {
	png: "image/png",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
};

/** A copy of the parent context for a model the image tool runs, with its own meta so parent charges stay out of its price. */
function imageToolContext(
	pre: PipelineRunnerArgs["pre"],
	context: Awaited<ReturnType<typeof fetchGatewayContext>>,
	overrides: Pick<PipelineContext, "endpoint" | "capability" | "protocol" | "rawBody" | "body" | "providers"> & { model: string },
): PipelineContext {
	const { model, ...rest } = overrides;
	return {
		...pre.ctx,
		...rest,
		meta: { ...pre.ctx.meta, serverToolPricing: undefined },
		requestId: `${pre.ctx.requestId}:image_generation`,
		model: context.resolvedModel ?? model,
		requestedModel: model,
		stream: false,
		pricing: context.pricing,
		gating: {
			key: context.key,
			keyLimit: context.keyLimit,
			credit: context.credit,
		},
		preset: context.preset
			? {
				id: context.preset.id,
				name: context.preset.name,
				slug: context.preset.slug ?? null,
				config: context.preset.config,
			}
			: null,
		teamEnrichment: context.teamEnrichment ?? pre.ctx.teamEnrichment,
		keyEnrichment: context.keyEnrichment ?? pre.ctx.keyEnrichment,
		teamSettings: context.teamSettings ?? pre.ctx.teamSettings,
		attemptErrors: [],
		providerAttempts: [],
		searchObservability: null,
		lifecycle: undefined,
		lifecycleParentSpanId: undefined,
		lifecycleProviderSpanId: undefined,
		webFetchObservability: null,
		responseCache: null,
	};
}

async function failedImageToolMessage(executed: Response): Promise<string> {
	let message = `Image generation request failed with status ${executed.status}.`;
	try {
		const json = await executed.clone().json() as any;
		message = typeof json?.description === "string"
			? json.description
			: typeof json?.message === "string"
			? json.message
			: typeof json?.error?.message === "string"
				? json.error.message
				: typeof json?.error === "string"
					? json.error
					: message;
	} catch {
		// Keep status message.
	}
	return message;
}

/** Workspace and key model rules, as the before stage applies them to a request of its own. */
async function imageToolPolicyCandidates(
	pre: PipelineRunnerArgs["pre"],
	candidates: ProviderCandidate[],
	model: string,
	body: any,
	label = "Image model",
): Promise<{ ok: true; providers: ProviderCandidate[]; policy: Awaited<ReturnType<typeof fetchWorkspacePolicy>> } | { ok: false; message: string }> {
	const policy = await fetchWorkspacePolicy({ workspaceId: pre.ctx.workspaceId, apiKeyId: pre.ctx.keyId! });
	const result = applyWorkspacePolicy({ providers: candidates, resolvedModel: model, body, workspacePolicy: policy });
	if (!result.ok) {
		return { ok: false, message: `${label} "${model}" is blocked by a workspace policy or guardrail.` };
	}
	return { ok: true, providers: result.providers, policy };
}

async function executeImageGenerationModel(args: ImageToolArgs): Promise<ImageToolResult> {
	const apiKeyId = args.pre.ctx.keyId;
	if (!apiKeyId) {
		return { ok: false, message: "Image generation cannot resolve the current API key context." };
	}
	// Image models with an Images API route (GPT Image, FLUX and others) run there, which takes the
	// full image options. Models that make images in chat replies (Gemini image models) run as chat.
	const imagesCapability = normalizeCapability(resolveCapabilityFromEndpoint("images.generations"));
	let imagesContext: Awaited<ReturnType<typeof fetchGatewayContext>> | null = null;
	try {
		imagesContext = await fetchGatewayContext({
			workspaceId: args.pre.ctx.workspaceId,
			model: args.model,
			endpoint: imagesCapability,
			apiKeyId,
			includeTestingMode: args.pre.ctx.testingMode,
			disableCache: Boolean(args.pre.ctx.meta.debug?.enabled),
		});
	} catch (error) {
		// A model without an Images API route resolves with no candidates; a throw is a real
		// failure, and falling back to chat would change the image's options and pricing.
		return {
			ok: false,
			message: `Could not load the Images API route for ${args.model}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	const imagesCandidates = buildProviderCandidatesWithDiagnostics(imagesContext).candidates;
	if (imagesCandidates.length > 0) {
		return executeImageToolViaImagesApi(args, imagesContext, imagesCandidates, imagesCapability);
	}
	if (args.complexity || args.frameCount != null || args.frameDurationMs != null || args.svgModel || args.outputFormat === "gif" || args.outputFormat === "svg") {
		return { ok: false, message: `Image model ${args.model} has no Images API route, so complexity, GIF and SVG output are not available for it.` };
	}
	return executeImageToolViaChatModel(args, apiKeyId);
}

async function executeImageToolViaImagesApi(
	args: ImageToolArgs,
	context: Awaited<ReturnType<typeof fetchGatewayContext>>,
	candidates: ProviderCandidate[],
	capability: string,
): Promise<ImageToolResult> {
	// A paid image model needs wallet credit even when the calling model is free.
	const creditDenied = subCallCreditDenied(args.pre, args.model, context, candidates);
	if (creditDenied) return { ok: false, message: creditDenied };
	// GPT Image takes a size, not an aspect ratio; other image models keep aspect_ratio.
	const gptImageSize = !args.size && args.aspectRatio && isGptImageModel(args.model)
		? gptImageSizeForAspectRatio(args.aspectRatio)
		: undefined;
	const size = args.size ?? gptImageSize;
	const rawBody: Record<string, unknown> = {
		model: args.model,
		prompt: args.prompt,
		n: 1,
		...(size ? { size } : {}),
		...(args.aspectRatio && !isGptImageModel(args.model) ? { aspect_ratio: args.aspectRatio } : {}),
		...(args.quality ? { quality: args.quality } : {}),
		...(args.background ? { background: args.background } : {}),
		...(args.outputFormat ? { output_format: args.outputFormat } : {}),
		...(typeof args.outputCompression === "number" ? { output_compression: args.outputCompression } : {}),
		...(args.moderation ? { moderation: args.moderation } : {}),
		...(args.complexity ? { complexity: args.complexity } : {}),
		...(typeof args.frameCount === "number" ? { frame_count: args.frameCount } : {}),
		...(typeof args.frameDurationMs === "number" ? { frame_duration_ms: args.frameDurationMs } : {}),
		...(args.svgModel ? { svg: { model: args.svgModel } } : {}),
	};
	// The chat model picks these freely ("standard" moderation, a size the image model lacks).
	// An invalid value falls back to the image model's default instead of failing the image.
	// Format, complexity, frames and the SVG author change what comes back, so they still fail.
	let parsed = ImagesGenerationSchema.safeParse(rawBody);
	while (!parsed.success) {
		const droppable = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))]
			.filter((field) => IMAGE_TOOL_DEFAULTABLE_FIELDS.has(field) && field in rawBody);
		if (droppable.length === 0) {
			return { ok: false, message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; ") };
		}
		for (const field of droppable) delete rawBody[field];
		parsed = ImagesGenerationSchema.safeParse(rawBody);
	}
	const policy = await imageToolPolicyCandidates(args.pre, candidates, context.resolvedModel ?? args.model, rawBody);
	if ("message" in policy) return { ok: false, message: policy.message };
	if (args.outputFormat === "svg" && args.svgModel) {
		// The SVG author runs, and bills, as its own model: it needs a price and the same model rules.
		const author = await resolveSvgAuthor(args.svgModel);
		if (!author) {
			return { ok: false, message: `svg.model "${args.svgModel}" is not an OpenAI text model with Phaseo pricing. Use an OpenAI model id such as openai/gpt-5-nano.` };
		}
		const authorPolicy = applyWorkspacePolicy({
			providers: policy.providers
				.filter((candidate) => candidate.providerId === "openai")
				.map((candidate) => ({ ...candidate, apiModelId: author.model })),
			resolvedModel: author.model,
			body: { ...rawBody, model: author.model },
			workspacePolicy: policy.policy,
		});
		if (!authorPolicy.ok) {
			return { ok: false, message: `SVG author model "${author.model}" is blocked by a workspace policy or guardrail.` };
		}
	}
	const ir = decodeNonTextRequest("images.generations", parsed.data);
	(ir as any).rawRequest = rawBody;
	const imageCtx = imageToolContext(args.pre, context, {
		model: args.model,
		endpoint: "images.generations" as any,
		capability,
		protocol: detectProtocol("images.generations" as any),
		rawBody,
		body: parsed.data,
		providers: policy.providers,
	});
	const executed = await doRequestWithIR(imageCtx, ir as any, args.timing);
	if (executed instanceof Response) {
		return { ok: false, message: await failedImageToolMessage(executed) };
	}
	if (executed.result.kind !== "completed" || !executed.result.ir) {
		return { ok: false, message: "Image generation request returned an unsupported response kind." };
	}
	const imageResponse = executed.result.ir as unknown as IRImageGenerationResponse;
	const first = Array.isArray(imageResponse.data) ? imageResponse.data[0] : undefined;
	if (!first?.b64Json && !first?.url) {
		return { ok: false, message: "Image generation response did not include an image." };
	}
	const model = context.resolvedModel ?? args.model;
	const payload = encodeNonTextResponse("images.generations", imageResponse, imageCtx.requestId);
	const pricing = await priceServerToolResult({
		ctx: imageCtx,
		result: executed.result,
		payloadUsage: payload?.usage,
		body: parsed.data,
		component: "image_generation",
		model,
	});
	const format = imageResponse.outputFormat ?? args.outputFormat ?? "png";
	return {
		ok: true,
		...(first.url ? { imageUrl: first.url } : {}),
		...(first.b64Json ? { b64Json: first.b64Json } : {}),
		mimeType: IMAGE_TOOL_MIME_TYPES[format] ?? "image/png",
		model,
		pricing,
	};
}

async function executeImageToolViaChatModel(args: ImageToolArgs, apiKeyId: string): Promise<ImageToolResult> {
	let imageContext;
	try {
		imageContext = await fetchGatewayContext({
			workspaceId: args.pre.ctx.workspaceId,
			model: args.model,
			endpoint: "text.generate",
			apiKeyId,
			includeTestingMode: args.pre.ctx.testingMode,
			disableCache: Boolean(args.pre.ctx.meta.debug?.enabled),
		});
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		};
	}

	const { candidates } = buildProviderCandidatesWithDiagnostics(imageContext);
	if (candidates.length === 0) {
		return {
			ok: false,
			message: `No Images API or chat providers are available for image generation model ${args.model}.`,
		};
	}
	const imageCreditDenied = subCallCreditDenied(args.pre, args.model, imageContext, candidates);
	if (imageCreditDenied) return { ok: false, message: imageCreditDenied };

	const imageConfig = {
		...(args.aspectRatio ? { aspectRatio: args.aspectRatio } : {}),
		...(args.size ? { imageSize: args.size as any } : {}),
	};
	const providerOptions = {
		...(args.quality ? { quality: args.quality } : {}),
		...(args.background ? { background: args.background } : {}),
		...(args.outputFormat ? { output_format: args.outputFormat } : {}),
		...(typeof args.outputCompression === "number" ? { output_compression: args.outputCompression } : {}),
		...(args.moderation ? { moderation: args.moderation } : {}),
	};
	const rawBody = {
		model: args.model,
		messages: [{ role: "user", content: args.prompt }],
		modalities: ["text", "image"],
		...(args.aspectRatio || args.size
			? {
				image_config: {
					...(args.aspectRatio ? { aspect_ratio: args.aspectRatio } : {}),
					...(args.size ? { image_size: args.size, size: args.size } : {}),
				},
			}
			: {}),
		...(Object.keys(providerOptions).length > 0 ? providerOptions : {}),
	};
	const policy = await imageToolPolicyCandidates(args.pre, candidates, imageContext.resolvedModel ?? args.model, rawBody);
	if ("message" in policy) return { ok: false, message: policy.message };
	const imageIr: IRChatRequest = {
		model: args.model,
		stream: false,
		modalities: ["text", "image"],
		...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: args.prompt }],
			},
		],
		tools: [],
		toolChoice: "none",
		rawRequest: rawBody,
	};
	const imageCtx = imageToolContext(args.pre, imageContext, {
		model: args.model,
		endpoint: "text.generate" as any,
		capability: "text.generate",
		protocol: "openai.chat",
		rawBody,
		body: rawBody,
		providers: policy.providers,
	});

	const executed = await doRequestWithIR(imageCtx, imageIr, args.timing);
	if (executed instanceof Response) {
		return { ok: false, message: await failedImageToolMessage(executed) };
	}
	if (executed.result.kind !== "completed" || !executed.result.ir) {
		return { ok: false, message: "Image generation request returned an unsupported response kind." };
	}
	const imageResponse = executed.result.ir as IRChatResponse;
	const image = extractAssistantImage(imageResponse);
	if (!image) {
		return { ok: false, message: "Image generation response did not include an image." };
	}
	const model = imageContext.resolvedModel ?? args.model;
	const payload = encodeProtocol("openai.chat.completions", imageResponse, imageCtx.requestId);
	const pricing = await priceServerToolResult({
		ctx: imageCtx,
		result: executed.result,
		payloadUsage: payload?.usage,
		body: rawBody,
		component: "image_generation",
		model,
	});
	return {
		ok: true,
		...image,
		model,
		pricing,
	};
}

async function handleCachedTextResponse(args: {
	pre: PipelineRunnerArgs["pre"];
	endpoint: PipelineRunnerArgs["endpoint"];
	timingHeader?: string;
	record: CachedResponseRecord;
}): Promise<Response> {
	const { pre, endpoint, timingHeader, record } = args;
	const ctx = pre.ctx;
	ctx.meta.generation_ms = 0;
	ctx.meta.latency_ms = ctx.meta.before_ms ?? 0;
	// The cached result was generated without these parameters; report them as
	// a live call would (header, meta and audit). Older entries carry none.
	restoreDroppedParams(ctx, record.droppedParams);

	const result = {
		kind: "completed" as const,
		upstream: new Response(null, {
			status: record.statusCode,
			headers: { "Content-Type": "application/json" },
		}),
		provider: record.providerId ?? "response-cache",
		generationTimeMs: 0,
		bill: {
			cost_cents: 0,
			currency: record.currency ?? "USD",
			usage:
				record.usage && typeof record.usage === "object"
					? cloneJsonValue(record.usage)
					: undefined,
			upstream_id: record.nativeResponseId ?? null,
			finish_reason: record.finishReason ?? null,
		},
		mappedRequest: null,
		rawResponse: null,
	} as const;

	let releaseRuntime: () => void = () => {};
	try {
		releaseRuntime = ensureRuntimeForBackground();
	} catch (error) {
		console.error("[gateway] failed to initialize runtime for cached response audit", {
			requestId: ctx.requestId,
			endpoint,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	dispatchBackground(
		(async () => {
			try {
				await handleSuccessAudit(
					ctx,
					result as any,
					false,
					record.usage ?? {},
					0,
					0,
					record.currency ?? "USD",
					record.finishReason ?? null,
					record.statusCode,
					record.nativeResponseId ?? null,
					record.responseBody,
				);
			} finally {
				releaseRuntime();
			}
		})(),
	);

	const responseBody = cloneJsonValue(record.responseBody);
	if (
		(ctx.meta?.debug?.enabled || ctx.meta.returnMeta) &&
		responseBody &&
		typeof responseBody === "object"
	) {
		const responseBodyRecord = responseBody as Record<string, any>;
		const existingMeta =
			responseBodyRecord.meta && typeof responseBodyRecord.meta === "object"
				? responseBodyRecord.meta
				: {};
		const existingRouting =
			existingMeta.routing && typeof existingMeta.routing === "object"
				? existingMeta.routing
				: null;
		const droppedParams = droppedParamsForClient(ctx).map(({ param, reason }) => ({ param, reason }));
		responseBodyRecord.meta = {
			...existingMeta,
			...(existingRouting || droppedParams.length > 0
				? { routing: { ...(existingRouting ?? {}), dropped_params: droppedParams } }
				: {}),
			...(ctx.responseCache ? { response_cache: ctx.responseCache } : {}),
			...(ctx.guardrailEnforcement
				? { guardrail_enforcement: ctx.guardrailEnforcement }
				: {}),
		};
	}

	const headers = makeHeaders(timingHeader);
	headers.set("X-Phaseo-Response-Cache", "hit");
	return createResponse(responseBody, record.statusCode, headers);
}

async function materializeStreamResultToCompleted(args: {
	protocol: ReturnType<typeof detectTextProtocol>;
	requestId: string;
	model: string;
	result: any;
	onEvent?: (event: UnifiedStreamEvent) => void;
}): Promise<any> {
	const stream = args.result.stream ?? args.result.upstream?.body ?? null;
	if (!stream) {
		throw new Error("gateway_stream_materialization_missing_body");
	}
	const materializeStartedAt = performance.now();
	// When the first generated output arrived, for provider TTFT (recordProviderRound).
	let firstOutputAtMs: number | null = null;
	let reasoningStreamed = false;
	// Separate moments output arrived: 1 means the answer came in one read.
	let outputArrivals = 0;
	let lastOutputAtMs: number | null = null;
	const consumed = await consumeTextProtocolStreamToIR({
		protocol: args.protocol,
		stream,
		requestId: args.requestId,
		model: args.model,
		provider: args.result.provider,
		onEvent: (event) => {
			const isOutput =
				(event.type === "delta_text" && event.text.length > 0) || event.type === "delta_tool" || event.type === "delta_content_part";
			if (isOutput) {
				const nowMs = Date.now();
				if (lastOutputAtMs === null || nowMs > lastOutputAtMs) outputArrivals += 1;
				lastOutputAtMs = nowMs;
			}
			if (firstOutputAtMs === null && isOutput) {
				firstOutputAtMs = Date.now();
				reasoningStreamed = event.type === "delta_text" && event.channel === "reasoning_text";
			}
			args.onEvent?.(event);
		},
	});
	const materializedGenerationMs = Math.max(
		0,
		Math.round(performance.now() - materializeStartedAt),
	);
	// Executors that read usage from the upstream stream itself are authoritative for
	// streamed clients (pipeline/after/stream.ts); buffered clients bill from the same usage.
	// The finalizer is read once: its usage also carries the server-tool counters.
	const finalizedUsage = await readAuthoritativeFinalizedUsage(args.result);
	const authoritativeUsage = args.protocol === "anthropic.messages"
		? null
		: billableAuthoritativeUsage(finalizedUsage);
	const baseUsage =
		authoritativeUsage ??
		((args.result.bill?.usage && typeof args.result.bill.usage === "object")
			? args.result.bill.usage
			: (consumed.usageRaw && typeof consumed.usageRaw === "object"
				? consumed.usageRaw
				: args.result.bill?.usage));
	const serverToolMeters = serverToolMetersFrom(finalizedUsage);
	return {
		...args.result,
		kind: "completed" as const,
		ir: consumed.ir,
		stream: null,
		usageFinalizer: null,
		generationTimeMs: Math.max(
			typeof args.result.generationTimeMs === "number" ? args.result.generationTimeMs : 0,
			materializedGenerationMs,
		),
		rawResponse: consumed.rawResponse,
		timing: {
			...(args.result.timing ?? {}),
			firstOutputAtMs,
			reasoningStreamed,
			outputArrivals,
			generationMs: Math.max(
				typeof args.result.timing?.generationMs === "number"
					? args.result.timing.generationMs
					: 0,
				materializedGenerationMs,
			),
		},
		bill: {
			...args.result.bill,
			usage: serverToolMeters && (baseUsage == null || typeof baseUsage === "object")
				? { ...(baseUsage ?? {}), ...serverToolMeters }
				: baseUsage,
		},
	};
}

/** The usage an executor's own stream finalizer reports, when the executor marks it authoritative. */
async function readAuthoritativeFinalizedUsage(result: any): Promise<Record<string, any> | null> {
	if (result?.usageFinalizerAuthoritative !== true || typeof result.usageFinalizer !== "function") return null;
	try {
		const finalized = await result.usageFinalizer();
		const usage = finalized?.usage;
		return usage && typeof usage === "object" ? usage : null;
	} catch {
		return null;
	}
}

/**
 * The after-stage lays the client payload's usage over these meters, so they are only used
 * when their input_tokens means what an OpenAI-shaped payload's does: the whole prompt with
 * cache reads and writes inside it. Anthropic-semantics meters (Claude accounting) and the
 * Messages payload (cache on top of input_tokens) would contradict each other's hints.
 */
function billableAuthoritativeUsage(usage: Record<string, any> | null): Record<string, any> | null {
	if (!usage) return null;
	if (usage.cached_read_tokens_are_subset_of_input === false || usage.cached_write_tokens_are_subset_of_input === false) {
		return null;
	}
	const billable = ["input_tokens", "output_tokens", "cached_read_text_tokens", "cached_write_text_tokens"]
		.some((key) => typeof usage[key] === "number" && usage[key] > 0);
	return billable ? usage : null;
}

const SERVER_TOOL_METER_KEYS = ["native_web_search_requests", "native_web_fetch_requests", "server_tool_use"] as const;

function serverToolMetersFrom(usage: Record<string, any> | null): Record<string, unknown> | null {
	if (!usage) return null;
	const meters: Record<string, unknown> = {};
	for (const key of SERVER_TOOL_METER_KEYS) {
		const value = usage[key];
		if ((typeof value === "number" && Number.isFinite(value) && value >= 0) || (value && typeof value === "object")) meters[key] = value;
	}
	return Object.keys(meters).length ? meters : null;
}

/**
 * Server-tool counters from an executor whose usage finalizer reads the upstream stream
 * itself (Claude on Anthropic, Bedrock and Vertex). The client-protocol stream a buffered
 * request is materialised from carries no such counters, so without this a buffered
 * request's web searches (usage.server_tool_use.web_search_requests) were never billed.
 */
export async function readAuthoritativeServerToolMeters(result: any): Promise<Record<string, unknown> | null> {
	return serverToolMetersFrom(await readAuthoritativeFinalizedUsage(result));
}

export async function runTextGeneratePipeline(args: PipelineRunnerArgs): Promise<Response> {
	if (args.pre.ctx.stream) {
		const protocol = detectTextProtocol(args.endpoint, new URL(args.req.url).pathname);
		const prepared = prepareServerToolsForTextRequest(args.pre.ctx.body, protocol);
		// The inner pipeline reuses this result rather than preparing (and, with
		// server tools, deep-cloning the body) a second time.
		const reuse = { body: args.pre.ctx.body, protocol, prepared };
		if (prepared.ok && prepared.config.enabled && (
			protocol === "openai.responses" || protocol === "openai.chat.completions" || protocol === "anthropic.messages"
		)) {
			return createManagedToolLiveResponse({
				protocol,
				requestId: args.pre.ctx.requestId,
				model: args.pre.ctx.model,
				run: (sink) => runTextGeneratePipelineInner(args, sink, reuse),
				chargedUsage: () => chargedServerToolUsageForClient(args.pre.ctx),
				request: responsesRequestBody(args.pre.ctx),
			});
		}
		return runTextGeneratePipelineInner(args, undefined, reuse);
	}
	return runTextGeneratePipelineInner(args);
}

/**
 * The client usage of completed server-tool rounds a failed request was charged for, with the
 * settled pricing (the failure row records the same charge). Null when nothing was charged.
 */
function chargedServerToolUsageForClient(ctx: PipelineContext): Record<string, unknown> | null {
	const partial = ctx.serverToolPartialCharge;
	if (!partial || !(partial.costNanos > 0)) return null;
	const totalNanos = Math.round(partial.costNanos);
	return presentUsageForClient({
		...partial.usage,
		pricing: {
			currency: partial.currency ?? "USD",
			total_nanos: totalNanos,
			total_cents: Math.trunc(totalNanos / 10_000_000),
			total_usd_str: String(Number((totalNanos / 1_000_000_000).toFixed(9))),
			lines: partial.pricingLines ?? [],
		},
	}, { endpoint: ctx.endpoint, body: ctx.body });
}

type PreparedServerToolsReuse = {
	body: unknown;
	protocol: ReturnType<typeof detectTextProtocol>;
	prepared: ReturnType<typeof prepareServerToolsForTextRequest>;
};

async function runTextGeneratePipelineInner(
	args: PipelineRunnerArgs,
	liveSink?: ManagedToolLiveSink,
	reusePrepared?: PreparedServerToolsReuse,
): Promise<Response> {
	const { pre, req, endpoint, timing } = args;
	// Each attempt (model fallbacks rerun this) bills only the sub-calls it made itself.
	pre.ctx.serverToolSubCallCharges = [];
	pre.ctx.serverToolPartialCharge = null;
	pre.ctx.serverToolRoundsBill = null;
	// Set once a server-tool round has completed: charges that work if the request then fails.
	let settleServerToolRoundsOnError: (() => Promise<void>) | null = null;

	try {
		// Protocol detection
		timing.timer.mark("protocol_detect");
		const requestPath = new URL(req.url).pathname;
		const protocol = detectTextProtocol(endpoint, requestPath);
		(pre.ctx as any).protocol = protocol; // Store for observability
		timing.timer.end("protocol_detect");

		const preparedServerTools =
			reusePrepared && reusePrepared.body === pre.ctx.body && reusePrepared.protocol === protocol
				? reusePrepared.prepared
				: prepareServerToolsForTextRequest(pre.ctx.body, protocol);
		if (preparedServerTools.ok === false) {
			const header = timing.timer.header();
			pre.ctx.timing = timing.timer.snapshot();
			return await handleError({
				stage: "execute",
				res: createJsonErrorResponse(
					400,
					"invalid_request",
					preparedServerTools.message,
				),
				endpoint,
				ctx: pre.ctx,
				timingHeader: header || undefined,
				auditFailure,
				req,
			});
		}
		pre.ctx.body = preparedServerTools.body;

		// Decode protocol -> IR
		timing.timer.mark("ir_decode");
		const ir: IRChatRequest = decodeProtocol(protocol, pre.ctx.body);
		ir.rawRequest = pre.ctx.rawBody;
		timing.timer.end("ir_decode");
		const requestedStream = ir.stream === true;
		// Anthropic documents max_tokens: 0 as a prompt-cache pre-warm: an empty answer is the
		// requested result, and the cache writes it made are billed.
		const cachePreWarm = protocol === "anthropic.messages" && ir.maxTokens === 0;
		const irForExecution: IRChatRequest = {
			...ir,
			// Always use the provider's streaming transport for text generation.
			// Buffered clients are materialized back into their requested JSON shape below.
			stream: true,
		};
		const responseCacheEligibility = isResponseCacheEligible({
			endpoint,
			stream: requestedStream,
			debugEnabled: Boolean(pre.ctx.meta?.debug?.enabled),
			hasTools: Array.isArray(pre.ctx.body?.tools) && pre.ctx.body.tools.length > 0,
			serverToolsEnabled: preparedServerTools.config.enabled,
			neverStoreContent: pre.ctx.neverStoreContent === true,
			zeroDataRetention: pre.ctx.zeroDataRetention === true,
		});
		pre.ctx.responseCache = {
			enabled: false,
			status: "bypass",
			reason: responseCacheEligibility.reason,
			key: null,
			fingerprint: null,
			ttlSeconds: null,
			ttlSource: null,
		};

		const responseCacheStore = getResponseCache();
		if (responseCacheEligibility.eligible && responseCacheStore) {
			const presetResponseCaching = pre.ctx.preset?.config?.responseCaching ?? null;
			const responseCachePolicy = resolveResponseCachePolicy({
				presetTtlSeconds: presetResponseCaching?.ttlSeconds ?? null,
				presetDisabled: presetResponseCaching?.enabled === false,
			});
			if (!responseCachePolicy.enabled || !responseCachePolicy.ttlSeconds) {
				pre.ctx.responseCache = {
					enabled: false,
					status: "bypass",
					reason: "disabled_by_policy",
					key: null,
					fingerprint: null,
					ttlSeconds: null,
					ttlSource: responseCachePolicy.source,
				};
			} else {
				const fingerprint = await buildResponseCacheFingerprint({
					workspaceId: pre.ctx.workspaceId,
					endpoint,
					model: pre.ctx.model,
					body: pre.ctx.body,
					protocol,
					presetId: pre.ctx.preset?.id ?? null,
					presetSlug: pre.ctx.preset?.slug ?? null,
					presetVersionId: pre.ctx.preset?.ref ? pre.ctx.preset.versionId ?? null : null,
					routingMode: pre.ctx.routingMode ?? null,
				});
				const cacheKey = buildResponseCacheKey(
					pre.ctx.workspaceId,
					fingerprint.digest,
				);
				pre.ctx.responseCache = {
					enabled: true,
					status: "miss",
					reason: null,
					key: cacheKey,
					fingerprint: fingerprint.digest,
					ttlSeconds: responseCachePolicy.ttlSeconds,
					ttlSource: responseCachePolicy.source,
				};
				const cacheLookupStartedAt = performance.now();
				const cachedRecord = await responseCacheStore.get<CachedResponseRecord>(cacheKey);
				timing.timer.record(
					"response_cache_lookup",
					performance.now() - cacheLookupStartedAt,
				);
				if (cachedRecord?.responseBody) {
					const ageMs = Math.max(
						0,
						Date.now() - new Date(cachedRecord.createdAt).getTime(),
					);
					pre.ctx.responseCache = {
						enabled: true,
						status: "hit",
						reason: null,
						key: cacheKey,
						fingerprint: fingerprint.digest,
						ttlSeconds: cachedRecord.ttlSeconds,
						ttlSource: responseCachePolicy.source,
						createdAt: cachedRecord.createdAt,
						ageMs,
						providerId: cachedRecord.providerId ?? null,
					};
					timing.timer.record("execute_total", 0);
					const header = timing.timer.header();
					pre.ctx.timing = timing.timer.snapshot();
					pre.ctx.timer = timing.timer;
					return await handleCachedTextResponse({
						pre,
						endpoint,
						timingHeader: header || undefined,
						record: cachedRecord,
					});
				}
			}
		} else if (responseCacheEligibility.eligible && !responseCacheStore) {
			pre.ctx.responseCache = {
				enabled: false,
				status: "bypass",
				reason: "store_not_configured",
				key: null,
				fingerprint: null,
				ttlSeconds: null,
				ttlSource: null,
			};
		}

		// Enforce canonical IR invariants before provider execution.
		const irIssues = validateTextIRContract(ir);
		if (irIssues.length > 0) {
			const header = timing.timer.header();
			pre.ctx.timing = timing.timer.snapshot();
			return await handleError({
				stage: "execute",
				res: buildTextIRContractErrorResponse(irIssues, pre.ctx),
				endpoint,
				ctx: pre.ctx,
				timingHeader: header || undefined,
				auditFailure,
				req,
			});
		}

		// Execute with IR
		timing.timer.mark("execute_start");
		// Protocol detection, IR decode and the response-cache lookup, plus anything untimed between them.
		timing.timer.between("before_to_execute", "before_end", "execute_start");
		let exec = await doRequestWithIR(pre.ctx, irForExecution, timing);
		let finalTurnBuffered = !(exec instanceof Response) && exec.result.kind === "completed";

		if (exec instanceof Response) {
			const header = timing.timer.header();
			pre.ctx.timing = timing.timer.snapshot();
			return await handleError({
				stage: "execute",
				res: exec,
				endpoint,
				ctx: pre.ctx,
				timingHeader: header || undefined,
				auditFailure,
				req,
			});
		}

		const shouldMaterializeInitialStream = !requestedStream || preparedServerTools.config.enabled;
		if (exec.result.kind === "stream" && shouldMaterializeInitialStream) {
			try {
				exec.result = await materializeStreamResultToCompleted({
					protocol,
					requestId: pre.ctx.requestId,
					model: pre.ctx.model,
					result: exec.result,
					onEvent: liveSink?.beginRound(),
				});
				finishStreamingProvider(pre.ctx);
			} catch (error) {
				finishStreamingProvider(pre.ctx, "error");
				const header = timing.timer.header();
				pre.ctx.timing = timing.timer.snapshot();
				const upstreamFailed = error instanceof UpstreamStreamError;
				return await handleError({
					stage: "execute",
					res: upstreamFailed
						? await settleBufferedUpstreamStreamFailure(pre.ctx, exec.result, error)
						: createJsonErrorResponse(
							502,
							"gateway_stream_materialization_error",
							"The upstream stream could not be materialized.",
						),
					endpoint,
					ctx: pre.ctx,
					timingHeader: header || undefined,
					// The upstream failure is audited with its partial result above.
					auditFailure: upstreamFailed ? async () => {} : auditFailure,
					req,
				});
			}
		}
		if (exec.result.kind === "completed") {
			const roundTiming = (exec.result as { timing?: { firstOutputAtMs?: number | null; reasoningStreamed?: boolean; outputArrivals?: number } }).timing;
			recordProviderRound(pre.ctx, {
				firstOutputAtMs: roundTiming?.firstOutputAtMs,
				reasoningStreamed: roundTiming?.reasoningStreamed,
				outputArrivals: roundTiming?.outputArrivals,
				usage: (exec.result.ir as IRChatResponse | undefined)?.usage,
			});
		}
		if (
			exec.result.kind === "completed" &&
			exec.result.allowEmptySuccess !== true &&
			!cachePreWarm &&
			!hasUsableIRChatResponse(exec.result.ir as IRChatResponse | undefined)
		) {
			const emptyResponseDiagnostics = buildEmptyResponseDiagnostics(
				exec.result.ir as IRChatResponse | undefined,
			);
			const message = emptyResponseMessage(emptyResponseDiagnostics);
			// An answer with no visible output is still charged for the usage the provider reported.
			if (!(await chargeEmptyResponseUsage(pre.ctx, protocol, exec.result))) {
				await settleNonBillableFailure(pre.ctx, exec.result);
			}
			await handleFailureAudit(
				pre.ctx,
				exec.result,
				502,
				"gateway",
				"google_empty_response",
				message,
				emptyResponseDiagnostics,
				{
					generation_id: pre.ctx.requestId,
					status_code: 502,
					error: "google_empty_response",
					description: message,
					empty_response: emptyResponseDiagnostics,
				},
			);
			const header = timing.timer.header();
			pre.ctx.timing = timing.timer.snapshot();
			return await handleError({
				stage: "execute",
				res: emptyProviderResponse(exec.result, emptyResponseDiagnostics),
				endpoint,
				ctx: pre.ctx,
				timingHeader: header || undefined,
				auditFailure: async () => {},
				req,
			});
		}
		liveSink?.ready();

		const serverToolTrace: Array<{
			id: string;
			name: string;
			arguments?: string;
			output?: unknown;
			isError?: boolean;
		}> = [];

		if (preparedServerTools.config.enabled && exec.result.kind === "completed" && exec.result.ir) {
			const retainToolOutput = createToolTraceRetention();
			const serverToolExecutionTrace: NonNullable<typeof pre.ctx.serverToolTrace> = [];
			const maxServerToolRounds = 8;
			const maxServerToolCalls = Math.min(100, Math.max(1, irForExecution.maxToolCalls ?? 30));
			let serverToolRounds = 0;
			let serverToolCalls = 0;
			let billableWebSearchRequests: number | undefined;
			let billableWebFetchRequests: number | undefined;
			const serverToolUsage = {
				datetimeRequests: 0,
				webSearchRequests: 0,
				webSearchResults: 0,
				webSearchExtraResults: 0,
				webFetchRequests: 0,
				advisorRequests: 0,
				imageGenerationRequests: 0,
				applyPatchRequests: 0,
				subagentRequests: 0,
				fusionRequests: 0,
				searchModelsRequests: 0,
			};
			let aggregateUsage = (exec.result.ir as IRChatResponse).usage;
			let latestIrResponse = exec.result.ir as IRChatResponse;
			let nextIrRequest = irForExecution;
			let searchObservability = pre.ctx.searchObservability ?? null;
			let webFetchObservability = pre.ctx.webFetchObservability ?? null;
			let activeToolSpan: string | undefined;
			let previousParentSpan: string | undefined;
			// Each completed round as it ran: rounds can use different routes and credentials (a
			// fallback mid-loop), and the aggregate below replaces each result's own usage.
			const roundSnapshot = (result: any) => ({
				result: { ...result, bill: { ...result.bill } },
				usage: (result.ir as IRChatResponse | undefined)?.usage,
			});
			const completedRounds = [roundSnapshot(exec.result)];
			const serverToolUsageMetrics = () => ({
				...serverToolUsage,
				...(billableWebSearchRequests === undefined ? {} : { billableWebSearchRequests }),
				...(billableWebFetchRequests === undefined ? {} : { billableWebFetchRequests }),
			});
			// Completed rounds, the searches and fetches they ran and the model calls their tools
			// made were all paid for upstream; an error after them must not make them free.
			const settleCompletedServerToolRounds = async () => {
				settleServerToolRoundsOnError = null;
				const metrics = serverToolUsageMetrics();
				try {
					await chargeCompletedServerToolRounds({
						ctx: pre.ctx,
						protocol,
						rounds: completedRounds,
						usage: attachServerToolUsage(aggregateUsage, metrics),
						toolMeters: attachServerToolUsageToRawUsage(undefined, metrics),
					});
				} catch (error) {
					console.error("[gateway] server tool partial charge failed", {
						requestId: pre.ctx.requestId,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			};
			settleServerToolRoundsOnError = settleCompletedServerToolRounds;

			while (true) {
				if (liveSink?.signal.aborted) break;
				const roundStartedAt = Date.now();
				const serverToolRound: NonNullable<typeof pre.ctx.serverToolTrace>[number] = {
					round: serverToolRounds + 1, durationMs: 0, calls: [],
				};
				// Past the last follow-up turn no tool may run: with no calls left, the
				// continuation reports server tool calls as over the limit without executing them.
				const roundsExhausted = serverToolRounds >= maxServerToolRounds;
				const continuation = await buildServerToolContinuation(
					latestIrResponse,
					preparedServerTools.config,
					{
						onToolStart: (call) => {
							previousParentSpan = pre.ctx.lifecycleParentSpanId;
							activeToolSpan = recordLifecycleEvent(pre.ctx, { type: "tool.started", tool_call_id: call.id, tool_name: call.name });
							pre.ctx.lifecycleParentSpanId = activeToolSpan;
						},
						onToolEnd: (call, result) => {
							pre.ctx.lifecycleParentSpanId = previousParentSpan;
							recordLifecycleEvent(pre.ctx, { type: "tool.completed", span_id: activeToolSpan, tool_call_id: call.id, tool_name: call.name, outcome: !result || result.isError ? "error" : "success" });
							if (call.name && call.name !== "tool_call") {
								serverToolRound.calls.push({
									id: call.id, name: call.name, spanId: activeToolSpan,
									arguments: call.arguments?.slice(0, 4096),
									...(result ? { output: retainToolOutput(result.content) } : {}),
									...(!result || result.isError ? { isError: true } : {}),
								});
								serverToolRound.durationMs = Math.max(0, Date.now() - roundStartedAt);
								if (serverToolRound.calls.length === 1) serverToolExecutionTrace.push(serverToolRound);
								pre.ctx.serverToolTrace = serverToolExecutionTrace;
							}
						},
						executeAdvisor: async (advisorArgs) =>
							executeAdvisorModel({
								pre,
								timing,
								model: advisorArgs.model,
								prompt: advisorArgs.prompt,
								maxTokens: advisorArgs.maxTokens,
								instructions: advisorArgs.instructions,
								forwardTranscript: advisorArgs.forwardTranscript,
								reasoning: advisorArgs.reasoning,
								temperature: advisorArgs.temperature,
								messages: nextIrRequest.messages,
							}),
						executeImageGeneration: async (imageArgs) =>
							executeImageGenerationModel({
								pre,
								timing,
								model: imageArgs.model,
								prompt: imageArgs.prompt,
								quality: imageArgs.quality,
								size: imageArgs.size,
								aspectRatio: imageArgs.aspectRatio,
								background: imageArgs.background,
								outputFormat: imageArgs.outputFormat,
								outputCompression: imageArgs.outputCompression,
								moderation: imageArgs.moderation,
								complexity: imageArgs.complexity,
								frameCount: imageArgs.frameCount,
								frameDurationMs: imageArgs.frameDurationMs,
								svgModel: imageArgs.svgModel,
							}),
						searchModels: async (searchArgs) => {
							const { fetchCatalogue } = await import("@/routes/v1/control/models.catalogue");
							const models = await fetchCatalogue({ availability: "active" });
							const query = typeof searchArgs.query === "string" ? searchArgs.query.toLowerCase() : "";
							const input = Array.isArray(searchArgs.input_modalities) ? searchArgs.input_modalities.map(String) : [];
							const output = Array.isArray(searchArgs.output_modalities) ? searchArgs.output_modalities.map(String) : [];
							const required = Array.isArray(searchArgs.required_params) ? searchArgs.required_params.map(String) : [];
							const provider = typeof searchArgs.provider === "string" ? searchArgs.provider.toLowerCase() : "";
							const series = typeof searchArgs.series === "string" ? searchArgs.series.toLowerCase() : "";
							const filtered = models.filter((model) => {
								const haystack = `${model.model_id} ${model.name ?? ""} ${model.description ?? ""}`.toLowerCase();
								return (!query || haystack.includes(query)) && (!series || haystack.includes(series)) &&
									input.every((item) => model.input_types.includes(item)) && output.every((item) => model.output_types.includes(item)) &&
									required.every((item) => model.supported_params.includes(item)) &&
									(!provider || model.providers.some((item) => `${item.api_provider_id} ${item.api_provider_name ?? ""}`.toLowerCase().includes(provider)));
							});
							const matched = filtered.slice(0, searchArgs.maxResults);
							return { models: matched.map((model) => ({ id: model.model_id, name: model.name, description: model.description, input_modalities: model.input_types, output_modalities: model.output_types, providers: model.providers.map((item) => item.api_provider_id), supported_params: model.supported_params, pricing: model.pricing })), total_results: filtered.length, showing: matched.length };
						},
						remainingToolCalls: roundsExhausted ? 0 : maxServerToolCalls - serverToolCalls,
						paidToolsAllowed: walletCanPay({
							context: { credit: creditAfterServerToolSpend(pre.ctx, pre.ctx.gating?.credit), teamSettings: pre.ctx.teamSettings },
							internal: pre.ctx.internal,
						}),
						signal: liveSink?.signal,
					},
				);
				if (!continuation) break;
				if ("limitExceeded" in continuation && !roundsExhausted) {
					await settleCompletedServerToolRounds();
					const header = timing.timer.header();
					pre.ctx.timing = timing.timer.snapshot();
					return await handleError({
						stage: "execute",
						res: createJsonErrorResponse(400, "gateway_server_tool_limit", "Server tool execution exceeded max_tool_calls.", { max_tool_calls: maxServerToolCalls }),
						endpoint, ctx: pre.ctx, timingHeader: header || undefined, auditFailure, req,
					});
				}
				serverToolCalls += continuation.serverToolCallCount ?? continuation.toolResults.length;
				if ("limitExceeded" in continuation) {
					await settleCompletedServerToolRounds();
					const header = timing.timer.header();
					pre.ctx.timing = timing.timer.snapshot();
					return await handleError({
						stage: "execute",
						res: createJsonErrorResponse(
							502,
							"gateway_server_tool_error",
							"Server tool execution exceeded the maximum follow-up turns.",
							{ max_turns: maxServerToolRounds },
						),
						endpoint,
						ctx: pre.ctx,
						timingHeader: header || undefined,
						auditFailure,
						req,
					});
				}
				serverToolRounds += 1;
				serverToolRound.durationMs = Math.max(0, Date.now() - roundStartedAt);
				serverToolUsage.datetimeRequests += continuation.usage.datetimeRequests ?? 0;
				const webSearchRequestsBefore = serverToolUsage.webSearchRequests;
				serverToolUsage.webSearchRequests += continuation.usage.webSearchRequests ?? 0;
				if (typeof continuation.usage.billableWebSearchRequests === "number") {
					billableWebSearchRequests =
						(billableWebSearchRequests ?? webSearchRequestsBefore) + continuation.usage.billableWebSearchRequests;
				} else if (billableWebSearchRequests !== undefined) {
					billableWebSearchRequests += continuation.usage.webSearchRequests ?? 0;
				}
				serverToolUsage.webSearchResults += continuation.usage.webSearchResults ?? 0;
				serverToolUsage.webSearchExtraResults += continuation.usage.webSearchExtraResults ?? 0;
				const webFetchRequestsBefore = serverToolUsage.webFetchRequests;
				serverToolUsage.webFetchRequests += continuation.usage.webFetchRequests ?? 0;
				if (typeof continuation.usage.billableWebFetchRequests === "number") {
					billableWebFetchRequests =
						(billableWebFetchRequests ?? webFetchRequestsBefore) + continuation.usage.billableWebFetchRequests;
				} else if (billableWebFetchRequests !== undefined) {
					billableWebFetchRequests += continuation.usage.webFetchRequests ?? 0;
				}
				serverToolUsage.advisorRequests += continuation.usage.advisorRequests ?? 0;
				serverToolUsage.imageGenerationRequests += continuation.usage.imageGenerationRequests ?? 0;
				serverToolUsage.applyPatchRequests += continuation.usage.applyPatchRequests ?? 0;
				serverToolUsage.subagentRequests += continuation.usage.subagentRequests ?? 0;
				serverToolUsage.fusionRequests += continuation.usage.fusionRequests ?? 0;
				serverToolUsage.searchModelsRequests += continuation.usage.searchModelsRequests ?? 0;
				const toolCallsById = new Map(
					(continuation.assistantMessage.toolCalls ?? [])
						.filter((call) => call.name && call.name !== "tool_call")
						.map((call) => [call.id, call]),
				);
				for (const result of continuation.toolResults) {
					const call = toolCallsById.get(result.toolCallId);
					if (!call) continue;
					const tracedCall = {
						id: call.id,
						name: call.name,
						arguments: call.arguments,
						output: result.clientOutput ?? result.content,
						...(result.isError ? { isError: true } : {}),
					};
					serverToolTrace.push(tracedCall);
					liveSink?.toolResult(serverToolTrace[serverToolTrace.length - 1]);
				}
				// Advisor, subagent and fusion calls are billed on their own models' routes
				// (pre.ctx.serverToolSubCallCharges), not as the main model's tokens.
				// Tool images are priced on their own model's card, not this request's; the after
				// stage adds these charges to the total (calculatePricing, meta.serverToolPricing).
				if (continuation.imageGenerationPricing?.length) {
					pre.ctx.meta.serverToolPricing = [
						...(pre.ctx.meta.serverToolPricing ?? []),
						...continuation.imageGenerationPricing,
					];
				}
				searchObservability = mergeSearchObservability(
					searchObservability,
					buildManagedSearchObservabilityFromToolResults(continuation.toolResults),
				);
				webFetchObservability = mergeWebFetchObservability(
					webFetchObservability,
					buildManagedWebFetchObservabilityFromToolResults(continuation.toolResults),
				);
				pre.ctx.searchObservability = searchObservability;
				pre.ctx.webFetchObservability = webFetchObservability;
				// A tool may finish after the client disconnects. Settle its usage
				// above, then stop before starting another model request.
				if (liveSink?.signal.aborted) break;
				// A streamed request is charged for its completed rounds and tool work before the
				// next round starts; the final settlement then charges or refunds the difference.
				if (liveSink) await recordServerToolRoundsCheckpoint(pre.ctx, protocol, completedRounds, serverToolUsageMetrics());

				nextIrRequest = {
					...nextIrRequest,
					stream: true,
					toolChoice: serverToolFollowUpToolChoice(nextIrRequest.toolChoice),
					...(latestIrResponse.provider === "google-ai-studio" &&
						latestIrResponse.nativeId &&
						latestIrResponse.nativeId !== pre.ctx.requestId &&
						nextIrRequest.store !== false
						? {
							vendor: {
								...(nextIrRequest.vendor ?? {}),
								google: {
									...((nextIrRequest.vendor as any)?.google ?? {}),
									previous_interaction_id: latestIrResponse.nativeId,
								},
							},
						}
						: {}),
					messages: [
						...nextIrRequest.messages,
						continuation.assistantMessage,
						{
							role: "tool",
							toolResults: continuation.toolResults,
						},
					],
				};
				// Advisor and image tools share this meta and make their own provider calls;
				// the follow-up's failover is measured from its own first dispatch only.
				delete (pre.ctx.meta as Record<string, unknown>).upstreamFetchStartMs;
				const followUpExec = await doRequestWithIR(pre.ctx, nextIrRequest, timing);
				if (followUpExec instanceof Response) {
					await settleCompletedServerToolRounds();
					const header = timing.timer.header();
					pre.ctx.timing = timing.timer.snapshot();
					return await handleError({
						stage: "execute",
						res: followUpExec,
						endpoint,
						ctx: pre.ctx,
						timingHeader: header || undefined,
						auditFailure,
						req,
					});
				}
				let followUpResult = followUpExec.result;
				finalTurnBuffered = followUpResult.kind === "completed";
				if (followUpResult.kind === "stream") {
					try {
						followUpResult = await materializeStreamResultToCompleted({
							protocol,
							requestId: pre.ctx.requestId,
							model: pre.ctx.model,
							result: followUpResult,
							onEvent: liveSink?.beginRound(),
						});
						finishStreamingProvider(pre.ctx);
					} catch (error) {
						finishStreamingProvider(pre.ctx, "error");
						// The failing round's partial output stays free; the rounds before it are charged.
						await settleCompletedServerToolRounds();
						const header = timing.timer.header();
						pre.ctx.timing = timing.timer.snapshot();
						const upstreamFailed = error instanceof UpstreamStreamError;
						return await handleError({
							stage: "execute",
							res: upstreamFailed
								? await settleBufferedUpstreamStreamFailure(pre.ctx, followUpResult, error, aggregateUsage)
								: createJsonErrorResponse(
									502,
									"gateway_stream_materialization_error",
									"The upstream stream could not be materialized.",
								),
							endpoint,
							ctx: pre.ctx,
							timingHeader: header || undefined,
							auditFailure: upstreamFailed ? async () => {} : auditFailure,
							req,
						});
					}
				}
				if (followUpResult.kind === "completed") {
					const roundTiming = (followUpResult as { timing?: { firstOutputAtMs?: number | null; reasoningStreamed?: boolean; outputArrivals?: number } }).timing;
					recordProviderRound(pre.ctx, {
						firstOutputAtMs: roundTiming?.firstOutputAtMs,
						reasoningStreamed: roundTiming?.reasoningStreamed,
						outputArrivals: roundTiming?.outputArrivals,
						usage: (followUpResult.ir as IRChatResponse | undefined)?.usage,
					});
				}
				if (
					followUpResult.kind === "completed" &&
					followUpResult.allowEmptySuccess !== true &&
					!cachePreWarm &&
					!hasUsableIRChatResponse(followUpResult.ir as IRChatResponse | undefined)
				) {
					const emptyResponseDiagnostics = buildEmptyResponseDiagnostics(
						followUpResult.ir as IRChatResponse | undefined,
					);
					const message = emptyResponseMessage(emptyResponseDiagnostics);
					// The empty round is settled with the rounds before it: its reported usage is
					// charged, and a round with no billable usage is waived by the round bill.
					completedRounds.push(roundSnapshot(followUpResult));
					aggregateUsage = mergeIRUsageTotals(aggregateUsage, (followUpResult.ir as IRChatResponse | undefined)?.usage);
					await settleNonBillableFailure(pre.ctx, followUpResult);
					await settleCompletedServerToolRounds();
					await handleFailureAudit(
						pre.ctx,
						followUpResult,
						502,
						"gateway",
						"google_empty_response",
						message,
						emptyResponseDiagnostics,
						{
							generation_id: pre.ctx.requestId,
							status_code: 502,
							error: "google_empty_response",
							description: message,
							empty_response: emptyResponseDiagnostics,
						},
					);
					const header = timing.timer.header();
					pre.ctx.timing = timing.timer.snapshot();
					return await handleError({
						stage: "execute",
						res: emptyProviderResponse(followUpResult, emptyResponseDiagnostics),
						endpoint,
						ctx: pre.ctx,
						timingHeader: header || undefined,
						auditFailure: async () => {},
						req,
					});
				}
				if (followUpResult.kind !== "completed" || !followUpResult.ir) {
					await settleCompletedServerToolRounds();
					const header = timing.timer.header();
					pre.ctx.timing = timing.timer.snapshot();
					return await handleError({
						stage: "execute",
						res: createJsonErrorResponse(
							502,
							"gateway_server_tool_error",
							"Server tool follow-up request returned an unsupported response kind.",
						),
						endpoint,
						ctx: pre.ctx,
						timingHeader: header || undefined,
						auditFailure,
						req,
					});
				}

				completedRounds.push(roundSnapshot(followUpResult));
				exec.result = followUpResult;
				latestIrResponse = followUpResult.ir as IRChatResponse;
				aggregateUsage = mergeIRUsageTotals(aggregateUsage, latestIrResponse.usage);
				latestIrResponse = {
					...latestIrResponse,
					usage: aggregateUsage,
				};
				exec.result.ir = latestIrResponse;
			}

			pre.ctx.searchObservability = searchObservability;
			pre.ctx.webFetchObservability = webFetchObservability;
			settleServerToolRoundsOnError = null;

			if (
				serverToolUsage.datetimeRequests > 0 ||
				serverToolUsage.webSearchRequests > 0 ||
				serverToolUsage.webSearchResults > 0 ||
				serverToolUsage.webSearchExtraResults > 0 ||
				serverToolUsage.webFetchRequests > 0 ||
				serverToolUsage.advisorRequests > 0 ||
				serverToolUsage.imageGenerationRequests > 0 ||
				serverToolUsage.applyPatchRequests > 0 ||
				serverToolUsage.subagentRequests > 0 ||
				serverToolUsage.fusionRequests > 0 ||
				serverToolUsage.searchModelsRequests > 0
			) {
				const usageMetrics = serverToolUsageMetrics();
				const mergedUsage = attachServerToolUsage(aggregateUsage, usageMetrics);
				if (exec.result.ir) {
					(exec.result.ir as IRChatResponse).usage = mergedUsage;
				}
				exec.result.bill.usage = attachServerToolUsageToRawUsage(
					(exec.result.bill.usage as Record<string, any> | undefined) ?? undefined,
					usageMetrics,
				);
				if (exec.result.rawResponse && typeof exec.result.rawResponse === "object") {
					const rawResponse = { ...(exec.result.rawResponse as Record<string, any>) };
					rawResponse.usage = attachServerToolUsageToRawUsage(
						rawResponse.usage as Record<string, any> | undefined,
						usageMetrics,
					);
					exec.result.rawResponse = rawResponse;
				}
			}
			// Rounds can run on different routes and credentials (a fallback mid-loop): each is
			// billed on its own, and the finalizer charges that bill once, never the aggregate on
			// the final round's card. A single round keeps the ordinary pricing of its own usage.
			if (completedRounds.length > 1) {
				pre.ctx.serverToolRoundsBill = await priceServerToolRounds({
					ctx: pre.ctx,
					protocol,
					rounds: completedRounds,
					toolMeters: attachServerToolUsageToRawUsage(undefined, serverToolUsageMetrics()),
				});
			}
		}

		// Encode IR -> protocol response
		timing.timer.mark("ir_encode");
		let protocolResponse;
		if (exec.result.kind === "completed" && exec.result.ir) {
			protocolResponse = encodeProtocol(protocol, exec.result.ir as any, pre.ctx.requestId);
		} else {
			protocolResponse = null;
		}
		timing.timer.end("ir_encode");

		if (protocolResponse) {
			exec.result.normalized = protocolResponse;
			recordLifecycleEvent(pre.ctx, { type: "response.ready" });
		}

		timing.timer.end("execute_total", "execute_start");

		if (
			preparedServerTools.config.enabled &&
			requestedStream &&
			exec.result.kind === "completed" &&
			protocolResponse
		) {
			if (finalTurnBuffered) liveSink?.markFinalTurnBuffered();
			// The same clocks as every other response: end to end from Worker receipt,
			// provider time from recordProviderRound (all rounds, from each dispatch).
			const endToEndMs =
				typeof pre.ctx.meta.startedAtMs === "number"
					? Math.max(0, Math.round(Date.now() - pre.ctx.meta.startedAtMs))
					: Math.max(0, Math.round(timing.timer.elapsed("execute_start")));
			const resultTiming = (exec.result as { timing?: { generationMs?: number } }).timing;
			const generationMs = typeof pre.ctx.meta.providerRoundsMs === "number"
				? pre.ctx.meta.providerRoundsMs
				: Math.max(
					0,
					Math.round(
						typeof resultTiming?.generationMs === "number"
							? resultTiming.generationMs
							: typeof exec.result.generationTimeMs === "number"
								? exec.result.generationTimeMs
								: 0,
					),
				);
			pre.ctx.meta.end_to_end_ms = endToEndMs;
			pre.ctx.meta.generation_ms = generationMs;
			if (typeof pre.ctx.meta.provider_ttft_ms === "number") {
				pre.ctx.meta.latency_ms = pre.ctx.meta.provider_ttft_ms;
			} else {
				delete pre.ctx.meta.latency_ms;
			}
			// A live sink forwards each round's output as it arrives, so the client saw
			// the first one then. Otherwise its first output is the synthetic stream, sent now.
			const firstLiveOutputAtMs = liveSink ? pre.ctx.meta.firstProviderOutputAtMs : undefined;
			pre.ctx.meta.gateway_ttft_ms =
				typeof firstLiveOutputAtMs === "number" && typeof pre.ctx.meta.startedAtMs === "number"
					? Math.max(1, Math.round(firstLiveOutputAtMs - pre.ctx.meta.startedAtMs))
					: Math.max(1, endToEndMs);
			pre.ctx.meta.preserve_stream_timing = true;

			const stream = buildSyntheticServerToolStream({
				protocol,
				payload: protocolResponse,
				requestId: pre.ctx.requestId,
				model:
					(typeof (protocolResponse as any)?.model === "string"
						? (protocolResponse as any).model
						: (typeof (exec.result.ir as any)?.model === "string"
							? (exec.result.ir as any).model
							: pre.ctx.model)),
				created:
					typeof (protocolResponse as any)?.created === "number"
						? (protocolResponse as any).created
						: null,
				serverToolTrace,
			});
			if (stream) {
				exec.result.kind = "stream";
				exec.result.stream = stream;
				exec.result.upstream = new Response(null, {
					status: exec.result.upstream.status,
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-store",
					},
				});
			}
		}

		const header = timing.timer.header();
		pre.ctx.timing = timing.timer.snapshot();
		pre.ctx.timer = timing.timer;

		return finalizeRequest({
			pre,
			exec: { ok: true, result: exec.result },
			endpoint,
			timingHeader: header || undefined,
		});
	} catch (err) {
		logPipelineExecutionError("text-generate", err);
		await (settleServerToolRoundsOnError as (() => Promise<void>) | null)?.();
		const header = timing.timer.header();
		pre.ctx.timing = timing.timer.snapshot();
		return await handleError({
			stage: "execute",
			res: buildPipelineExecutionErrorResponse(err, pre.ctx),
			endpoint,
			ctx: pre.ctx,
			timingHeader: header || undefined,
			auditFailure,
			req,
		});
	}
}
