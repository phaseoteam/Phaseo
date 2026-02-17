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
import { computeBill } from "@pipeline/pricing/engine";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";
import type { ProviderExecutor } from "../../types";

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

	const requestPayload = await irToBedrockConverse(irRequest, args.maxOutputTokens);
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
					const priced = computeBill(usageMeters, args.pricingCard);
					streamBill.cost_cents = priced.pricing.total_cents;
					streamBill.currency = priced.pricing.currency;
					streamBill.usage = priced;
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
						generationMs: Date.now() - upstreamStartMs,
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
			const priced = computeBill(usageMeters, args.pricingCard);
			streamBill.cost_cents = priced.pricing.total_cents;
			streamBill.currency = priced.pricing.currency;
			streamBill.usage = priced;
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
				generationMs: totalMs ?? undefined,
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
		const priced = computeBill(usageMeters, args.pricingCard);
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
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
			const priced = computeBill(usageMeters, args.pricingCard);
			bill.cost_cents = priced.pricing.total_cents;
			bill.currency = priced.pricing.currency;
			bill.usage = priced;
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
				generationMs: totalMs ?? undefined,
			},
		};
	}

	const json: any = await res.json().catch(() => null);
	const ir = route === "responses"
		? openAIResponsesToIR(json ?? {}, args.requestId, model, args.providerId)
		: openAIChatToIR(json ?? {}, args.requestId, model, args.providerId);
	const usageMeters = normalizeTextUsageForPricing(json?.usage ?? ir?.usage);
	if (usageMeters) {
		const priced = computeBill(usageMeters, args.pricingCard);
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
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

async function irToBedrockConverse(ir: IRChatRequest, providerMaxOutputTokens?: number | null): Promise<any> {
	const messages: any[] = [];
	const system: any[] = [];

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
	if (typeof ir.temperature === "number") inferenceConfig.temperature = ir.temperature;
	if (typeof ir.topP === "number") inferenceConfig.topP = ir.topP;
	if (ir.stop) inferenceConfig.stopSequences = Array.isArray(ir.stop) ? ir.stop : [ir.stop];
	if (Object.keys(inferenceConfig).length > 0) {
		request.inferenceConfig = inferenceConfig;
	}

	if (typeof ir.topK === "number") {
		request.additionalModelRequestFields = {
			...(request.additionalModelRequestFields ?? {}),
			top_k: ir.topK,
		};
	}

	if (ir.reasoning) {
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

type BedrockStreamEvent = {
	type: string;
	data: any;
};

function createBedrockConverseToChatStream(
	upstream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
	model: string,
	nativeResponseId?: string,
): ReadableStream<Uint8Array> {
	const reader = upstream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();

	const created = Math.floor(Date.now() / 1000);
	let binaryBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
	let textBuffer = "";
	let mode: "unknown" | "aws-eventstream" | "text" = "unknown";
	let stopReason: string | undefined;
	let usage: any = undefined;
	let emittedFinish = false;
	const toolByBlockIndex = new Map<number, { toolCallIndex: number; id: string; name: string }>();
	let nextToolCallIndex = 0;

	const emitChatChunk = (
		controller: ReadableStreamDefaultController<Uint8Array>,
		payload: {
			delta?: Record<string, any>;
			finishReason?: IRChoice["finishReason"] | null;
			usage?: any;
		},
	) => {
		const chunk: any = {
			id: args.requestId,
			object: "chat.completion.chunk",
			nativeResponseId,
			created,
			model,
			provider: args.providerId,
			choices: [{
				index: 0,
				delta: payload.delta ?? {},
				finish_reason: payload.finishReason ?? null,
			}],
		};
		if (payload.usage) {
			chunk.usage = payload.usage;
		}
		controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
	};

	const emitDone = (controller: ReadableStreamDefaultController<Uint8Array>) => {
		controller.enqueue(encoder.encode("data: [DONE]\n\n"));
	};

	const resolveToolState = (
		contentBlockIndex: number,
		candidate?: Partial<{ id: string; name: string }>,
	): { toolCallIndex: number; id: string; name: string } => {
		const existing = toolByBlockIndex.get(contentBlockIndex);
		if (existing) {
			if (candidate?.id && existing.id !== candidate.id) existing.id = candidate.id;
			if (candidate?.name && existing.name !== candidate.name) existing.name = candidate.name;
			return existing;
		}
		const createdState = {
			toolCallIndex: nextToolCallIndex++,
			id: candidate?.id || `tool_${nextToolCallIndex}`,
			name: candidate?.name || "tool",
		};
		toolByBlockIndex.set(contentBlockIndex, createdState);
		return createdState;
	};

	const handleEvent = (
		event: BedrockStreamEvent,
		controller: ReadableStreamDefaultController<Uint8Array>,
	) => {
		const type = event.type;
		if (!type) return;

		if (type === "contentBlockStart") {
			const contentBlockIndex = Number(event.data?.contentBlockIndex ?? 0);
			const toolUse = event.data?.start?.toolUse;
			if (toolUse) {
				const initialArgs = extractBedrockToolInputInitial(toolUse);
				const tool = resolveToolState(contentBlockIndex, {
					id: String(toolUse.toolUseId ?? `tool_${contentBlockIndex}`),
					name: String(toolUse.name ?? "tool"),
				});
				emitChatChunk(controller, {
					delta: {
						role: "assistant",
						tool_calls: [{
							index: tool.toolCallIndex,
							id: tool.id,
							type: "function",
							function: {
								name: tool.name,
								arguments: initialArgs,
							},
						}],
					},
				});
			}
			return;
		}

		if (type === "contentBlockDelta") {
			const contentBlockIndex = Number(event.data?.contentBlockIndex ?? 0);
			const delta = event.data?.delta ?? {};

			if (typeof delta?.text === "string" && delta.text.length > 0) {
				emitChatChunk(controller, {
					delta: {
						role: "assistant",
						content: delta.text,
					},
				});
			}

			const reasoning = extractBedrockReasoningDelta(delta);
			if (reasoning.text) {
				emitChatChunk(controller, {
					delta: {
						role: "assistant",
						reasoning_content: reasoning.text,
					},
				});
			}

			const toolArgsDelta = extractBedrockToolArgsDelta(delta);
			if (toolArgsDelta) {
				const tool = resolveToolState(contentBlockIndex);
				emitChatChunk(controller, {
					delta: {
						role: "assistant",
						tool_calls: [{
							index: tool.toolCallIndex,
							id: tool.id,
							type: "function",
							function: {
								arguments: toolArgsDelta,
							},
						}],
					},
				});
			}
			return;
		}

		if (type === "messageStop") {
			stopReason = String(event.data?.stopReason || "");
			return;
		}

		if (type === "metadata") {
			usage = bedrockUsageToOpenAIUsage(event.data?.usage);
		}
	};

	const finalize = (controller: ReadableStreamDefaultController<Uint8Array>) => {
		if (!emittedFinish) {
			emittedFinish = true;
			emitChatChunk(controller, {
				delta: {},
				finishReason: mapBedrockStopReasonToOpenAI(stopReason),
				usage,
			});
		}
		emitDone(controller);
	};

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let failed = false;
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					if (!value || value.length === 0) continue;

					if (mode === "unknown") {
						mode = detectBedrockStreamMode(value);
					}

					if (mode === "aws-eventstream") {
						binaryBuffer = concatUint8Arrays(binaryBuffer, value);
						const parsed = parseAwsEventStreamFrames(binaryBuffer);
						if (parsed.parseError) {
							mode = "text";
							textBuffer += decoder.decode(binaryBuffer, { stream: true });
							binaryBuffer = new Uint8Array(0);
						} else {
							binaryBuffer = parsed.rest;
							for (const event of parsed.events) {
								handleEvent(event, controller);
							}
						}
						continue;
					}

					textBuffer += decoder.decode(value, { stream: true });
					const parsedText = parseBedrockTextEvents(textBuffer);
					textBuffer = parsedText.rest;
					for (const event of parsedText.events) {
						handleEvent(event, controller);
					}
				}

				if (mode === "text" && textBuffer.trim().length > 0) {
					const finalText = parseBedrockTextEvents(`${textBuffer}\n`);
					for (const event of finalText.events) {
						handleEvent(event, controller);
					}
				}

				finalize(controller);
			} catch (error) {
				console.error("amazon-bedrock converse stream transform failed:", error);
				failed = true;
				controller.error(error);
			} finally {
				if (!failed) {
					controller.close();
				}
			}
		},
	});
}

function detectBedrockStreamMode(chunk: Uint8Array<ArrayBufferLike>): "aws-eventstream" | "text" {
	if (chunk.length >= 12) {
		const totalLen = readUint32BE(chunk, 0);
		const headersLen = readUint32BE(chunk, 4);
		if (totalLen >= 16 && headersLen >= 0 && headersLen <= totalLen - 16 && totalLen <= 1024 * 1024 * 8) {
			return "aws-eventstream";
		}
	}
	const first = chunk[0] ?? 0;
	if (first === 0x7b || first === 0x5b || first === 0x64) {
		return "text";
	}
	return "aws-eventstream";
}

function parseAwsEventStreamFrames(buffer: Uint8Array<ArrayBufferLike>): {
	events: BedrockStreamEvent[];
	rest: Uint8Array<ArrayBufferLike>;
	parseError: boolean;
} {
	const events: BedrockStreamEvent[] = [];
	let offset = 0;

	try {
		while (buffer.length - offset >= 12) {
			const totalLen = readUint32BE(buffer, offset);
			const headersLen = readUint32BE(buffer, offset + 4);
			if (totalLen < 16 || headersLen < 0 || headersLen > totalLen - 16 || totalLen > 1024 * 1024 * 8) {
				return { events, rest: Uint8Array.from(buffer.subarray(offset)), parseError: true };
			}
			if (buffer.length - offset < totalLen) break;

			const messageStart = offset;
			const headersStart = messageStart + 12;
			const headersEnd = headersStart + headersLen;
			const payloadStart = headersEnd;
			const payloadEnd = messageStart + totalLen - 4;

			const headers = parseAwsEventStreamHeaders(buffer.subarray(headersStart, headersEnd));
			const eventType = String(headers[":event-type"] ?? headers["event-type"] ?? "");
			const payloadBytes = buffer.subarray(payloadStart, payloadEnd);
			const payloadText = new TextDecoder().decode(payloadBytes);
			let payload: any = {};
			try {
				payload = payloadText ? JSON.parse(payloadText) : {};
			} catch {
				payload = {};
			}

			const normalized = normalizeBedrockStreamEvent(eventType, payload);
			if (normalized) events.push(normalized);
			offset += totalLen;
		}
		return { events, rest: Uint8Array.from(buffer.subarray(offset)), parseError: false };
	} catch {
		return { events, rest: Uint8Array.from(buffer.subarray(offset)), parseError: true };
	}
}

function parseAwsEventStreamHeaders(headersBytes: Uint8Array<ArrayBufferLike>): Record<string, string> {
	const headers: Record<string, string> = {};
	let offset = 0;
	const decoder = new TextDecoder();

	while (offset < headersBytes.length) {
		const nameLen = headersBytes[offset] ?? 0;
		offset += 1;
		if (offset + nameLen > headersBytes.length) break;
		const name = decoder.decode(headersBytes.subarray(offset, offset + nameLen));
		offset += nameLen;
		const valueType = headersBytes[offset] ?? 0;
		offset += 1;

		switch (valueType) {
			case 7: { // string
				if (offset + 2 > headersBytes.length) break;
				const len = readUint16BE(headersBytes, offset);
				offset += 2;
				if (offset + len > headersBytes.length) break;
				headers[name] = decoder.decode(headersBytes.subarray(offset, offset + len));
				offset += len;
				break;
			}
			case 6: { // byte array
				if (offset + 2 > headersBytes.length) break;
				const len = readUint16BE(headersBytes, offset);
				offset += 2 + len;
				break;
			}
			case 0: // bool true
			case 1: // bool false
				headers[name] = valueType === 0 ? "true" : "false";
				break;
			case 2:
				offset += 1;
				break;
			case 3:
				offset += 2;
				break;
			case 4:
				offset += 4;
				break;
			case 5:
			case 8:
				offset += 8;
				break;
			case 9:
				offset += 16;
				break;
			default:
				offset = headersBytes.length;
				break;
		}
	}

	return headers;
}

function parseBedrockTextEvents(text: string): { events: BedrockStreamEvent[]; rest: string } {
	const events: BedrockStreamEvent[] = [];
	const lines = text.split(/\r?\n/);
	const rest = lines.pop() ?? "";

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		const payloadText = line.startsWith("data:") ? line.slice(5).trim() : line;
		if (!payloadText || payloadText === "[DONE]") continue;
		try {
			const parsed = JSON.parse(payloadText);
			const normalized = normalizeBedrockStreamEvent("", parsed);
			if (normalized) events.push(normalized);
		} catch {
			// Ignore malformed chunks.
		}
	}

	return { events, rest };
}

function normalizeBedrockStreamEvent(eventType: string, payload: any): BedrockStreamEvent | null {
	const knownTypes = new Set([
		"messageStart",
		"contentBlockStart",
		"contentBlockDelta",
		"contentBlockStop",
		"messageStop",
		"metadata",
		"modelStreamErrorException",
		"validationException",
		"throttlingException",
		"serviceUnavailableException",
		"internalServerException",
	]);

	if (eventType && knownTypes.has(eventType)) {
		const data = payload?.[eventType] ?? payload;
		return { type: eventType, data };
	}

	if (payload && typeof payload === "object") {
		for (const key of Object.keys(payload)) {
			if (knownTypes.has(key)) {
				return { type: key, data: payload[key] };
			}
		}
	}

	return null;
}

function extractBedrockReasoningDelta(delta: any): { text?: string } {
	if (!delta || typeof delta !== "object") return {};
	if (typeof delta?.reasoningText === "string") {
		return { text: delta.reasoningText };
	}
	const reasoningContent = delta?.reasoningContent;
	if (!reasoningContent || typeof reasoningContent !== "object") return {};
	if (typeof reasoningContent?.text === "string") {
		return { text: reasoningContent.text };
	}
	if (typeof reasoningContent?.reasoningText?.text === "string") {
		return { text: reasoningContent.reasoningText.text };
	}
	return {};
}

function extractBedrockToolArgsDelta(delta: any): string | null {
	if (!delta || typeof delta !== "object") return null;
	const toolUse = delta?.toolUse ?? delta?.tool_use;
	if (!toolUse || typeof toolUse !== "object") return null;

	if (typeof toolUse?.input === "string") return toolUse.input;
	if (typeof toolUse?.inputJson === "string") return toolUse.inputJson;
	if (typeof toolUse?.partialJson === "string") return toolUse.partialJson;
	return null;
}

function extractBedrockToolInputInitial(toolUse: any): string {
	if (!toolUse || typeof toolUse !== "object") return "";
	if (typeof toolUse.input === "string") return toolUse.input;
	if (toolUse.input && typeof toolUse.input === "object") {
		try {
			return JSON.stringify(toolUse.input);
		} catch {
			return "";
		}
	}
	return "";
}

function mapBedrockStopReasonToOpenAI(stopReason: string | undefined): IRChoice["finishReason"] {
	const reason = String(stopReason || "").toLowerCase();
	if (reason === "max_tokens") return "length";
	if (reason === "tool_use") return "tool_calls";
	if (reason === "guardrail_intervened" || reason === "content_filtered") return "content_filter";
	return "stop";
}

function shouldFallbackToConverseFromError(status: number): boolean {
	return status === 404 || status === 405 || status === 406 || status === 415 || status === 501;
}

function bedrockUsageToOpenAIUsage(usage: any): any {
	if (!usage || typeof usage !== "object") return undefined;
	const promptTokens = Number(usage.inputTokens ?? 0);
	const completionTokens = Number(usage.outputTokens ?? 0);
	const totalTokens = Number(usage.totalTokens ?? (promptTokens + completionTokens));

	const usageObject: any = {
		prompt_tokens: Number.isFinite(promptTokens) ? promptTokens : 0,
		completion_tokens: Number.isFinite(completionTokens) ? completionTokens : 0,
		total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
	};

	const inputDetails: Record<string, number> = {};
	const outputDetails: Record<string, number> = {};
	if (typeof usage.cacheReadInputTokens === "number") {
		inputDetails.cached_tokens = usage.cacheReadInputTokens;
	}
	if (typeof usage.cacheWriteInputTokens === "number") {
		outputDetails.cached_tokens = usage.cacheWriteInputTokens;
	}
	if (Object.keys(inputDetails).length > 0) {
		usageObject.input_tokens_details = inputDetails;
	}
	if (Object.keys(outputDetails).length > 0) {
		usageObject.output_tokens_details = outputDetails;
	}

	return usageObject;
}

function concatUint8Arrays(
	a: Uint8Array<ArrayBufferLike>,
	b: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
	if (a.length === 0) return b;
	if (b.length === 0) return a;
	const out = new Uint8Array(a.length + b.length);
	out.set(a, 0);
	out.set(b, a.length);
	return out;
}

function readUint32BE(bytes: Uint8Array<ArrayBufferLike>, offset: number): number {
	return (
		((bytes[offset] ?? 0) << 24) |
		((bytes[offset + 1] ?? 0) << 16) |
		((bytes[offset + 2] ?? 0) << 8) |
		(bytes[offset + 3] ?? 0)
	) >>> 0;
}

function readUint16BE(bytes: Uint8Array<ArrayBufferLike>, offset: number): number {
	return (((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)) >>> 0;
}

function bedrockConverseToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
	nativeId?: string,
): IRChatResponse {
	const contentBlocks = json?.output?.message?.content ?? [];
	const toolCalls: IRToolCall[] = [];
	const content: IRContentPart[] = [];

	for (const block of contentBlocks) {
		if (typeof block?.text === "string" && block.text.length > 0) {
			content.push({ type: "text", text: block.text });
		}
		const reasoningText = block?.reasoningContent?.reasoningText?.text;
		if (typeof reasoningText === "string" && reasoningText.length > 0) {
			content.push({ type: "reasoning_text", text: reasoningText });
		}
		if (block?.toolUse && typeof block.toolUse === "object") {
			toolCalls.push({
				id: String(block.toolUse.toolUseId || block.toolUse.id || `tool_${toolCalls.length}`),
				name: String(block.toolUse.name || "tool"),
				arguments: JSON.stringify(block.toolUse.input ?? {}),
			});
		}
	}

	let finishReason: IRChoice["finishReason"] = "stop";
	const stopReason = String(json?.stopReason || "").toLowerCase();
	if (stopReason === "max_tokens") finishReason = "length";
	if (stopReason === "tool_use" || toolCalls.length > 0) finishReason = "tool_calls";
	if (stopReason === "guardrail_intervened" || stopReason === "content_filtered") finishReason = "content_filter";

	return {
		id: requestId,
		nativeId: nativeId ?? undefined,
		created: Math.floor(Date.now() / 1000),
		model,
		provider,
		choices: [{
			index: 0,
			message: {
				role: "assistant",
				content: content.length > 0 ? content : [{ type: "text", text: "" }],
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
			},
			finishReason,
		}],
		usage: json?.usage
			? {
				inputTokens: json.usage.inputTokens ?? 0,
				outputTokens: json.usage.outputTokens ?? 0,
				totalTokens: json.usage.totalTokens ?? ((json.usage.inputTokens ?? 0) + (json.usage.outputTokens ?? 0)),
				cachedInputTokens: json.usage.cacheReadInputTokens,
				_ext: typeof json.usage.cacheWriteInputTokens === "number"
					? { cachedWriteTokens: json.usage.cacheWriteInputTokens }
					: undefined,
			}
			: undefined,
		serviceTier: json?.performanceConfig?.latency === "optimized" ? "priority" : undefined,
	};
}

function parseJson(value: string): any {
	try {
		return JSON.parse(value);
	} catch {
		return {};
	}
}

type SignRequestArgs = {
	method: string;
	url: string;
	body: string;
	region: string;
	service: string;
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	headers?: Record<string, string>;
};

async function signAwsV4Request(args: SignRequestArgs): Promise<Record<string, string>> {
	const parsed = new URL(args.url);
	const now = new Date();
	const amzDate = toAmzDate(now);
	const dateStamp = amzDate.slice(0, 8);
	const payloadHash = await sha256Hex(args.body);

	const canonicalHeadersMap = new Map<string, string>();
	canonicalHeadersMap.set("host", parsed.host);
	canonicalHeadersMap.set("x-amz-content-sha256", payloadHash);
	canonicalHeadersMap.set("x-amz-date", amzDate);

	for (const [key, value] of Object.entries(args.headers ?? {})) {
		canonicalHeadersMap.set(key.toLowerCase(), value.trim().replace(/\s+/g, " "));
	}
	if (args.sessionToken) {
		canonicalHeadersMap.set("x-amz-security-token", args.sessionToken);
	}

	const sortedHeaderKeys = [...canonicalHeadersMap.keys()].sort();
	const canonicalHeaders = sortedHeaderKeys
		.map((key) => `${key}:${canonicalHeadersMap.get(key) ?? ""}\n`)
		.join("");
	const signedHeaders = sortedHeaderKeys.join(";");

	const canonicalRequest = [
		args.method.toUpperCase(),
		normalizePath(parsed.pathname),
		normalizeQuery(parsed.searchParams),
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join("\n");

	const credentialScope = `${dateStamp}/${args.region}/${args.service}/aws4_request`;
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		await sha256Hex(canonicalRequest),
	].join("\n");

	const signingKey = await getAwsSigningKey(
		args.secretAccessKey,
		dateStamp,
		args.region,
		args.service,
	);
	const signature = toHex(await hmacSha256(signingKey, stringToSign));
	const authorization = [
		`AWS4-HMAC-SHA256 Credential=${args.accessKeyId}/${credentialScope}`,
		`SignedHeaders=${signedHeaders}`,
		`Signature=${signature}`,
	].join(", ");

	const signed: Record<string, string> = {
		...(args.headers ?? {}),
		Host: parsed.host,
		"X-Amz-Date": amzDate,
		"X-Amz-Content-Sha256": payloadHash,
		Authorization: authorization,
	};
	if (args.sessionToken) {
		signed["X-Amz-Security-Token"] = args.sessionToken;
	}
	return signed;
}

async function getAwsSigningKey(
	secretAccessKey: string,
	dateStamp: string,
	region: string,
	service: string,
): Promise<Uint8Array> {
	const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
	const kRegion = await hmacSha256(kDate, region);
	const kService = await hmacSha256(kRegion, service);
	return hmacSha256(kService, "aws4_request");
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return toHex(new Uint8Array(digest));
}

async function hmacSha256(key: string | Uint8Array, value: string): Promise<Uint8Array> {
	const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyBytes as unknown as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
	return new Uint8Array(signature);
}

function toAmzDate(date: Date): string {
	const yyyy = String(date.getUTCFullYear());
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const hh = String(date.getUTCHours()).padStart(2, "0");
	const mi = String(date.getUTCMinutes()).padStart(2, "0");
	const ss = String(date.getUTCSeconds()).padStart(2, "0");
	return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function normalizePath(pathname: string): string {
	if (!pathname) return "/";
	return pathname.split("/").map((segment) => encodeRfc3986(decodeSegment(segment))).join("/");
}

function normalizeQuery(searchParams: URLSearchParams): string {
	const entries: Array<[string, string]> = [];
	for (const [key, value] of searchParams.entries()) {
		entries.push([encodeRfc3986(key), encodeRfc3986(value)]);
	}
	entries.sort(([aKey, aValue], [bKey, bValue]) => {
		if (aKey === bKey) return aValue.localeCompare(bValue);
		return aKey.localeCompare(bKey);
	});
	return entries.map(([key, value]) => `${key}=${value}`).join("&");
}

function encodeRfc3986(value: string): string {
	return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
		`%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

function decodeSegment(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseBedrockCredentialMaterial(value: string | undefined): BedrockCredentials | null {
	if (!value || typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith("{")) {
		try {
			const json = JSON.parse(trimmed) as Record<string, unknown>;
			const accessKeyId = getString(json, [
				"accessKeyId",
				"access_key_id",
				"aws_access_key_id",
				"AWS_ACCESS_KEY_ID",
			]);
			const secretAccessKey = getString(json, [
				"secretAccessKey",
				"secret_access_key",
				"aws_secret_access_key",
				"AWS_SECRET_ACCESS_KEY",
			]);
			if (!accessKeyId || !secretAccessKey) return null;
			return {
				accessKeyId,
				secretAccessKey,
				sessionToken: getString(json, [
					"sessionToken",
					"session_token",
					"aws_session_token",
					"AWS_SESSION_TOKEN",
				]),
				region: getString(json, ["region", "aws_region", "AWS_REGION"]),
				baseUrl: getString(json, ["baseUrl", "base_url", "endpoint", "bedrock_endpoint"]),
			};
		} catch {
			return null;
		}
	}

	const firstColon = trimmed.indexOf(":");
	if (firstColon <= 0) return null;
	const secondColon = trimmed.indexOf(":", firstColon + 1);
	const accessKeyId = trimmed.slice(0, firstColon);
	const secretAccessKey = secondColon > firstColon
		? trimmed.slice(firstColon + 1, secondColon)
		: trimmed.slice(firstColon + 1);
	const sessionToken = secondColon > firstColon ? trimmed.slice(secondColon + 1) : undefined;
	if (!accessKeyId || !secretAccessKey) return null;
	return {
		accessKeyId,
		secretAccessKey,
		sessionToken: sessionToken || undefined,
	};
}

function getString(record: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function resolveBedrockAuth(args: ExecutorExecuteArgs): {
	keyInfo: { source: "gateway" | "byok"; byokId: string | null };
	auth: BedrockAuth;
} {
	const bindings = getBindings() as any;
	const keyInfo = resolveProviderKey(args, () => {
		if (typeof bindings.AMAZON_BEDROCK_API_KEY === "string" && bindings.AMAZON_BEDROCK_API_KEY.trim()) {
			return bindings.AMAZON_BEDROCK_API_KEY;
		}
		const accessKeyId = typeof bindings.AWS_ACCESS_KEY_ID === "string" ? bindings.AWS_ACCESS_KEY_ID : "";
		const secretAccessKey = typeof bindings.AWS_SECRET_ACCESS_KEY === "string" ? bindings.AWS_SECRET_ACCESS_KEY : "";
		const sessionToken = typeof bindings.AWS_SESSION_TOKEN === "string" ? bindings.AWS_SESSION_TOKEN : "";
		if (!accessKeyId || !secretAccessKey) return undefined;
		return `${accessKeyId}:${secretAccessKey}${sessionToken ? `:${sessionToken}` : ""}`;
	});

	const rawKey = keyInfo.key.trim();
	if (!rawKey) throw new Error("amazon-bedrock_key_missing");

	const parsed = parseBedrockCredentialMaterial(rawKey);
	const baseUrlRaw = parsed?.baseUrl || bindings.AMAZON_BEDROCK_BASE_URL;
	const region = (
		parsed?.region ||
		bindings.AMAZON_BEDROCK_REGION ||
		bindings.AWS_REGION ||
		extractRegionFromBedrockUrl(baseUrlRaw) ||
		"us-east-1"
	).trim();
	const baseUrl = String(baseUrlRaw || `https://bedrock-runtime.${region}.amazonaws.com`).replace(/\/+$/, "");

	return {
		keyInfo,
		auth: parsed
			? {
				mode: "sigv4",
				region,
				baseUrl,
				credentials: {
					...parsed,
					region,
					baseUrl,
				},
			}
			: {
				mode: "bearer",
				token: rawKey,
				region,
				baseUrl,
			},
	};
}

function extractRegionFromBedrockUrl(value: string | undefined): string | null {
	if (!value) return null;
	const match = value.match(/bedrock-runtime[\.-]([a-z0-9-]+)\.amazonaws\.com/i);
	return match?.[1] ?? null;
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess,
	transformStream,
});
