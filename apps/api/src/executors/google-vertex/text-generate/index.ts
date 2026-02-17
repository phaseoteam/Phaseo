// Purpose: Executor for google-vertex / text-generate.
// Why: Uses Vertex native endpoints with model-family-specific converters.
// How: IR -> provider-specific Vertex payload -> IR, with protocol conversion handled downstream.

import type { IRChatRequest, IRChatResponse, IRContentPart, IRChoice } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, Bill } from "@executors/types";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { createSyntheticResponsesStreamFromIR } from "@executors/_shared/text-generate/synthetic-responses-stream";
import { irToAnthropicMessages, anthropicMessagesToIR } from "@executors/anthropic/text-generate";
import { irToOpenAIChat, openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { transformStream as transformGoogleGeminiStream } from "@executors/google-ai-studio/text-generate";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { computeBill } from "@pipeline/pricing/engine";
import { resolveProviderKey } from "@providers/keys";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";
import { getBindings } from "@/runtime/env";
import { withNormalizedReasoning } from "@executors/google/text-generate/normalize-reasoning";
import { irPartsToGeminiParts } from "@executors/google/shared/media";
import type { ProviderExecutor } from "../../types";

type VertexServiceAccount = {
	client_email: string;
	private_key: string;
	token_uri?: string;
};

type VertexModelRoute = {
	family: "anthropic" | "gemini" | "openapi_chat";
	modelForPath: string;
	modelForPayload: string;
};

export function preprocess(ir: IRChatRequest, args: ExecutorExecuteArgs): IRChatRequest {
	return cherryPickIRParams(ir, args.capabilityParams);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const irRequest = args.ir as IRChatRequest;
	const model = args.providerModelSlug ?? irRequest.model;
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();
	const bindings = getBindings() as any;
	const keyInfo = resolveProviderKey(args, () =>
		bindings.GOOGLE_VERTEX_ACCESS_TOKEN || bindings.GOOGLE_VERTEX_API_KEY,
	);
	const accessToken = await resolveVertexAccessToken(keyInfo.key);
	const apiBase = resolveVertexApiBase(bindings);
	const route = resolveVertexModelRoute(model);

	let payload: any;
	let endpoint: string;

	if (route.family === "anthropic") {
		payload = irToAnthropicMessages(irRequest, args.maxOutputTokens);
		payload.anthropic_version = "vertex-2023-10-16";
		endpoint = `${apiBase}/publishers/anthropic/models/${encodeURIComponent(route.modelForPath)}:rawPredict`;
	} else if (route.family === "gemini") {
		const normalizedIr = withNormalizedReasoning(irRequest, args.capabilityParams, route.modelForPath);
		payload = await irToGemini(normalizedIr, route.modelForPath);
		endpoint = irRequest.stream
			? `${apiBase}/publishers/google/models/${encodeURIComponent(route.modelForPath)}:streamGenerateContent?alt=sse`
			: `${apiBase}/publishers/google/models/${encodeURIComponent(route.modelForPath)}:generateContent`;
	} else {
		payload = irToOpenAIChat(irRequest, route.modelForPayload, args.providerId, args.capabilityParams);
		payload.stream = Boolean(irRequest.stream);
		if (payload.stream === true) {
			payload.stream_options = {
				...(payload.stream_options ?? {}),
				include_usage: true,
			};
		}
		endpoint = `${apiBase}/endpoints/openapi/chat/completions`;
	}

	const requestBody = JSON.stringify(payload);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;

	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: requestBody,
	});

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

	if (irRequest.stream && res.body) {
		if (route.family === "gemini") {
			const stream = transformGoogleGeminiStream(res.body, args);
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

		if (route.family === "openapi_chat") {
			const stream = resolveStreamForProtocol(
				new Response(res.body, {
					status: res.status,
					headers: res.headers,
				}),
				args,
				"chat",
			);
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
	}

	const json = await res.json();
	let ir: IRChatResponse;
	if (route.family === "anthropic") {
		ir = anthropicMessagesToIR(json, args.requestId, model, args.providerId);
	} else if (route.family === "gemini") {
		ir = geminiToIR(json, args.requestId, model, args.providerId);
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
		upstreamStartMs,
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
			stream: normalized,
			usageFinalizer: async () => null,
			bill,
			upstream: res,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			timing: {
				latencyMs: Date.now() - upstreamStartMs,
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

function resolveVertexApiBase(bindings: Record<string, any>): string {
	const rawBase = String(bindings.GOOGLE_VERTEX_BASE_URL || "").replace(/\/+$/, "");
	const project = String(bindings.GOOGLE_VERTEX_PROJECT || "").trim();
	const location = String(bindings.GOOGLE_VERTEX_LOCATION || "").trim() || "us-east5";

	if (rawBase) {
		if (/\/v\d+(?:beta\d+)?\/projects\/[^/]+\/locations\/[^/]+$/i.test(rawBase)) {
			return rawBase;
		}
		if (!project) throw new Error("google-vertex_project_missing");
		if (/\/v\d+(?:beta\d+)?$/i.test(rawBase)) {
			return `${rawBase}/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
		}
		return `${rawBase}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
	}

	if (!project) throw new Error("google-vertex_project_missing");
	return `https://${encodeURIComponent(location)}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
}

export async function irToGemini(ir: IRChatRequest, modelOverride?: string | null): Promise<any> {
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
			const parts = await irPartsToGeminiParts(msg.content, { preserveReasoningAsThought: true });
			systemInstructionParts.push(...parts);
			continue;
		}
		if (msg.role === "user") {
			contents.push({
				role: "user",
				parts: await irPartsToGeminiParts(msg.content, { preserveReasoningAsThought: true }),
			});
			continue;
		}
		if (msg.role === "assistant") {
			contents.push({
				role: "model",
				parts: await irPartsToGeminiParts(msg.content, { preserveReasoningAsThought: true }),
			});
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
				contents.push({
					role: "user",
					parts: [{
						functionResponse: {
							name: toolNamesById.get(toolResult.toolCallId) ?? toolResult.toolCallId,
							response: responsePayload,
						},
					}],
				});
			}
		}
	}

	const request: any = { contents };

	const generationConfig: any = {};
	if (ir.temperature !== undefined) generationConfig.temperature = ir.temperature;
	if (ir.maxTokens !== undefined) generationConfig.maxOutputTokens = ir.maxTokens;
	if (ir.topP !== undefined) generationConfig.topP = ir.topP;
	if (ir.topK !== undefined) generationConfig.topK = ir.topK;
	if (ir.stop) generationConfig.stopSequences = Array.isArray(ir.stop) ? ir.stop : [ir.stop];

	if (ir.reasoning?.enabled || ir.reasoning?.effort || (ir.reasoning?.maxTokens !== undefined)) {
		const thinkingConfig: any = { includeThoughts: true };
		const modelName = modelOverride ?? ir.model;
		const isGemini3 = typeof modelName === "string" && modelName.startsWith("gemini-3");
		if (ir.reasoning?.effort && isGemini3) {
			const levelMap: Record<string, string> = {
				minimal: "MINIMAL",
				low: "LOW",
				medium: "MEDIUM",
				high: "HIGH",
				xhigh: "HIGH",
			};
			thinkingConfig.thinkingLevel = levelMap[ir.reasoning.effort] || "HIGH";
		} else if (ir.reasoning?.maxTokens !== undefined) {
			thinkingConfig.thinkingBudget = ir.reasoning.maxTokens;
		} else if (ir.reasoning?.enabled) {
			if (isGemini3) {
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
		generationConfig.responseSchema = ir.responseFormat.schema;

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
				parameters: tool.parameters,
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

		if (candidate.content?.parts) {
			for (const part of candidate.content.parts) {
				const inlineData = normalizeGeminiInlineData(part);
				if (part.text) {
					if (part.thought) {
						contentParts.push({
							type: "reasoning_text",
							text: part.text,
							thoughtSignature: part.thought_signature,
							summary: part.thought_summary,
						} as any);
					} else {
						contentParts.push({ type: "text", text: part.text });
					}
				} else if (inlineData?.data) {
					contentParts.push({
						type: "image",
						source: "data",
						data: inlineData.data,
						mimeType: inlineData.mime_type,
						thoughtSignature: inlineData.thought_signature,
					});
				} else if (part.functionCall) {
					toolCalls.push({
						id: part.functionCall.name,
						name: part.functionCall.name,
						arguments: JSON.stringify(part.functionCall.args || {}),
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
		case "SAFETY":
		case "RECITATION":
		case "PROHIBITED_CONTENT":
		case "SPII":
		case "BLOCKLIST":
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

async function resolveVertexAccessToken(rawKey: string): Promise<string> {
	const value = rawKey.trim();
	if (!value) throw new Error("google-vertex_access_token_missing");

	if (value.startsWith("{")) {
		try {
			const parsed = JSON.parse(value) as Record<string, unknown>;
			if (isVertexServiceAccount(parsed)) {
				return mintServiceAccountAccessToken(parsed);
			}
			const token = typeof parsed.access_token === "string" ? parsed.access_token.trim() : "";
			if (token) return token;
		} catch {
			// Continue with plain token handling.
		}
	}

	if (value.startsWith("Bearer ")) {
		return value.slice("Bearer ".length).trim();
	}
	return value;
}

function isVertexServiceAccount(payload: Record<string, unknown>): payload is VertexServiceAccount {
	return (
		typeof payload.client_email === "string" &&
		typeof payload.private_key === "string"
	);
}

async function mintServiceAccountAccessToken(sa: VertexServiceAccount): Promise<string> {
	const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: "RS256", typ: "JWT" };
	const claimSet = {
		iss: sa.client_email,
		sub: sa.client_email,
		aud: tokenUri,
		scope: "https://www.googleapis.com/auth/cloud-platform",
		iat: now,
		exp: now + 3600,
	};

	const encodedHeader = base64UrlEncodeUtf8(JSON.stringify(header));
	const encodedClaims = base64UrlEncodeUtf8(JSON.stringify(claimSet));
	const unsignedJwt = `${encodedHeader}.${encodedClaims}`;
	const signature = await signJwtRs256(unsignedJwt, sa.private_key);
	const assertion = `${unsignedJwt}.${signature}`;

	const body = new URLSearchParams({
		grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
		assertion,
	});

	const res = await fetch(tokenUri, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});

	if (!res.ok) {
		throw new Error(`google-vertex_oauth_error_${res.status}`);
	}
	const json = await res.json() as { access_token?: string };
	if (!json?.access_token) {
		throw new Error("google-vertex_oauth_access_token_missing");
	}
	return json.access_token;
}

async function signJwtRs256(unsignedJwt: string, privateKeyPem: string): Promise<string> {
	const pem = privateKeyPem.replace(/\\n/g, "\n");
	const keyData = pemToArrayBuffer(pem);
	const key = await crypto.subtle.importKey(
		"pkcs8",
		keyData,
		{
			name: "RSASSA-PKCS1-v1_5",
			hash: "SHA-256",
		},
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		key,
		new TextEncoder().encode(unsignedJwt),
	);
	return base64UrlEncodeBytes(new Uint8Array(signature));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
	const base64 = pem
		.replace(/-----BEGIN PRIVATE KEY-----/g, "")
		.replace(/-----END PRIVATE KEY-----/g, "")
		.replace(/\s+/g, "");
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

function base64UrlEncodeUtf8(value: string): string {
	return base64UrlFromBase64(btoa(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 1) {
		binary += String.fromCharCode(bytes[i]);
	}
	return base64UrlFromBase64(btoa(binary));
}

function base64UrlFromBase64(value: string): string {
	return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export const executor: ProviderExecutor = buildTextExecutor({
	preprocess,
	execute,
	postprocess,
	transformStream,
});
