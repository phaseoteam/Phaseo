import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { tieredRead } from "@core/tiered-cache";
import { decryptWebhookSecret, validateWebhookEndpointUrlForDelivery } from "@core/webhook-endpoints";
import {
	buildAsyncGenAiOtlpPayload,
	buildGatewayGenAiOtlpPayload,
	type AsyncGenAiTelemetry,
	type GatewayGenAiTelemetry,
	type GatewayOtlpBuildOptions,
} from "./otel-genai";

type Rule = { field: string; condition: string; value: string | null };
type Destination = {
	id: string;
	destination_id: "otel_collector" | "webhook";
	destination_config: Record<string, unknown> | null;
	destination_config_ciphertext?: string | null;
	destination_config_iv?: string | null;
	destination_config_key_version?: string | null;
	privacy_exclude_prompts_and_outputs?: boolean | null;
	sampling_rate?: number | string | null;
	group_join_operator?: "and" | "or" | null;
	include_generation_metadata?: boolean | null;
	include_cost_metadata?: boolean | null;
	include_identity_metadata?: boolean | null;
	include_request_context?: boolean | null;
	broadcast_destination_keys?: Array<{ key_id: string; filter_mode?: "include" | "exclude" | null }> | null;
	broadcast_destination_rule_groups?: Array<{
		match_operator?: "and" | "or" | null;
		broadcast_destination_rules?: Rule[] | null;
	}> | null;
};
type OutboxRow = {
	id: string;
	destination_id: string;
	payload: unknown;
	attempts: number;
};

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_ATTEMPTS = 8;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function object(value: unknown): Record<string, any> {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, any>
		: {};
}

function finite(value: unknown): number | null {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function stableSample(eventId: string, destinationId: string, rate: number): boolean {
	if (rate >= 1) return true;
	if (rate <= 0) return false;
	let hash = 2166136261;
	for (const char of `${eventId}:${destinationId}`) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0x1_0000_0000 < rate;
}

function usageValues(rawUsage: unknown) {
	const raw = object(rawUsage);
	const input = finite(raw.input_tokens ?? raw.prompt_tokens);
	const output = finite(raw.output_tokens ?? raw.completion_tokens);
	return {
		input,
		output,
		total: finite(raw.total_tokens) ?? ((input ?? 0) + (output ?? 0)),
	};
}

function ruleValues(args: GatewayGenAiTelemetry): Record<string, unknown> {
	const tokens = usageValues(args.usage);
	return {
		model: args.requestedModel,
		provider: args.provider,
		session_id: args.sessionId,
		user_id: args.userId,
		api_key_name: args.keyName,
		finish_reason: args.finishReason,
		input: JSON.stringify(args.requestPayload ?? null).slice(0, 16_000),
		output: JSON.stringify(args.responsePayload ?? null).slice(0, 16_000),
		token_cost: tokens.total > 0 && args.totalNanos != null ? args.totalNanos / tokens.total : null,
		total_cost: args.totalNanos,
		total_tokens: tokens.total,
		prompt_tokens: tokens.input,
		completion_tokens: tokens.output,
	};
}

function matchRule(rule: Rule, values: Record<string, unknown>): boolean {
	const raw = values[rule.field];
	const actual = raw === null || raw === undefined ? "" : String(raw);
	const expected = rule.value ?? "";
	switch (rule.condition) {
		case "equals": return actual === expected;
		case "not_equals": return actual !== expected;
		case "contains": return actual.includes(expected);
		case "not_contains": return !actual.includes(expected);
		case "starts_with": return actual.startsWith(expected);
		case "ends_with": return actual.endsWith(expected);
		case "exists": return actual !== "";
		case "not_exists": return actual === "";
		case "matches_regex":
			if (expected.length > 128 || actual.length > 2_000) return false;
			try {
				return new RegExp(expected).test(actual);
			} catch {
				return false;
			}
		default: return false;
	}
}

export function selected(destination: Destination, args: GatewayGenAiTelemetry, eventId: string): boolean {
	const keys = destination.broadcast_destination_keys ?? [];
	if (keys.length) {
		const included = keys.filter((entry) => entry.filter_mode !== "exclude");
		const excluded = keys.filter((entry) => entry.filter_mode === "exclude");
		if (included.length && !included.some((entry) => entry.key_id === args.keyId)) return false;
		if (excluded.some((entry) => entry.key_id === args.keyId)) return false;
	}
	const rate = Math.max(0, Math.min(1, finite(destination.sampling_rate) ?? 1));
	if (!stableSample(args.sessionId ?? eventId, destination.id, rate)) return false;
	const groups = destination.broadcast_destination_rule_groups ?? [];
	if (!groups.length) return true;
	const values = ruleValues(args);
	const matches = groups.map((group) => {
		const rules = group.broadcast_destination_rules ?? [];
		if (!rules.length) return true;
		const results = rules.map((rule) => matchRule(rule, values));
		return group.match_operator === "or" ? results.some(Boolean) : results.every(Boolean);
	});
	return destination.group_join_operator === "and" ? matches.every(Boolean) : matches.some(Boolean);
}

function buildOptions(destination: Destination): GatewayOtlpBuildOptions {
	const bindings = getBindings();
	return {
		includeSensitiveContent: destination.privacy_exclude_prompts_and_outputs !== true,
		serviceName: "phaseo-gateway",
		serviceVersion: bindings.NEXT_PUBLIC_GATEWAY_VERSION ?? null,
		environment: bindings.NODE_ENV ?? null,
	};
}

// Looked up for every request, and empty for almost every workspace. Rows hold
// encrypted destination configs, so they stay in isolate memory only; edits
// apply within about a minute.
const DESTINATIONS_CACHE_FRESH_MS = 60_000;

async function destinations(workspaceId: string): Promise<Destination[]> {
	return (await tieredRead<Destination[]>({
		key: `otlp-destinations:${workspaceId}`,
		loader: () => loadDestinations(workspaceId),
		l1FreshMs: DESTINATIONS_CACHE_FRESH_MS,
		l2: false,
		l3: false,
	})) ?? [];
}

async function loadDestinations(workspaceId: string): Promise<Destination[]> {
	const { data, error } = await getSupabaseAdmin()
		.from("workspace_broadcast_destinations")
		.select(`
			id,destination_id,destination_config,destination_config_ciphertext,destination_config_iv,destination_config_key_version,privacy_exclude_prompts_and_outputs,sampling_rate,group_join_operator,include_generation_metadata,include_cost_metadata,include_identity_metadata,include_request_context,
			broadcast_destination_keys(key_id,filter_mode),
			broadcast_destination_rule_groups(match_operator,broadcast_destination_rules(field,condition,value))
		`)
		.eq("workspace_id", workspaceId)
		.in("destination_id", ["otel_collector", "webhook"])
		.eq("enabled", true);
	if (error) throw new Error(`otel_destinations_load_failed:${error.message}`);
	return (data ?? []) as Destination[];
}

function metadataCategory(key: string): "generation" | "cost" | "identity" | "context" | null {
	if (key.startsWith("phaseo.cost.")) return "cost";
	if (key === "user.id" || key.startsWith("phaseo.api_key.") || key.startsWith("phaseo.app.") || key.startsWith("phaseo.client.") || key === "phaseo.request.id" || key === "phaseo.workspace.id") return "identity";
	if (key.startsWith("http.") || key.startsWith("server.") || key.startsWith("phaseo.edge.") || key === "phaseo.endpoint" || key === "phaseo.requested_model" || key === "gen_ai.conversation.id") return "context";
	if (key.startsWith("gen_ai.") || key.startsWith("phaseo.generation.") || key.startsWith("phaseo.provider.")) return "generation";
	return null;
}

export function filterMetadata(payload: unknown, destination: Destination): unknown {
	const enabled = {
		generation: destination.include_generation_metadata !== false,
		cost: destination.include_cost_metadata !== false,
		identity: destination.include_identity_metadata !== false,
		context: destination.include_request_context !== false,
	};
	const visit = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(visit);
		if (!value || typeof value !== "object") return value;
		const output: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			if (key === "attributes" && Array.isArray(child)) {
				output[key] = child.filter((attribute) => {
					const category = metadataCategory(String(object(attribute).key ?? ""));
					return !category || enabled[category];
				}).map(visit);
			} else output[key] = visit(child);
		}
		return output;
	};
	return visit(payload);
}

async function destinationConfig(destination: Destination): Promise<Record<string, unknown>> {
	if (destination.destination_config_ciphertext && destination.destination_config_iv) {
		return object(JSON.parse(await decryptWebhookSecret({
			secretCiphertext: destination.destination_config_ciphertext,
			secretIv: destination.destination_config_iv,
			secretKeyVersion: destination.destination_config_key_version,
		})));
	}
	return object(destination.destination_config);
}

async function enqueuePayloads(args: {
	eventId: string;
	workspaceId: string;
	gatewaySelection: GatewayGenAiTelemetry;
	build: (destination: Destination) => unknown;
}) {
	if (String(getBindings().OTEL_EXPORT_ENABLED ?? "true").toLowerCase() === "false") return 0;
	const configured = await destinations(args.workspaceId);
	const selectedDestinations = configured.filter((destination) => selected(destination, args.gatewaySelection, args.eventId));
	const rows = selectedDestinations.map((destination) => ({
			workspace_id: args.workspaceId,
			destination_id: destination.id,
			event_id: args.eventId,
			payload: args.build(destination),
			status: "pending",
			next_attempt_at: new Date().toISOString(),
		}));
	if (!rows.length) return 0;
	const { error } = await getSupabaseAdmin()
		.from("otel_export_outbox")
		.upsert(rows, { onConflict: "destination_id,event_id", ignoreDuplicates: true });
	if (error) throw new Error(`otel_outbox_enqueue_failed:${error.message}`);
	return rows.length;
}

export async function enqueueGatewayOtlpExport(args: GatewayGenAiTelemetry) {
	return enqueuePayloads({
		eventId: `gateway:${args.requestId}`,
		workspaceId: args.workspaceId,
		gatewaySelection: args,
		build: (destination) => filterMetadata(buildGatewayGenAiOtlpPayload(args, buildOptions(destination)), destination),
	});
}

export async function enqueueAsyncGenAiOtlpExport(args: AsyncGenAiTelemetry & {
	keyId?: string | null;
	userId?: string | null;
}) {
	const selection: GatewayGenAiTelemetry = {
		requestId: args.requestId,
		workspaceId: args.workspaceId,
		keyId: args.keyId,
		userId: args.userId,
		endpoint: args.endpoint,
		requestedModel: args.model,
		provider: args.provider,
		providerModel: args.providerModel,
		requestPayload: args.requestPayload,
		responsePayload: args.responsePayload,
		usage: args.usage,
		statusCode: args.statusCode ?? (args.success ? 200 : 500),
		success: args.success,
		errorType: args.errorType,
		totalNanos: args.costNanos,
		currency: args.currency,
		startedAtMs: args.startedAtMs,
		completedAtMs: args.completedAtMs,
		traceContext: args.traceContext,
		sessionId: args.sessionId,
	};
	const identity = args.phase === "turn"
		? args.requestId
		: args.sessionId ?? args.batchId ?? args.requestId;
	return enqueuePayloads({
		eventId: `${args.operation}:${identity}:${args.phase}`,
		workspaceId: args.workspaceId,
		gatewaySelection: selection,
		build: (destination) => filterMetadata(buildAsyncGenAiOtlpPayload(args, buildOptions(destination)).payload, destination),
	});
}

function endpoint(config: Record<string, unknown>): URL {
	const traceSpecific = String(config.otlp_traces_endpoint ?? "").trim();
	const base = traceSpecific || String(
		config.otlp_endpoint ?? config.collector_endpoint ?? config.endpoint ?? "",
	).trim();
	if (!base) throw new Error("OTLP endpoint is required");
	const url = new URL(base);
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
		throw new Error("OTLP endpoint must use HTTP(S) without URL credentials");
	}
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (
		!host || host === "localhost" || host.endsWith(".local") ||
		/^(0|10|127|169\.254|192\.168)\./.test(host) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
		host === "::" || host === "::1" || /^(fc|fd)[0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)
	) throw new Error("Private OTLP endpoints are not allowed");
	if (!traceSpecific && !url.pathname.endsWith("/v1/traces")) {
		url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/traces`;
	}
	return url;
}

function headers(config: Record<string, unknown>): Headers {
	const result = new Headers({
		"Content-Type": "application/json",
		"Accept": "application/json",
		"Accept-Encoding": "gzip",
	});
	if (typeof config.headers_json === "string" && config.headers_json.trim()) {
		const parsed = JSON.parse(config.headers_json);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("OTLP headers must be a JSON object");
		}
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "string" && !["content-length", "host"].includes(key.toLowerCase())) {
				result.set(key, value);
			}
		}
	}
	if (typeof config.auth_header === "string" && !result.has("authorization")) {
		result.set("Authorization", config.auth_header);
	}
	return result;
}

async function boundedResponse(response: Response): Promise<Record<string, any>> {
	if (!response.body) return {};
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_RESPONSE_BYTES) {
				await reader.cancel("otlp_response_too_large");
				throw new Error("OTLP response exceeded 4 MiB");
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	if (!total) return {};
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	try {
		return object(JSON.parse(new TextDecoder().decode(bytes)));
	} catch {
		return {};
	}
}

function retryDelayMs(attempts: number, retryAfter: string | null): number {
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 3_600_000);
		const date = Date.parse(retryAfter);
		if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 3_600_000));
	}
	const exponential = Math.min(1_000 * (2 ** Math.max(0, attempts - 1)), 3_600_000);
	const jitter = crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff;
	return Math.round(exponential * (0.5 + jitter * 0.5));
}

export async function deliverGatewayOtlpPayload(
	payload: unknown,
	config: Record<string, unknown>,
	attempts = 1,
) {
	let collectorEndpoint: URL;
	let collectorHeaders: Headers;
	try {
		collectorEndpoint = endpoint(config);
		collectorHeaders = headers(config);
		// Reuse the hardened outbound-webhook boundary so mapped IPv6 literals
		// and DNS records resolving to private networks are rejected immediately
		// before the collector request.
		const validationUrl = new URL(collectorEndpoint);
		// The shared boundary requires TLS for webhooks. OTLP explicitly supports
		// public HTTP collectors, so validate the identical host/path through the
		// hardened DNS boundary without changing the actual collector scheme.
		if (validationUrl.protocol === "http:") validationUrl.protocol = "https:";
		const validated = await validateWebhookEndpointUrlForDelivery(validationUrl.toString());
		if (validated.ok === false) throw new Error(`Invalid OTLP endpoint: ${validated.reason}`);
	} catch (error) {
		return {
			delivered: false,
			retryable: false,
			status: null,
			delayMs: 0,
			error: error instanceof Error ? error.message : "Invalid OTLP destination",
		};
	}
	let response: Response;
	try {
		response = await fetch(collectorEndpoint, {
			method: "POST",
			headers: collectorHeaders,
			body: JSON.stringify(payload),
			redirect: "manual",
			signal: AbortSignal.timeout(15_000),
		});
	} catch (error) {
		return {
			delivered: false,
			retryable: true,
			status: null,
			delayMs: retryDelayMs(attempts, null),
			error: error instanceof Error ? error.message : "OTLP connection failed",
		};
	}
	const body = await boundedResponse(response);
	const partial = object(body.partialSuccess ?? body.partial_success);
	const rejected = finite(partial.rejectedSpans ?? partial.rejected_spans) ?? 0;
	if (response.ok && rejected <= 0) {
		return { delivered: true, retryable: false, status: response.status, delayMs: 0, error: null };
	}
	const partialMessage = String(partial.errorMessage ?? partial.error_message ?? "").slice(0, 1_000);
	return {
		delivered: false,
		retryable: !response.ok && RETRYABLE_STATUS.has(response.status),
		status: response.status,
		delayMs: retryDelayMs(attempts, response.headers.get("retry-after")),
		error: response.ok
			? `OTLP partial success rejected ${rejected} spans${partialMessage ? `: ${partialMessage}` : ""}`
			: `OTLP endpoint returned ${response.status}`,
	};
}

export async function deliverGatewayWebhookPayload(
	payload: unknown,
	config: Record<string, unknown>,
	attempts = 1,
) {
	let target: URL;
	let requestHeaders: Headers;
	try {
		target = new URL(String(config.url ?? "").trim());
		const validated = await validateWebhookEndpointUrlForDelivery(target.toString());
		if (validated.ok === false) throw new Error(`Invalid webhook endpoint: ${validated.reason}`);
		requestHeaders = headers(config);
	} catch (error) {
		return { delivered: false, retryable: false, status: null, delayMs: 0, error: error instanceof Error ? error.message : "Invalid webhook destination" };
	}
	let response: Response;
	try {
		response = await fetch(target, {
			method: String(config.method ?? "POST").toUpperCase() === "PUT" ? "PUT" : "POST",
			headers: requestHeaders,
			body: JSON.stringify(payload),
			redirect: "manual",
			signal: AbortSignal.timeout(15_000),
		});
	} catch (error) {
		return { delivered: false, retryable: true, status: null, delayMs: retryDelayMs(attempts, null), error: error instanceof Error ? error.message : "Webhook connection failed" };
	}
	await boundedResponse(response);
	if (response.ok) return { delivered: true, retryable: false, status: response.status, delayMs: 0, error: null };
	return {
		delivered: false,
		retryable: RETRYABLE_STATUS.has(response.status),
		status: response.status,
		delayMs: retryDelayMs(attempts, response.headers.get("retry-after")),
		error: `Webhook endpoint returned ${response.status}`,
	};
}

async function updateOutboxRow(
	client: ReturnType<typeof getSupabaseAdmin>,
	id: string,
	patch: Record<string, unknown>,
) {
	const { error } = await client.from("otel_export_outbox").update(patch).eq("id", id);
	if (error) throw new Error(`otel_outbox_update_failed:${error.message}`);
}

export async function drainGatewayOtlpOutbox(limit = 100): Promise<{
	claimed: number;
	delivered: number;
	retried: number;
	failed: number;
}> {
	const client = getSupabaseAdmin();
	const { data, error } = await client.rpc("claim_otel_export_outbox", { p_limit: limit });
	if (error) throw new Error(`otel_outbox_claim_failed:${error.message}`);
	const rows = (data ?? []) as OutboxRow[];
	let delivered = 0;
	let retried = 0;
	let failed = 0;
	for (const row of rows) {
		const destinationResult = await client
			.from("workspace_broadcast_destinations")
			.select("id,destination_id,destination_config,destination_config_ciphertext,destination_config_iv,destination_config_key_version,enabled")
			.eq("id", row.destination_id)
			.maybeSingle();
		if (destinationResult.error || !destinationResult.data?.enabled) {
			await updateOutboxRow(client, row.id, {
				status: "failed",
				last_error: "Broadcast destination unavailable or disabled",
				lease_expires_at: null,
				updated_at: new Date().toISOString(),
			});
			failed += 1;
			continue;
		}
		let outcome;
		try {
			const destination = destinationResult.data as Destination & { enabled: boolean };
			const config = await destinationConfig(destination);
			outcome = destination.destination_id === "webhook"
				? await deliverGatewayWebhookPayload(row.payload, config, row.attempts)
				: await deliverGatewayOtlpPayload(row.payload, config, row.attempts);
		} catch (deliveryError) {
			outcome = {
				delivered: false,
				retryable: false,
				status: null,
				delayMs: 0,
				error: deliveryError instanceof Error ? deliveryError.message : "OTLP delivery failed",
			};
		}
		if (outcome.delivered) {
			await updateOutboxRow(client, row.id, {
				status: "delivered",
				delivered_at: new Date().toISOString(),
				lease_expires_at: null,
				last_http_status: outcome.status,
				last_error: outcome.error,
				updated_at: new Date().toISOString(),
			});
			delivered += 1;
			continue;
		}
		const shouldRetry = outcome.retryable && row.attempts < MAX_ATTEMPTS;
		await updateOutboxRow(client, row.id, {
			status: shouldRetry ? "pending" : "failed",
			next_attempt_at: new Date(Date.now() + outcome.delayMs).toISOString(),
			lease_expires_at: null,
			last_http_status: outcome.status,
			last_error: outcome.error,
			updated_at: new Date().toISOString(),
		});
		if (shouldRetry) retried += 1;
		else failed += 1;
	}
	return { claimed: rows.length, delivered, retried, failed };
}
