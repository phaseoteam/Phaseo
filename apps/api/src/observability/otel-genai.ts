import type { Endpoint } from "@core/types";
import type { ProviderAttemptLog } from "@pipeline/before/types";

type TraceContext = {
	traceId: string;
	parentSpanId: string;
	traceFlags: number;
	traceState?: string | null;
};

export type GatewayGenAiTelemetry = {
	requestId: string;
	workspaceId: string;
	keyId?: string | null;
	keyName?: string | null;
	userId?: string | null;
	appId?: string | null;
	appName?: string | null;
	clientSource?: string | null;
	endpoint: Endpoint;
	requestedModel: string;
	provider?: string | null;
	providerModel?: string | null;
	responseModel?: string | null;
	responseId?: string | null;
	requestPayload?: unknown;
	responsePayload?: unknown;
	usage?: Record<string, unknown> | null;
	providerAttempts?: ProviderAttemptLog[] | null;
	stream?: boolean;
	finishReason?: string | null;
	statusCode: number;
	success: boolean;
	errorType?: string | null;
	totalNanos?: number | null;
	currency?: string | null;
	generationMs?: number | null;
	timeToFirstChunkMs?: number | null;
	startedAtMs: number;
	completedAtMs: number;
	traceContext?: TraceContext | null;
	requestMethod?: string | null;
	requestPath?: string | null;
	serverAddress?: string | null;
	serverPort?: number | null;
	sessionId?: string | null;
	edgeColo?: string | null;
};

export type AsyncGenAiTelemetry = {
	requestId: string;
	workspaceId: string;
	operation: "realtime" | "batch";
	phase: "submit" | "session" | "turn" | "finalize" | "settle";
	endpoint: Endpoint;
	model: string;
	provider?: string | null;
	providerModel?: string | null;
	startedAtMs: number;
	completedAtMs: number;
	success: boolean;
	statusCode?: number | null;
	errorType?: string | null;
	usage?: Record<string, unknown> | null;
	costNanos?: number | null;
	currency?: string | null;
	sessionId?: string | null;
	batchId?: string | null;
	requestCount?: number | null;
	completedCount?: number | null;
	failedCount?: number | null;
	traceContext?: TraceContext | null;
	linkContext?: TraceContext | null;
	spanId?: string | null;
	requestPayload?: unknown;
	responsePayload?: unknown;
};

export type GatewayOtlpBuildOptions = {
	includeSensitiveContent: boolean;
	serviceName?: string;
	serviceVersion?: string | null;
	environment?: string | null;
};

type OtlpAttribute = {
	key: string;
	value: Record<string, unknown>;
};

function randomHex(bytes: number): string {
	const output = new Uint8Array(bytes);
	crypto.getRandomValues(output);
	return Array.from(output, (value) => value.toString(16).padStart(2, "0")).join("");
}

function finite(value: unknown): number | null {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function object(value: unknown): Record<string, any> {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, any>
		: {};
}

function anyValue(value: unknown): Record<string, unknown> | null {
	if (typeof value === "string") return { stringValue: value };
	if (typeof value === "boolean") return { boolValue: value };
	if (typeof value === "number" && Number.isFinite(value)) {
		return Number.isInteger(value)
			? { intValue: String(value) }
			: { doubleValue: value };
	}
	if (Array.isArray(value)) {
		const values = value.map(anyValue).filter((entry): entry is Record<string, unknown> => Boolean(entry));
		return values.length ? { arrayValue: { values } } : null;
	}
	return null;
}

function attr(key: string, value: unknown): OtlpAttribute | null {
	if (value === null || value === undefined || value === "") return null;
	const encoded = anyValue(value);
	return encoded ? { key, value: encoded } : null;
}

function boundedJson(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	try {
		const encoded = JSON.stringify(value);
		return encoded.length <= 64_000 ? encoded : `${encoded.slice(0, 63_980)}…[truncated]`;
	} catch {
		return null;
	}
}

function jsonAttribute(key: string, value: unknown): OtlpAttribute | null {
	if (Array.isArray(value) && value.length === 0) return null;
	return attr(key, boundedJson(value));
}

export function normaliseGenAiProvider(provider: unknown): string | null {
	const value = String(provider ?? "").trim().toLowerCase().replaceAll("_", "-");
	const providers: Record<string, string> = {
		"anthropic": "anthropic",
		"aws-bedrock": "aws.bedrock",
		"bedrock": "aws.bedrock",
		"azure-openai": "azure.ai.openai",
		"cohere": "cohere",
		"deepseek": "deepseek",
		"google-ai-studio": "gcp.gemini",
		"gemini": "gcp.gemini",
		"google-vertex": "gcp.vertex_ai",
		"vertex-ai": "gcp.vertex_ai",
		"groq": "groq",
		"mistral": "mistral_ai",
		"mistral-ai": "mistral_ai",
		"openai": "openai",
		"perplexity": "perplexity",
		"x-ai": "x_ai",
		"xai": "x_ai",
	};
	return providers[value] ?? (value || null);
}

export function genAiOperation(endpoint: Endpoint): string {
	switch (endpoint) {
		case "chat.completions":
		case "messages":
			return "chat";
		case "embeddings":
			return "embeddings";
		case "rerank":
			return "retrieval";
		case "decisions":
			return "generate_content";
		case "responses":
		case "images.generations":
		case "images.edits":
		case "audio.speech":
		case "audio.transcription":
		case "audio.translations":
		case "audio.realtime":
		case "video.generation":
		case "music.generate":
		case "ocr":
		case "parse":
			return "generate_content";
		case "moderations":
			return "content_moderation";
		case "batch":
			return "batch";
		default:
			return "generate_content";
	}
}

function outputType(endpoint: Endpoint, request: unknown): string | null {
	if (endpoint.startsWith("images.")) return "image";
	if (endpoint === "audio.speech" || endpoint === "audio.realtime") return "speech";
	if (endpoint === "video.generation") return "video";
	if (object(request).response_format?.type === "json_schema" || object(request).response_format?.type === "json_object") {
		return "json";
	}
	return ["chat.completions", "messages", "responses", "audio.transcription", "audio.translations", "ocr", "parse", "decisions"].includes(endpoint)
		? "text"
		: null;
}

function contentParts(content: unknown): Array<Record<string, unknown>> {
	if (typeof content === "string") return [{ type: "text", content }];
	if (!Array.isArray(content)) return [];
	return content.flatMap((part) => {
		if (typeof part === "string") return [{ type: "text", content: part }];
		const item = object(part);
		const type = String(item.type ?? "");
		if (["text", "input_text", "output_text"].includes(type)) {
			return [{ type: "text", content: String(item.text ?? item.content ?? "") }];
		}
		if (["image_url", "input_image", "image"].includes(type)) {
			return [{ type: "image", uri: object(item.image_url).url ?? item.image_url ?? item.url ?? null }];
		}
		if (["input_audio", "audio"].includes(type)) return [{ type: "audio" }];
		if (["input_video", "video"].includes(type)) return [{ type: "video" }];
		return [];
	});
}

export function normaliseInputMessages(payload: unknown): Array<Record<string, unknown>> {
	const body = object(payload);
	const source = Array.isArray(body.messages)
		? body.messages
		: Array.isArray(body.input)
			? body.input
			: typeof body.input === "string"
				? [{ role: "user", content: body.input }]
				: [];
	return source.flatMap((message: unknown) => {
		const item = object(message);
		const role = String(item.role ?? "user");
		const parts = contentParts(item.content ?? item.text);
		const toolCalls = Array.isArray(item.tool_calls)
			? item.tool_calls.map((call: unknown) => {
					const value = object(call);
					const fn = object(value.function);
					return {
						id: value.id ?? null,
						name: fn.name ?? value.name ?? null,
						arguments: fn.arguments ?? value.arguments ?? null,
					};
				})
			: [];
		return parts.length || toolCalls.length ? [{ role, parts, tool_calls: toolCalls }] : [];
	});
}

export function normaliseOutputMessages(payload: unknown, finishReason?: string | null): Array<Record<string, unknown>> {
	const body = object(payload);
	const choices = Array.isArray(body.choices) ? body.choices : [];
	if (choices.length) {
		return choices.map((choice: unknown) => {
			const value = object(choice);
			const message = object(value.message ?? value.delta);
			return {
				role: String(message.role ?? "assistant"),
				parts: contentParts(message.content),
				finish_reason: value.finish_reason ?? finishReason ?? null,
				tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
			};
		});
	}
	const output = Array.isArray(body.output) ? body.output : [];
	return output.flatMap((item: unknown) => {
		const value = object(item);
		const parts = contentParts(value.content ?? value.text);
		return parts.length ? [{ role: String(value.role ?? "assistant"), parts, finish_reason: finishReason ?? null }] : [];
	});
}

export function normaliseToolDefinitions(payload: unknown): Array<Record<string, unknown>> {
	const tools = object(payload).tools;
	if (!Array.isArray(tools)) return [];
	return tools.map((tool: unknown) => {
		const value = object(tool);
		const fn = object(value.function);
		return {
			type: value.type ?? "function",
			name: fn.name ?? value.name ?? null,
			description: fn.description ?? value.description ?? null,
			parameters: fn.parameters ?? value.input_schema ?? value.parameters ?? null,
		};
	});
}

function usageAttributes(rawUsage: unknown): Array<OtlpAttribute | null> {
	const usage = object(rawUsage);
	return [
		attr("gen_ai.usage.input_tokens", finite(usage.input_tokens ?? usage.prompt_tokens)),
		attr("gen_ai.usage.output_tokens", finite(usage.output_tokens ?? usage.completion_tokens)),
		attr("gen_ai.usage.cache_read.input_tokens", finite(
			usage.cache_read_input_tokens ?? object(usage.input_tokens_details).cached_tokens,
		)),
		attr("gen_ai.usage.cache_creation.input_tokens", finite(usage.cache_creation_input_tokens)),
		attr("gen_ai.usage.reasoning.output_tokens", finite(
			usage.reasoning_output_tokens ?? object(usage.output_tokens_details).reasoning_tokens,
		)),
	];
}

function requestAttributes(args: GatewayGenAiTelemetry): Array<OtlpAttribute | null> {
	const body = object(args.requestPayload);
	const stop = Array.isArray(body.stop) ? body.stop : typeof body.stop === "string" ? [body.stop] : null;
	const encodingFormats = body.encoding_format ? [String(body.encoding_format)] : null;
	return [
		attr("gen_ai.operation.name", genAiOperation(args.endpoint)),
		attr("gen_ai.provider.name", normaliseGenAiProvider(args.provider)),
		attr("gen_ai.request.model", args.providerModel ?? args.requestedModel),
		attr("gen_ai.request.choice.count", finite(body.n ?? body.candidate_count)),
		attr("gen_ai.request.frequency_penalty", finite(body.frequency_penalty)),
		attr("gen_ai.request.max_tokens", finite(body.max_tokens ?? body.max_output_tokens ?? body.max_completion_tokens)),
		attr("gen_ai.request.presence_penalty", finite(body.presence_penalty)),
		attr("gen_ai.request.seed", finite(body.seed)),
		attr("gen_ai.request.stop_sequences", stop),
		attr("gen_ai.request.stream", args.stream),
		attr("gen_ai.request.temperature", finite(body.temperature)),
		attr("gen_ai.request.top_k", finite(body.top_k)),
		attr("gen_ai.request.top_p", finite(body.top_p)),
		attr("gen_ai.request.encoding_formats", encodingFormats),
		attr("gen_ai.output.type", outputType(args.endpoint, args.requestPayload)),
		attr("gen_ai.response.id", args.responseId),
		attr("gen_ai.response.model", args.responseModel ?? args.providerModel),
		attr("gen_ai.response.finish_reasons", args.finishReason ? [args.finishReason] : null),
		attr(
			"gen_ai.response.time_to_first_chunk",
			args.timeToFirstChunkMs === null || args.timeToFirstChunkMs === undefined
				? null
				: args.timeToFirstChunkMs / 1_000,
		),
		attr("gen_ai.conversation.id", args.sessionId),
		...usageAttributes(args.usage),
	];
}

function sensitiveAttributes(args: GatewayGenAiTelemetry): Array<OtlpAttribute | null> {
	const body = object(args.requestPayload);
	const system = body.instructions ?? body.system;
	return [
		jsonAttribute("gen_ai.input.messages", normaliseInputMessages(args.requestPayload)),
		jsonAttribute("gen_ai.output.messages", normaliseOutputMessages(args.responsePayload, args.finishReason)),
		jsonAttribute("gen_ai.system_instructions", system ? [{ type: "text", content: system }] : null),
		jsonAttribute("gen_ai.tool.definitions", normaliseToolDefinitions(args.requestPayload)),
	];
}

function commonPhaseoAttributes(args: GatewayGenAiTelemetry): Array<OtlpAttribute | null> {
	return [
		attr("phaseo.request.id", args.requestId),
		attr("phaseo.workspace.id", args.workspaceId),
		attr("phaseo.api_key.id", args.keyId),
		attr("phaseo.api_key.name", args.keyName),
		attr("user.id", args.userId),
		attr("phaseo.app.id", args.appId),
		attr("phaseo.app.name", args.appName),
		attr("phaseo.client.source", args.clientSource),
		attr("phaseo.endpoint", args.endpoint),
		attr("phaseo.requested_model", args.requestedModel),
		attr("phaseo.cost.nanos", args.totalNanos),
		attr("phaseo.cost.currency", args.currency),
		attr("phaseo.generation.duration_ms", args.generationMs),
		attr("phaseo.edge.colo", args.edgeColo),
	];
}

function safeHost(input: unknown): string | null {
	if (typeof input !== "string") return null;
	try {
		return new URL(input).hostname;
	} catch {
		return null;
	}
}

function nanos(milliseconds: number): string {
	return String(BigInt(Math.max(0, Math.round(milliseconds))) * 1_000_000n);
}

function status(success: boolean, message?: string | null) {
	return success ? { code: 0 } : { code: 2, ...(message ? { message } : {}) };
}

function serverStatus(statusCode: number, message?: string | null) {
	return statusCode >= 500 ? status(false, message) : status(true);
}

function resourceSpans(
	spans: Array<Record<string, unknown>>,
	options: GatewayOtlpBuildOptions,
) {
	return {
		resourceSpans: [{
			resource: {
				attributes: [
					attr("service.name", options.serviceName ?? "phaseo-gateway"),
					attr("service.namespace", "phaseo"),
					attr("service.version", options.serviceVersion),
					attr("deployment.environment.name", options.environment),
					attr("phaseo.telemetry.schema", "otel-genai-v1"),
				].filter((entry): entry is OtlpAttribute => Boolean(entry)),
			},
			scopeSpans: [{
				scope: { name: "phaseo.gateway.gen_ai", version: "1.0.0" },
				schemaUrl: "https://opentelemetry.io/schemas/gen-ai/1.42.0",
				spans,
			}],
		}],
	};
}

function attemptSpans(
	args: GatewayGenAiTelemetry,
	traceId: string,
	parentSpanId: string,
	includeSensitiveContent: boolean,
) {
	const attempts = args.providerAttempts ?? [];
	let cursor = args.startedAtMs;
	return attempts.map((attempt) => {
		const duration = Math.max(0, finite(attempt.duration_ms) ?? 0);
		const start = finite(attempt.started_at_unix_ms) ?? cursor;
		cursor = Math.max(cursor, start + duration);
		const attemptArgs: GatewayGenAiTelemetry = {
			...args,
			provider: attempt.provider,
			providerModel: attempt.provider_model_slug ?? attempt.model,
			statusCode: attempt.status ?? (attempt.outcome === "success" ? 200 : 500),
			success: attempt.outcome === "success",
		};
		const attributes = [
			...requestAttributes(attemptArgs),
			...commonPhaseoAttributes(args),
			attr("phaseo.provider.attempt_number", attempt.attempt_number),
			attr("phaseo.provider.outcome", attempt.outcome),
			attr("phaseo.provider.retryable", attempt.retryable ?? null),
			attr("phaseo.provider.key_source", attempt.key_source ?? null),
			attr("server.address", safeHost(attempt.upstream_url)),
			attr("http.response.status_code", attempt.status ?? null),
			attr("error.type", attempt.outcome === "success"
				? null
				: attempt.upstream_error_type ?? attempt.upstream_error_code ?? attempt.outcome),
			...(includeSensitiveContent ? sensitiveAttributes(args) : []),
		].filter((entry): entry is OtlpAttribute => Boolean(entry));
		return {
			traceId,
			spanId: randomHex(8),
			parentSpanId,
			flags: args.traceContext?.traceFlags ?? 1,
			name: `${genAiOperation(args.endpoint)} ${attempt.provider_model_slug ?? args.requestedModel}`,
			kind: 3,
			startTimeUnixNano: nanos(start),
			endTimeUnixNano: nanos(start + duration),
			attributes,
			status: status(attempt.outcome === "success", attempt.upstream_error_message ?? attempt.outcome),
		};
	});
}

export function buildGatewayGenAiOtlpPayload(
	args: GatewayGenAiTelemetry,
	options: GatewayOtlpBuildOptions,
) {
	const traceId = args.traceContext?.traceId ?? randomHex(16);
	const serverSpanId = randomHex(8);
	const urlPath = args.requestPath ?? `/v1/${args.endpoint.replaceAll(".", "/")}`;
	const serverAttributes = [
		attr("http.request.method", args.requestMethod ?? "POST"),
		attr("http.route", urlPath),
		attr("http.response.status_code", args.statusCode),
		attr("server.address", args.serverAddress ?? "api.phaseo.app"),
		attr("server.port", args.serverPort),
		attr("error.type", args.success ? null : args.errorType ?? String(args.statusCode)),
		...commonPhaseoAttributes(args),
	].filter((entry): entry is OtlpAttribute => Boolean(entry));
	const spans: Array<Record<string, unknown>> = [{
		traceId,
		spanId: serverSpanId,
		...(args.traceContext?.parentSpanId ? { parentSpanId: args.traceContext.parentSpanId } : {}),
		...(args.traceContext?.traceState ? { traceState: args.traceContext.traceState } : {}),
		flags: args.traceContext?.traceFlags ?? 1,
		name: `${args.requestMethod ?? "POST"} ${urlPath}`,
		kind: 2,
		startTimeUnixNano: nanos(args.startedAtMs),
		endTimeUnixNano: nanos(args.completedAtMs),
		attributes: serverAttributes,
		status: serverStatus(args.statusCode, args.success ? null : `HTTP ${args.statusCode}`),
	}, ...attemptSpans(args, traceId, serverSpanId, options.includeSensitiveContent)];
	if (spans.length === 1) {
		spans.push({
			traceId,
			spanId: randomHex(8),
			parentSpanId: serverSpanId,
			flags: args.traceContext?.traceFlags ?? 1,
			name: `${genAiOperation(args.endpoint)} ${args.providerModel ?? args.requestedModel}`,
			kind: 3,
			startTimeUnixNano: nanos(args.startedAtMs),
			endTimeUnixNano: nanos(args.completedAtMs),
			attributes: [
				...requestAttributes(args),
				...commonPhaseoAttributes(args),
				attr("error.type", args.success ? null : args.errorType ?? String(args.statusCode)),
				...(options.includeSensitiveContent ? sensitiveAttributes(args) : []),
			].filter((entry): entry is OtlpAttribute => Boolean(entry)),
			status: status(args.success, args.success ? null : `HTTP ${args.statusCode}`),
		});
	}
	return resourceSpans(spans, options);
}

export function buildAsyncGenAiOtlpPayload(
	args: AsyncGenAiTelemetry,
	options: GatewayOtlpBuildOptions,
) {
	const inherited = args.traceContext;
	const traceId = inherited?.traceId ?? randomHex(16);
	const spanId = args.spanId ?? randomHex(8);
	const operation = genAiOperation(args.endpoint);
	const isSubmission = args.phase === "submit";
	const isDeferred = args.phase === "finalize" || args.phase === "settle";
	const spanKind = isSubmission ? 4 : isDeferred ? 5 : args.phase === "turn" ? 3 : 1;
	const attributes = [
		attr("gen_ai.operation.name", operation),
		attr("gen_ai.provider.name", normaliseGenAiProvider(args.provider)),
		attr("gen_ai.request.model", args.providerModel ?? args.model),
		attr("gen_ai.conversation.id", args.sessionId),
		attr("gen_ai.request.stream", args.operation === "realtime" ? true : null),
		attr("gen_ai.output.type", args.operation === "realtime" ? "speech" : null),
		...usageAttributes(args.usage),
		attr("phaseo.request.id", args.requestId),
		attr("phaseo.workspace.id", args.workspaceId),
		attr("phaseo.async.operation", args.operation),
		attr("phaseo.async.phase", args.phase),
		attr("phaseo.realtime.session.id", args.sessionId),
		attr("phaseo.batch.id", args.batchId),
		attr("phaseo.batch.request_count", args.requestCount),
		attr("phaseo.batch.completed_count", args.completedCount),
		attr("phaseo.batch.failed_count", args.failedCount),
		attr("phaseo.cost.nanos", args.costNanos),
		attr("phaseo.cost.currency", args.currency),
		attr("http.response.status_code", args.statusCode),
		attr("error.type", args.success ? null : args.errorType ?? "_OTHER"),
		...(options.includeSensitiveContent
			? [
					jsonAttribute("gen_ai.input.messages", normaliseInputMessages(args.requestPayload)),
					jsonAttribute("gen_ai.output.messages", normaliseOutputMessages(args.responsePayload)),
				]
			: []),
	].filter((entry): entry is OtlpAttribute => Boolean(entry));
	const links = args.linkContext
		? [{
				traceId: args.linkContext.traceId,
				spanId: args.linkContext.parentSpanId,
				flags: args.linkContext.traceFlags,
				...(args.linkContext.traceState ? { traceState: args.linkContext.traceState } : {}),
			}]
		: [];
	const span = {
		traceId,
		spanId,
		...(inherited?.parentSpanId && !isDeferred ? { parentSpanId: inherited.parentSpanId } : {}),
		...(inherited?.traceState ? { traceState: inherited.traceState } : {}),
		flags: inherited?.traceFlags ?? 1,
		name: `${args.operation}.${args.phase} ${args.model}`,
		kind: spanKind,
		startTimeUnixNano: nanos(args.startedAtMs),
		endTimeUnixNano: nanos(args.completedAtMs),
		attributes,
		...(links.length ? { links } : {}),
		status: status(args.success, args.success ? null : args.errorType),
	};
	return {
		payload: resourceSpans([span], options),
		context: {
			traceId,
			parentSpanId: spanId,
			traceFlags: inherited?.traceFlags ?? 1,
			traceState: inherited?.traceState ?? null,
		},
	};
}
