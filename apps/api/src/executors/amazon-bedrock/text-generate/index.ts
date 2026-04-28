// Purpose: Executor for amazon-bedrock / text-generate.
// Why: Uses Bedrock native Converse API and maps via IR.
// How: IR -> Converse payload, Converse response -> IR, then protocol shaping is handled by the pipeline.

import type { IRChatRequest, IRChatResponse, IRChoice, IRContentPart, IRToolCall } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, Bill } from "@executors/types";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { resolveStreamForProtocol, bufferStreamToIR } from "@executors/_shared/text-generate/openai-compat";
import { createSyntheticResponsesStreamFromIR } from "@executors/_shared/text-generate/synthetic-responses-stream";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAIResponses, openAIResponsesToIR } from "@executors/_shared/text-generate/openai-compat/transform";
import { shouldFallbackToChatFromError, readErrorPayload } from "@executors/_shared/text-generate/openai-compat/retry-policy";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { mapIrEffortToAnthropic } from "@core/reasoningEffort";
import type { ProviderExecutor } from "../../types";
import {
	bedrockConverseToIR,
	createBedrockConverseToChatStream,
	mapBedrockStopReasonToOpenAI,
	parseJson,
	resolveBedrockAuth,
	signAwsV4Request,
	shouldFallbackToConverseFromError,
} from "./bedrock-utils";

type BedrockCredentials = {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	region?: string;
	baseUrl?: string;
};

const DEFAULT_MAX_REMOTE_ASSET_BYTES = 20 * 1024 * 1024;
const AUDIO_MIME_BY_FORMAT: Record<string, string> = {
	wav: "audio/wav",
	mp3: "audio/mpeg",
	flac: "audio/flac",
	m4a: "audio/mp4",
	ogg: "audio/ogg",
	pcm16: "audio/L16",
	pcm24: "audio/L24",
};

type BedrockAuth =
	| {
		mode: "sigv4";
		region: string;
		baseUrl: string;
		credentials: BedrockCredentials & { region: string; baseUrl: string };
	}
	| {
		mode: "bearer";
		token: string;
		region: string;
		baseUrl: string;
	};

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	const model = args.providerModelSlug ?? irRequest.model;
	const { keyInfo, auth } = resolveBedrockAuth(args);
	const route = resolveBedrockTextRoute(args, model);

	if (route === "chat" || route === "responses") {
		return executeBedrockOpenAI(args, keyInfo, auth, model, route);
	}

	return executeBedrockConverse(args, keyInfo, auth, model);
}

async function executeBedrockConverse(
	args: ExecutorExecuteArgs,
	keyInfo: { source: "gateway" | "byok"; byokId: string | null },
	auth: BedrockAuth,
	model: string,
): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();

	const requestPayload = await irToBedrockConverse(irRequest, args.maxOutputTokens, model);
	const requestBody = JSON.stringify(requestPayload);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	const baseUrl = auth.baseUrl.replace(/\/+$/, "");
	const converseUrl = buildBedrockConverseUrl(baseUrl, model);
	const converseStreamUrl = `${buildBedrockConverseUrl(baseUrl, model)}-stream`;
	const streamRes = await sendBedrockRequest(auth, {
		url: converseStreamUrl,
		body: requestBody,
		headers: {
			"Content-Type": "application/json",
			Accept: "application/vnd.amazon.eventstream",
			...upstreamTestHeaders(args.meta),
		},
	});

	const streamBill: Bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined,
		upstream_id:
			streamRes.headers.get("x-amzn-requestid") ??
			streamRes.headers.get("x-request-id") ??
			undefined,
		finish_reason: null,
	};

	if (streamRes.ok && streamRes.body) {
		const streamContentType = String(streamRes.headers.get("content-type") || "").toLowerCase();
		if (streamContentType.includes("application/json")) {
			const json: any = await streamRes.clone().json().catch(() => null);
			if (json && typeof json === "object" && json.output?.message) {
				const ir = bedrockConverseToIR(
					json,
					args.requestId,
					model,
					args.providerId,
					streamBill.upstream_id ?? undefined,
				);

				if (irRequest.stream) {
					const responsesStream = createSyntheticResponsesStreamFromIR(ir, args.requestId);
					const normalized = resolveStreamForProtocol(
						new Response(responsesStream, {
							status: streamRes.status,
							headers: streamRes.headers,
						}),
						args,
						"responses",
					);
					return {
						kind: "stream",
						stream: normalized,
						usageFinalizer: async () => null,
						bill: streamBill,
						upstream: streamRes,
						keySource: keyInfo.source,
						byokKeyId: keyInfo.byokId,
						mappedRequest,
						timing: {
							latencyMs: typeof json?.metrics?.latencyMs === "number" ? json.metrics.latencyMs : undefined,
							generationMs: Date.now() - upstreamStartMs,
						},
					};
				}

				const usageMeters = normalizeTextUsageForPricing(ir.usage);
				if (usageMeters) {
					streamBill.usage = usageMeters;
				}
				streamBill.finish_reason = ir?.choices?.[0]?.finishReason ?? null;

				return {
					kind: "completed",
					ir,
					bill: streamBill,
					upstream: streamRes,
					keySource: keyInfo.source,
					byokKeyId: keyInfo.byokId,
					mappedRequest,
					rawResponse: json,
					timing: {
						latencyMs: typeof json?.metrics?.latencyMs === "number" ? json.metrics.latencyMs : undefined,
						generationMs: (() => {
							const totalMs = Math.max(0, Date.now() - upstreamStartMs);
							const latencyMs = typeof json?.metrics?.latencyMs === "number" ? json.metrics.latencyMs : null;
							return latencyMs === null ? totalMs : Math.max(0, totalMs - latencyMs);
						})(),
					},
				};
			}
		}

		const chatSseStream = createBedrockConverseToChatStream(
			streamRes.body,
			args,
			model,
			streamBill.upstream_id ?? undefined,
		);
		const upstreamChatStream = new Response(chatSseStream, {
			status: streamRes.status,
			headers: streamRes.headers,
		});

		if (irRequest.stream) {
			const normalized = resolveStreamForProtocol(
				upstreamChatStream,
				args,
				"chat",
			);
			return {
				kind: "stream",
				stream: normalized,
				usageFinalizer: async () => null,
				bill: streamBill,
				upstream: streamRes,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
				timing: {
					latencyMs: undefined,
					generationMs: undefined,
				},
			};
		}

		const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(
			upstreamChatStream,
			args,
			"chat",
			upstreamStartMs,
		);
		const usageMeters = normalizeTextUsageForPricing(usage ?? ir?.usage);
		if (usageMeters) {
			streamBill.usage = usageMeters;
		}
		streamBill.finish_reason = ir?.choices?.[0]?.finishReason ?? null;

		return {
			kind: "completed",
			ir,
			bill: streamBill,
			upstream: streamRes,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse,
			timing: {
				latencyMs: firstByteMs ?? undefined,
				generationMs:
					typeof firstByteMs === "number" && typeof totalMs === "number"
						? Math.max(0, totalMs - firstByteMs)
						: totalMs ?? undefined,
			},
		};
	}

	if (irRequest.stream && !shouldFallbackToConverseFromError(streamRes.status)) {
		return {
			kind: "completed",
			ir: undefined,
			bill: streamBill,
			upstream: streamRes,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
		};
	}

	const res = await sendBedrockRequest(auth, {
		url: converseUrl,
		body: requestBody,
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			...upstreamTestHeaders(args.meta),
		},
	});

	const bill: Bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined,
		upstream_id:
			res.headers.get("x-amzn-requestid") ??
			res.headers.get("x-request-id") ??
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

	const json: any = await res.json();
	const ir = bedrockConverseToIR(
		json,
		args.requestId,
		model,
		args.providerId,
		bill.upstream_id ?? undefined,
	);

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
			stream: normalized,
			usageFinalizer: async () => null,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			timing: {
				latencyMs: typeof json?.metrics?.latencyMs === "number" ? json.metrics.latencyMs : undefined,
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
		ir,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json,
		timing: {
			latencyMs: typeof json?.metrics?.latencyMs === "number" ? json.metrics.latencyMs : undefined,
			generationMs: Date.now() - upstreamStartMs,
		},
	};
}

async function executeBedrockOpenAI(
	args: ExecutorExecuteArgs,
	keyInfo: { source: "gateway" | "byok"; byokId: string | null },
	auth: BedrockAuth,
	model: string,
	preferredRoute: "chat" | "responses",
): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();

	const buildPayload = (route: "chat" | "responses"): Record<string, any> => {
		const payload = route === "responses"
			? irToOpenAIResponses(irRequest, model, "amazon-bedrock", args.capabilityParams)
			: irToOpenAIChat(irRequest, model, "amazon-bedrock", args.capabilityParams);

		// Stream upstream by default so non-stream callers still capture first-token latency
		// and generation timing from the buffered stream path.
		payload.stream = true;
		if (route === "chat") {
			payload.stream_options = {
				...(payload.stream_options ?? {}),
				include_usage: true,
			};
		}

		return payload;
	};

	let route: "chat" | "responses" = preferredRoute;
	let requestPayload = buildPayload(route);
	let requestBody = JSON.stringify(requestPayload);
	let mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
	let res = await sendBedrockRequest(auth, {
		url: buildBedrockOpenAIUrl(auth.baseUrl, route),
		body: requestBody,
		headers: {
			"Content-Type": "application/json",
			Accept: requestPayload.stream ? "text/event-stream" : "application/json",
			...upstreamTestHeaders(args.meta),
		},
	});

	if (!res.ok && route === "responses") {
		const { errorText } = await readErrorPayload(res);
		if (shouldFallbackToChatFromError({ route: "responses", status: res.status, errorText })) {
			route = "chat";
			requestPayload = buildPayload(route);
			requestBody = JSON.stringify(requestPayload);
			mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;
			res = await sendBedrockRequest(auth, {
				url: buildBedrockOpenAIUrl(auth.baseUrl, route),
				body: requestBody,
				headers: {
					"Content-Type": "application/json",
					Accept: requestPayload.stream ? "text/event-stream" : "application/json",
					...upstreamTestHeaders(args.meta),
				},
			});
		}
	}

	const bill: Bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined,
		upstream_id:
			res.headers.get("x-amzn-requestid") ??
			res.headers.get("x-request-id") ??
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

	if (irRequest.stream) {
		const stream = resolveStreamForProtocol(res, args, route);
		return {
			kind: "stream",
			stream,
			usageFinalizer: async () => null,
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

	if (requestPayload.stream) {
		const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(
			res,
			args,
			route,
			upstreamStartMs,
		);
		const usageMeters = normalizeTextUsageForPricing(usage ?? ir?.usage);
		if (usageMeters) {
			bill.usage = usageMeters;
		}
		bill.finish_reason = ir?.choices?.[0]?.finishReason ?? null;

		return {
			kind: "completed",
			ir,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse,
			timing: {
				latencyMs: firstByteMs ?? undefined,
				generationMs:
					typeof firstByteMs === "number" && typeof totalMs === "number"
						? Math.max(0, totalMs - firstByteMs)
						: totalMs ?? undefined,
			},
		};
	}

	const json: any = await res.json().catch(() => null);
	const ir = route === "responses"
		? openAIResponsesToIR(json ?? {}, args.requestId, model, args.providerId)
		: openAIChatToIR(json ?? {}, args.requestId, model, args.providerId);
	const usageMeters = normalizeTextUsageForPricing(json?.usage ?? ir?.usage);
	if (usageMeters) {
		bill.usage = usageMeters;
	}
	bill.finish_reason = ir?.choices?.[0]?.finishReason ?? null;

	return {
		kind: "completed",
		ir,
		bill,
		upstream: res,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: json,
		timing: {
			latencyMs: Date.now() - upstreamStartMs,
			generationMs: 0,
		},
	};
}

export function postprocess(ir: any): any {
	return ir;
}

export function transformStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	return stream;
}

function normalizeModelId(model: string | null | undefined): string {
	return typeof model === "string" ? model.trim().toLowerCase() : "";
}

function isClaudeOpus47Model(model: string | null | undefined): boolean {
	const normalized = normalizeModelId(model);
	if (!normalized) return false;
	return (
		normalized.includes("claude-opus-4-7") ||
		normalized.includes("claude-opus-4.7") ||
		normalized.includes("claude-opus-4-7-v1")
	);
}

async function irToBedrockConverse(
	ir: IRChatRequest,
	providerMaxOutputTokens?: number | null,
	modelHint?: string | null,
): Promise<any> {
	const messages: any[] = [];
	const system: any[] = [];
	const resolvedModel = modelHint || ir.model;
	const isOpus47 = isClaudeOpus47Model(resolvedModel);

	for (const msg of ir.messages) {
		if (msg.role === "system" || msg.role === "developer") {
			const text = msg.content
				.filter((part) => part.type === "text" || part.type === "reasoning_text")
				.map((part) => ("text" in part ? part.text : ""))
				.join("");
			if (text) system.push({ text });
			continue;
		}

		if (msg.role === "user") {
			const content: any[] = [];
			for (const part of msg.content) {
				content.push(await mapIRContentToBedrockContent(part));
			}
			messages.push({
				role: "user",
				content,
			});
			continue;
		}

		if (msg.role === "assistant") {
			const content: any[] = [];
			for (const part of msg.content) {
				content.push(await mapIRContentToBedrockContent(part));
			}
			for (const toolCall of msg.toolCalls ?? []) {
				content.push({
					toolUse: {
						toolUseId: toolCall.id,
						name: toolCall.name,
						input: parseJson(toolCall.arguments),
					},
				});
			}
			messages.push({
				role: "assistant",
				content,
			});
			continue;
		}

		if (msg.role === "tool") {
			const toolResultBlocks = msg.toolResults.map((toolResult) => ({
				toolResult: {
					toolUseId: toolResult.toolCallId,
					status: toolResult.isError ? "error" : "success",
					content: [{
						text: toolResult.content,
					}],
				},
			}));
			messages.push({
				role: "user",
				content: toolResultBlocks,
			});
		}
	}

	const request: any = {
		messages,
	};
	if (system.length > 0) request.system = system;

	const maxTokens = ir.maxTokens ?? providerMaxOutputTokens ?? 4096;
	const inferenceConfig: Record<string, any> = {};
	if (typeof maxTokens === "number") inferenceConfig.maxTokens = maxTokens;
	if (!isOpus47 && typeof ir.temperature === "number") inferenceConfig.temperature = ir.temperature;
	if (!isOpus47 && typeof ir.topP === "number") inferenceConfig.topP = ir.topP;
	if (ir.stop) inferenceConfig.stopSequences = Array.isArray(ir.stop) ? ir.stop : [ir.stop];
	if (Object.keys(inferenceConfig).length > 0) {
		request.inferenceConfig = inferenceConfig;
	}

	if (!isOpus47 && typeof ir.topK === "number") {
		request.additionalModelRequestFields = {
			...(request.additionalModelRequestFields ?? {}),
			top_k: ir.topK,
		};
	}

	if (isOpus47) {
		request.additionalModelRequestFields = {
			...(request.additionalModelRequestFields ?? {}),
			thinking: { type: "adaptive", display: "summarized" },
		};
		const anthropicEffort = mapIrEffortToAnthropic(ir.reasoning?.effort, { preferXHigh: true });
		if (anthropicEffort) {
			request.additionalModelRequestFields = {
				...(request.additionalModelRequestFields ?? {}),
				output_config: {
					effort: anthropicEffort,
				},
			};
		}
	} else if (ir.reasoning) {
		const reasoningMaxTokens = typeof ir.reasoning.maxTokens === "number" ? ir.reasoning.maxTokens : maxTokens;
		if (ir.reasoning.enabled === false) {
			request.additionalModelRequestFields = {
				...(request.additionalModelRequestFields ?? {}),
				thinking: { type: "disabled" },
			};
		} else if (reasoningMaxTokens > 0) {
			request.additionalModelRequestFields = {
				...(request.additionalModelRequestFields ?? {}),
				thinking: { type: "enabled", budget_tokens: reasoningMaxTokens },
			};
		}
	}

	if (Array.isArray(ir.tools) && ir.tools.length > 0) {
		request.toolConfig = {
			tools: ir.tools.map((tool) => ({
				toolSpec: {
					name: tool.name,
					description: tool.description,
					inputSchema: {
						json: tool.parameters ?? { type: "object", properties: {} },
					},
				},
			})),
		};
		if (ir.toolChoice === "auto") {
			request.toolConfig.toolChoice = { auto: {} };
		} else if (ir.toolChoice === "required") {
			request.toolConfig.toolChoice = { any: {} };
		} else if (typeof ir.toolChoice === "object" && ir.toolChoice?.name) {
			request.toolConfig.toolChoice = { tool: { name: ir.toolChoice.name } };
		}
	}

	if (typeof ir.speed === "string" && ir.speed.toLowerCase() === "fast") {
		request.performanceConfig = { latency: "optimized" };
	} else if (typeof ir.serviceTier === "string") {
		const tier = ir.serviceTier.toLowerCase();
		if (tier === "priority") request.performanceConfig = { latency: "optimized" };
		if (tier === "standard") request.performanceConfig = { latency: "standard" };
	}

	return request;
}

async function mapIRContentToBedrockContent(part: IRContentPart): Promise<any> {
	if (part.type === "text") return { text: part.text };
	if (part.type === "reasoning_text") return { text: part.text };
	if (part.type === "image") return mapIRImageToBedrockContent(part);
	if (part.type === "audio") return mapIRAudioToBedrockContent(part);
	if (part.type === "video") return mapIRVideoToBedrockContent(part);
	return { text: String(part) };
}

function imageFormatFromMime(mimeType?: string): string {
	const value = (mimeType || "image/jpeg").toLowerCase();
	if (value.includes("png")) return "png";
	if (value.includes("gif")) return "gif";
	if (value.includes("webp")) return "webp";
	return "jpeg";
}

function audioFormatFromMimeOrFormat(format?: string, mimeType?: string): string {
	if (format && format.trim()) return format.trim().toLowerCase();
	if (!mimeType) return "wav";
	const value = mimeType.toLowerCase();
	if (value.includes("mpeg") || value.endsWith("/mp3")) return "mp3";
	if (value.includes("flac")) return "flac";
	if (value.includes("mp4") || value.includes("m4a")) return "m4a";
	if (value.includes("ogg")) return "ogg";
	return "wav";
}

function videoFormatFromMimeOrUrl(mimeType?: string, url?: string): string {
	const mime = (mimeType || "").toLowerCase();
	if (mime.includes("webm")) return "webm";
	if (mime.includes("quicktime")) return "mov";
	if (mime.includes("x-matroska")) return "mkv";
	if (mime.includes("mpeg")) return "mpeg";
	if (mime.includes("avi")) return "avi";
	if (mime.includes("flv")) return "flv";
	if (mime.includes("3gpp")) return "three_gp";
	if (mime.includes("mp4")) return "mp4";

	const ext = ((url || "").split("?")[0] || "").split(".").pop()?.toLowerCase();
	if (!ext) return "mp4";
	if (ext === "3gp") return "three_gp";
	if (ext === "m4v") return "mp4";
	if (ext === "mpg") return "mpeg";
	return ext;
}

async function mapIRImageToBedrockContent(
	part: Extract<IRContentPart, { type: "image" }>,
): Promise<any> {
	if (part.source === "data") {
		return {
			image: {
				format: imageFormatFromMime(part.mimeType),
				source: { bytes: part.data },
			},
		};
	}

	const payload = await mediaToBedrockBytes(part.data, part.mimeType || "image/jpeg");
	if (!payload) return { text: `[image:${part.data}]` };

	return {
		image: {
			format: imageFormatFromMime(payload.mimeType || part.mimeType),
			source: { bytes: payload.bytes },
		},
	};
}

async function mapIRAudioToBedrockContent(
	part: Extract<IRContentPart, { type: "audio" }>,
): Promise<any> {
	const fallbackMime = part.format
		? (AUDIO_MIME_BY_FORMAT[part.format] || `audio/${part.format}`)
		: "audio/wav";
	const data = part.source === "data"
		? { bytes: part.data, mimeType: fallbackMime }
		: await mediaToBedrockBytes(part.data, fallbackMime);

	if (!data) return { text: `[audio:${part.format || "wav"}]` };

	return {
		audio: {
			format: audioFormatFromMimeOrFormat(part.format, data.mimeType),
			source: { bytes: data.bytes },
		},
	};
}

async function mapIRVideoToBedrockContent(
	part: Extract<IRContentPart, { type: "video" }>,
): Promise<any> {
	const data = await mediaToBedrockBytes(part.url, "video/mp4");
	if (!data) return { text: `[video:${part.url}]` };

	return {
		video: {
			format: videoFormatFromMimeOrUrl(data.mimeType, part.url),
			source: { bytes: data.bytes },
		},
	};
}

async function mediaToBedrockBytes(
	value: string,
	fallbackMimeType: string,
	maxRemoteAssetBytes = DEFAULT_MAX_REMOTE_ASSET_BYTES,
): Promise<{ bytes: string; mimeType: string } | null> {
	const dataUrl = parseDataUrl(value);
	if (dataUrl) {
		return {
			bytes: dataUrl.data,
			mimeType: dataUrl.mimeType || fallbackMimeType,
		};
	}

	if (!/^https?:\/\//i.test(value)) return null;

	try {
		const res = await fetch(value);
		if (!res.ok) return null;
		const contentLength = Number(res.headers.get("content-length") || "0");
		if (contentLength > 0 && contentLength > maxRemoteAssetBytes) return null;
		const bytes = await res.arrayBuffer();
		if (bytes.byteLength > maxRemoteAssetBytes) return null;
		return {
			bytes: encodeBase64(bytes),
			mimeType: normalizeContentType(res.headers.get("content-type"), fallbackMimeType),
		};
	} catch {
		return null;
	}
}

function parseDataUrl(value: string): { mimeType: string; data: string } | null {
	const match = /^data:([^;,]+)?;base64,(.+)$/i.exec(value);
	if (!match) return null;
	return {
		mimeType: match[1] || "application/octet-stream",
		data: match[2] || "",
	};
}

function normalizeContentType(value: string | null | undefined, fallback: string): string {
	const base = (value || "").split(";")[0]?.trim();
	return base || fallback;
}

function encodeBase64(buffer: ArrayBuffer): string {
	const maybeBuffer = (globalThis as any)?.Buffer;
	if (maybeBuffer) {
		return maybeBuffer.from(buffer).toString("base64");
	}
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	const btoaFn = (globalThis as any)?.btoa;
	if (typeof btoaFn === "function") {
		return btoaFn(binary);
	}
	throw new Error("No base64 encoder available");
}

function resolveBedrockTextRoute(
	args: ExecutorExecuteArgs,
	model: string,
): "chat" | "responses" | "converse" {
	const protocol = args.protocol ?? (args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions");
	const wantsResponses = protocol === "openai.responses" || args.endpoint === "responses";

	if (isBedrockOpenAIModel(model)) {
		return wantsResponses ? "responses" : "chat";
	}

	return "converse";
}

function isBedrockOpenAIModel(model: string): boolean {
	const normalizedModel = normalizeModelName(model).toLowerCase();
	return (
		normalizedModel.startsWith("openai.") ||
		normalizedModel.startsWith("us.openai.") ||
		normalizedModel.startsWith("eu.openai.") ||
		normalizedModel.startsWith("apac.openai.")
	);
}

function normalizeModelName(model?: string | null): string {
	if (!model) return "";
	const value = model.trim();
	if (!value) return "";
	const parts = value.split("/");
	return parts[parts.length - 1] || value;
}

function buildBedrockOpenAIUrl(baseUrl: string, route: "chat" | "responses"): string {
	const suffix = route === "responses" ? "/responses" : "/chat/completions";
	const normalizedBase = baseUrl.replace(/\/+$/, "");
	const lower = normalizedBase.toLowerCase();
	if (lower.endsWith("/openai/v1") || lower.endsWith("/v1")) {
		return `${normalizedBase}${suffix}`;
	}
	if (lower.endsWith("/openai")) {
		return `${normalizedBase}/v1${suffix}`;
	}
	if (lower.includes("bedrock-mantle.")) {
		return `${normalizedBase}/v1${suffix}`;
	}
	return `${normalizedBase}/openai/v1${suffix}`;
}

function buildBedrockConverseUrl(baseUrl: string, model: string): string {
	const normalizedBase = normalizeBaseUrlForConverse(baseUrl);
	return `${normalizedBase}/model/${encodeURIComponent(model)}/converse`;
}

function normalizeBaseUrlForConverse(baseUrl: string): string {
	const normalizedBase = baseUrl.replace(/\/+$/, "");
	const lower = normalizedBase.toLowerCase();
	if (lower.endsWith("/openai/v1")) {
		return normalizedBase.slice(0, -"/openai/v1".length);
	}
	if (lower.endsWith("/openai")) {
		return normalizedBase.slice(0, -"/openai".length);
	}
	return normalizedBase;
}

async function sendBedrockRequest(
	auth: BedrockAuth,
	args: { url: string; body: string; headers: Record<string, string> },
): Promise<Response> {
	const requestHeaders = auth.mode === "sigv4"
		? await signAwsV4Request({
			method: "POST",
			url: args.url,
			body: args.body,
			region: auth.region,
			service: "bedrock",
			accessKeyId: auth.credentials.accessKeyId,
			secretAccessKey: auth.credentials.secretAccessKey,
			sessionToken: auth.credentials.sessionToken,
			headers: args.headers,
		})
		: {
			Authorization: `Bearer ${auth.token}`,
			...args.headers,
		};

	return fetch(args.url, {
		method: "POST",
		headers: requestHeaders,
		body: args.body,
	});
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess,
	transformStream,
});



