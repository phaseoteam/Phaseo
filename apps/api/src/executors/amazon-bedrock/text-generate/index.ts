// Purpose: Executor for amazon-bedrock / text-generate.
// Why: Uses Bedrock native Converse API and maps via IR.
// How: IR -> Converse payload, Converse response -> IR, then protocol shaping is handled by the pipeline.

import type { IRChatRequest, IRChatResponse, IRChoice, IRContentPart, IRToolCall } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, Bill } from "@executors/types";
import { buildTextExecutor, cherryPickIRParams } from "@executors/_shared/text-generate/shared";
import { resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { createSyntheticResponsesStreamFromIR } from "@executors/_shared/text-generate/synthetic-responses-stream";
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
	const upstreamStartMs = args.meta.upstreamStartMs ?? Date.now();
	const { keyInfo, auth } = resolveBedrockAuth(args);

	const requestPayload = irToBedrockConverse(irRequest, args.maxOutputTokens);
	const requestBody = JSON.stringify(requestPayload);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest) ? requestBody : undefined;

	const url = `${auth.baseUrl.replace(/\/+$/, "")}/model/${encodeURIComponent(model)}/converse`;
	const requestHeaders = auth.mode === "sigv4"
		? await signAwsV4Request({
			method: "POST",
			url,
			body: requestBody,
			region: auth.region,
			service: "bedrock",
			accessKeyId: auth.credentials.accessKeyId,
			secretAccessKey: auth.credentials.secretAccessKey,
			sessionToken: auth.credentials.sessionToken,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
		})
		: {
			Authorization: `Bearer ${auth.token}`,
			"Content-Type": "application/json",
			Accept: "application/json",
		};

	const res = await fetch(url, {
		method: "POST",
		headers: requestHeaders,
		body: requestBody,
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
		rawResponse: json,
		timing: {
			latencyMs: typeof json?.metrics?.latencyMs === "number" ? json.metrics.latencyMs : undefined,
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

function irToBedrockConverse(ir: IRChatRequest, providerMaxOutputTokens?: number | null): any {
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
			messages.push({
				role: "user",
				content: msg.content.map(mapIRContentToBedrockContent),
			});
			continue;
		}

		if (msg.role === "assistant") {
			const content: any[] = [];
			for (const part of msg.content) {
				content.push(mapIRContentToBedrockContent(part));
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

function mapIRContentToBedrockContent(part: IRContentPart): any {
	if (part.type === "text") return { text: part.text };
	if (part.type === "reasoning_text") return { text: part.text };
	if (part.type === "image" && part.source === "data") {
		return {
			image: {
				format: imageFormatFromMime(part.mimeType),
				source: { bytes: part.data },
			},
		};
	}
	if (part.type === "audio") {
		return { text: `[audio:${part.format || "wav"}]` };
	}
	if (part.type === "video") {
		return { text: `[video:${part.url}]` };
	}
	if (part.type === "image" && part.source === "url") {
		return { text: `[image:${part.data}]` };
	}
	return { text: String(part) };
}

function imageFormatFromMime(mimeType?: string): string {
	const value = (mimeType || "image/jpeg").toLowerCase();
	if (value.includes("png")) return "png";
	if (value.includes("gif")) return "gif";
	if (value.includes("webp")) return "webp";
	return "jpeg";
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
