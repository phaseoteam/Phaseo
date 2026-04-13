import type { IRChatResponse, IRChoice, IRContentPart, IRToolCall } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";

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

type BedrockStreamEvent = {
	type: string;
	data: any;
};
export function createBedrockConverseToChatStream(
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

export function detectBedrockStreamMode(chunk: Uint8Array<ArrayBufferLike>): "aws-eventstream" | "text" {
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

export function parseAwsEventStreamFrames(buffer: Uint8Array<ArrayBufferLike>): {
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

export function parseAwsEventStreamHeaders(headersBytes: Uint8Array<ArrayBufferLike>): Record<string, string> {
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

export function parseBedrockTextEvents(text: string): { events: BedrockStreamEvent[]; rest: string } {
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

export function normalizeBedrockStreamEvent(eventType: string, payload: any): BedrockStreamEvent | null {
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

export function extractBedrockReasoningDelta(delta: any): { text?: string } {
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

export function extractBedrockToolArgsDelta(delta: any): string | null {
	if (!delta || typeof delta !== "object") return null;
	const toolUse = delta?.toolUse ?? delta?.tool_use;
	if (!toolUse || typeof toolUse !== "object") return null;

	if (typeof toolUse?.input === "string") return toolUse.input;
	if (typeof toolUse?.inputJson === "string") return toolUse.inputJson;
	if (typeof toolUse?.partialJson === "string") return toolUse.partialJson;
	return null;
}

export function extractBedrockToolInputInitial(toolUse: any): string {
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

export function mapBedrockStopReasonToOpenAI(stopReason: string | undefined): IRChoice["finishReason"] {
	const reason = String(stopReason || "").toLowerCase();
	if (reason === "max_tokens") return "length";
	if (reason === "tool_use") return "tool_calls";
	if (reason === "guardrail_intervened" || reason === "content_filtered") return "content_filter";
	return "stop";
}

export function shouldFallbackToConverseFromError(status: number): boolean {
	return status === 404 || status === 405 || status === 406 || status === 415 || status === 501;
}

export function bedrockUsageToOpenAIUsage(usage: any): any {
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

export function concatUint8Arrays(
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

export function readUint32BE(bytes: Uint8Array<ArrayBufferLike>, offset: number): number {
	return (
		((bytes[offset] ?? 0) << 24) |
		((bytes[offset + 1] ?? 0) << 16) |
		((bytes[offset + 2] ?? 0) << 8) |
		(bytes[offset + 3] ?? 0)
	) >>> 0;
}

export function readUint16BE(bytes: Uint8Array<ArrayBufferLike>, offset: number): number {
	return (((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)) >>> 0;
}

export function bedrockConverseToIR(
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

export function parseJson(value: string): any {
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

export async function signAwsV4Request(args: SignRequestArgs): Promise<Record<string, string>> {
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

export async function getAwsSigningKey(
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

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return toHex(new Uint8Array(digest));
}

export async function hmacSha256(key: string | Uint8Array, value: string): Promise<Uint8Array> {
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

export function toAmzDate(date: Date): string {
	const yyyy = String(date.getUTCFullYear());
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const hh = String(date.getUTCHours()).padStart(2, "0");
	const mi = String(date.getUTCMinutes()).padStart(2, "0");
	const ss = String(date.getUTCSeconds()).padStart(2, "0");
	return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

export function normalizePath(pathname: string): string {
	if (!pathname) return "/";
	return pathname.split("/").map((segment) => encodeRfc3986(decodeSegment(segment))).join("/");
}

export function normalizeQuery(searchParams: URLSearchParams): string {
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

export function encodeRfc3986(value: string): string {
	return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
		`%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

export function decodeSegment(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseBedrockCredentialMaterial(value: string | undefined): BedrockCredentials | null {
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

export function getString(record: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

export function resolveBedrockAuth(args: ExecutorExecuteArgs): {
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

export function extractRegionFromBedrockUrl(value: string | undefined): string | null {
	if (!value) return null;
	const match = value.match(/bedrock-runtime[\.-]([a-z0-9-]+)\.amazonaws\.com/i);
	return match?.[1] ?? null;
}
