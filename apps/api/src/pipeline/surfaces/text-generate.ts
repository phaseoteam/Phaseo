// Purpose: Text generation pipeline surface.
// Why: Isolates text.generate request lifecycle from other surfaces.
// How: Decodes protocol -> IR, executes provider, encodes response.

import type { IRChatRequest, IRChatResponse } from "@core/ir";
import { handleError } from "@core/error-handler";
import { detectTextProtocol } from "@protocols/detect";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import { doRequestWithIR } from "../execute";
import { finalizeRequest } from "../after";
import { handleSuccessAudit } from "../after/audit";
import { makeHeaders, createResponse } from "../after/http";
import { auditFailure } from "../audit";
import type { PipelineRunnerArgs } from "./types";
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
import type { PipelineContext } from "../before/types";

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
		},
		stream: false,
		providers: candidates,
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
		searchObservability: null,
		webFetchObservability: null,
		responseCache: null,
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
	return {
		ok: true,
		content: extractAssistantText(advisorResponse),
		usage: advisorResponse.usage,
	};
}

async function executeImageGenerationModel(args: {
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
}): Promise<{ ok: true; imageUrl?: string; b64Json?: string; mimeType?: string; model: string; usage?: IRChatResponse["usage"] } | { ok: false; message: string }> {
	const apiKeyId = args.pre.ctx.keyId;
	if (!apiKeyId) {
		return { ok: false, message: "Image generation cannot resolve the current API key context." };
	}
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
			message: `No text.generate providers are available for image generation model ${args.model}.`,
		};
	}

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
	const imageCtx: PipelineContext = {
		...args.pre.ctx,
		requestId: `${args.pre.ctx.requestId}:image_generation`,
		model: imageContext.resolvedModel ?? args.model,
		requestedModel: args.model,
		endpoint: "text.generate" as any,
		capability: "text.generate",
		protocol: "openai.chat",
		rawBody,
		body: rawBody,
		stream: false,
		providers: candidates,
		pricing: imageContext.pricing,
		gating: {
			key: imageContext.key,
			keyLimit: imageContext.keyLimit,
			credit: imageContext.credit,
		},
		preset: imageContext.preset
			? {
				id: imageContext.preset.id,
				name: imageContext.preset.name,
				slug: imageContext.preset.slug ?? null,
				config: imageContext.preset.config,
			}
			: null,
		teamEnrichment: imageContext.teamEnrichment ?? args.pre.ctx.teamEnrichment,
		keyEnrichment: imageContext.keyEnrichment ?? args.pre.ctx.keyEnrichment,
		teamSettings: imageContext.teamSettings ?? args.pre.ctx.teamSettings,
		attemptErrors: [],
		providerAttempts: [],
		searchObservability: null,
		webFetchObservability: null,
		responseCache: null,
	};

	const executed = await doRequestWithIR(imageCtx, imageIr, args.timing);
	if (executed instanceof Response) {
		let message = `Image generation request failed with status ${executed.status}.`;
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
		return { ok: false, message: "Image generation request returned an unsupported response kind." };
	}
	const imageResponse = executed.result.ir as IRChatResponse;
	const image = extractAssistantImage(imageResponse);
	if (!image) {
		return { ok: false, message: "Image generation response did not include an image." };
	}
	return {
		ok: true,
		...image,
		model: imageContext.resolvedModel ?? args.model,
		usage: imageResponse.usage,
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
		responseBodyRecord.meta = {
			...existingMeta,
			...(ctx.responseCache ? { response_cache: ctx.responseCache } : {}),
			...(ctx.guardrailEnforcement
				? { guardrail_enforcement: ctx.guardrailEnforcement }
				: {}),
		};
	}

	const headers = makeHeaders(timingHeader);
	headers.set("X-AI-Stats-Response-Cache", "hit");
	return createResponse(responseBody, record.statusCode, headers);
}

async function materializeStreamResultToCompleted(args: {
	protocol: ReturnType<typeof detectTextProtocol>;
	requestId: string;
	model: string;
	result: any;
}): Promise<any> {
	const stream = args.result.stream ?? args.result.upstream?.body ?? null;
	if (!stream) {
		throw new Error("gateway_stream_materialization_missing_body");
	}
	const materializeStartedAt = performance.now();
	const consumed = await consumeTextProtocolStreamToIR({
		protocol: args.protocol,
		stream,
		requestId: args.requestId,
		model: args.model,
		provider: args.result.provider,
	});
	const materializedGenerationMs = Math.max(
		0,
		Math.round(performance.now() - materializeStartedAt),
	);
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
			generationMs: Math.max(
				typeof args.result.timing?.generationMs === "number"
					? args.result.timing.generationMs
					: 0,
				materializedGenerationMs,
			),
		},
		bill: {
			...args.result.bill,
			usage:
				(args.result.bill?.usage && typeof args.result.bill.usage === "object")
					? args.result.bill.usage
					: (consumed.usageRaw && typeof consumed.usageRaw === "object"
						? consumed.usageRaw
						: args.result.bill?.usage),
		},
	};
}

export async function runTextGeneratePipeline(args: PipelineRunnerArgs): Promise<Response> {
	const { pre, req, endpoint, timing } = args;

	try {
		// Protocol detection
		timing.timer.mark("protocol_detect");
		const requestPath = new URL(req.url).pathname;
		const protocol = detectTextProtocol(endpoint, requestPath);
		(pre.ctx as any).protocol = protocol; // Store for observability
		timing.timer.end("protocol_detect");

		const preparedServerTools = prepareServerToolsForTextRequest(pre.ctx.body, protocol);
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
		const shouldForceStreamExecution = requestedStream || preparedServerTools.config.enabled;
		const irForExecution: IRChatRequest = {
			...ir,
			stream: shouldForceStreamExecution,
		};
		const responseCacheEligibility = isResponseCacheEligible({
			endpoint,
			stream: requestedStream,
			debugEnabled: Boolean(pre.ctx.meta?.debug?.enabled),
			hasTools: Array.isArray(pre.ctx.body?.tools) && pre.ctx.body.tools.length > 0,
			serverToolsEnabled: preparedServerTools.config.enabled,
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
		let exec = await doRequestWithIR(pre.ctx, irForExecution, timing);

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
				});
			} catch (error) {
				const header = timing.timer.header();
				pre.ctx.timing = timing.timer.snapshot();
				return await handleError({
					stage: "execute",
					res: createJsonErrorResponse(
						502,
						"gateway_stream_materialization_error",
						error instanceof Error ? error.message : String(error),
					),
					endpoint,
					ctx: pre.ctx,
					timingHeader: header || undefined,
					auditFailure,
					req,
				});
			}
		}

		const serverToolTrace: Array<{
			id: string;
			name: string;
			arguments?: string;
			output?: unknown;
			isError?: boolean;
		}> = [];

		if (preparedServerTools.config.enabled && exec.result.kind === "completed" && exec.result.ir) {
			const maxServerToolRounds = 8;
			let serverToolRounds = 0;
			const serverToolUsage = {
				datetimeRequests: 0,
				webSearchRequests: 0,
				webSearchResults: 0,
				webSearchExtraResults: 0,
				webFetchRequests: 0,
				advisorRequests: 0,
				imageGenerationRequests: 0,
				applyPatchRequests: 0,
			};
			let aggregateUsage = (exec.result.ir as IRChatResponse).usage;
			let latestIrResponse = exec.result.ir as IRChatResponse;
			let nextIrRequest = irForExecution;
			let searchObservability = pre.ctx.searchObservability ?? null;
			let webFetchObservability = pre.ctx.webFetchObservability ?? null;

			while (true) {
				const continuation = await buildServerToolContinuation(
					latestIrResponse,
					preparedServerTools.config,
					{
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
							}),
					},
				);
				if (!continuation) break;
				if (serverToolRounds >= maxServerToolRounds) {
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
				serverToolUsage.datetimeRequests += continuation.usage.datetimeRequests ?? 0;
				serverToolUsage.webSearchRequests += continuation.usage.webSearchRequests ?? 0;
				serverToolUsage.webSearchResults += continuation.usage.webSearchResults ?? 0;
				serverToolUsage.webSearchExtraResults += continuation.usage.webSearchExtraResults ?? 0;
				serverToolUsage.webFetchRequests += continuation.usage.webFetchRequests ?? 0;
				serverToolUsage.advisorRequests += continuation.usage.advisorRequests ?? 0;
				serverToolUsage.imageGenerationRequests += continuation.usage.imageGenerationRequests ?? 0;
				serverToolUsage.applyPatchRequests += continuation.usage.applyPatchRequests ?? 0;
				const toolCallsById = new Map(
					(continuation.assistantMessage.toolCalls ?? [])
						.filter((call) => call.name && call.name !== "tool_call")
						.map((call) => [call.id, call]),
				);
				for (const result of continuation.toolResults) {
					const call = toolCallsById.get(result.toolCallId);
					if (!call) continue;
					serverToolTrace.push({
						id: call.id,
						name: call.name,
						arguments: call.arguments,
						output: result.content,
						...(result.isError ? { isError: true } : {}),
					});
				}
				if (continuation.advisorUsage) {
					aggregateUsage = mergeIRUsageTotals(aggregateUsage, continuation.advisorUsage);
				}
				if (continuation.imageGenerationUsage) {
					aggregateUsage = mergeIRUsageTotals(aggregateUsage, continuation.imageGenerationUsage);
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

				nextIrRequest = {
					...nextIrRequest,
					stream: true,
					toolChoice: "auto",
					messages: [
						...nextIrRequest.messages,
						continuation.assistantMessage,
						{
							role: "tool",
							toolResults: continuation.toolResults,
						},
					],
				};

				const followUpExec = await doRequestWithIR(pre.ctx, nextIrRequest, timing);
				if (followUpExec instanceof Response) {
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
				if (followUpResult.kind === "stream") {
					try {
						followUpResult = await materializeStreamResultToCompleted({
							protocol,
							requestId: pre.ctx.requestId,
							model: pre.ctx.model,
							result: followUpResult,
						});
					} catch (error) {
						const header = timing.timer.header();
						pre.ctx.timing = timing.timer.snapshot();
						return await handleError({
							stage: "execute",
							res: createJsonErrorResponse(
								502,
								"gateway_stream_materialization_error",
								error instanceof Error ? error.message : String(error),
							),
							endpoint,
							ctx: pre.ctx,
							timingHeader: header || undefined,
							auditFailure,
							req,
						});
					}
				}
				if (followUpResult.kind !== "completed" || !followUpResult.ir) {
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

			if (
				serverToolUsage.datetimeRequests > 0 ||
				serverToolUsage.webSearchRequests > 0 ||
				serverToolUsage.webSearchResults > 0 ||
				serverToolUsage.webSearchExtraResults > 0 ||
				serverToolUsage.webFetchRequests > 0 ||
				serverToolUsage.advisorRequests > 0 ||
				serverToolUsage.imageGenerationRequests > 0 ||
				serverToolUsage.applyPatchRequests > 0
			) {
				const mergedUsage = attachServerToolUsage(aggregateUsage, {
					...serverToolUsage,
				});
				if (exec.result.ir) {
					(exec.result.ir as IRChatResponse).usage = mergedUsage;
				}
				exec.result.bill.usage = attachServerToolUsageToRawUsage(
					(exec.result.bill.usage as Record<string, any> | undefined) ?? undefined,
					{ ...serverToolUsage },
				);
				if (exec.result.rawResponse && typeof exec.result.rawResponse === "object") {
					const rawResponse = { ...(exec.result.rawResponse as Record<string, any>) };
					rawResponse.usage = attachServerToolUsageToRawUsage(
						rawResponse.usage as Record<string, any> | undefined,
						{ ...serverToolUsage },
					);
					exec.result.rawResponse = rawResponse;
				}
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
		}

		timing.timer.end("execute_total", "execute_start");

		if (
			preparedServerTools.config.enabled &&
			requestedStream &&
			exec.result.kind === "completed" &&
			protocolResponse
		) {
			const requestStartMs =
				typeof pre.ctx.meta.upstreamStartMs === "number"
					? pre.ctx.meta.upstreamStartMs
					: typeof pre.ctx.meta.startedAtMs === "number"
						? pre.ctx.meta.startedAtMs
						: null;
			const endToEndMs =
				requestStartMs !== null
					? Math.max(0, Math.round(Date.now() - requestStartMs))
					: Math.max(0, Math.round(timing.timer.elapsed("execute_start")));
			const resultTiming = (exec.result as { timing?: { generationMs?: number } }).timing;
			const generationMs = Math.max(
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
			pre.ctx.meta.latency_ms = Math.max(0, endToEndMs - generationMs);
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
