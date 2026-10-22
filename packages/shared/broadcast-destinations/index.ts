// Source of truth for Broadcast destination types, shared by the gateway
// exporter and control API, the dashboard API and the dashboard. Edit this file,
// then run `node scripts/sync-broadcast-destinations.mjs` to refresh the copies.

export type BroadcastDelivery = "otlp" | "webhook";

export type BroadcastDestinationType = {
	id: string;
	// How events are sent. Null until the destination has an exporter.
	delivery: BroadcastDelivery | null;
};

// Every id accepted by workspace_broadcast_destinations.destination_id. The sync
// script checks this list against that table's CHECK constraint.
export const BROADCAST_DESTINATION_TYPES = [
	{ id: "arize", delivery: null },
	{ id: "braintrust", delivery: "otlp" },
	{ id: "clickhouse", delivery: null },
	{ id: "comet_opik", delivery: null },
	{ id: "datadog", delivery: "otlp" },
	{ id: "grafana_cloud", delivery: null },
	{ id: "langfuse", delivery: "otlp" },
	{ id: "langsmith", delivery: "otlp" },
	{ id: "new_relic", delivery: null },
	{ id: "otel_collector", delivery: "otlp" },
	{ id: "posthog", delivery: null },
	{ id: "s3", delivery: null },
	{ id: "sentry", delivery: null },
	{ id: "snowflake", delivery: null },
	{ id: "wandb_weave", delivery: null },
	{ id: "webhook", delivery: "webhook" },
] as const satisfies readonly BroadcastDestinationType[];

export type BroadcastDestinationId = (typeof BROADCAST_DESTINATION_TYPES)[number]["id"];

export const AVAILABLE_BROADCAST_DESTINATION_IDS: readonly BroadcastDestinationId[] = BROADCAST_DESTINATION_TYPES
	.filter((type) => type.delivery !== null)
	.map((type) => type.id);

export function isAvailableBroadcastDestination(id: unknown): id is BroadcastDestinationId {
	return AVAILABLE_BROADCAST_DESTINATION_IDS.includes(id as BroadcastDestinationId);
}

export function broadcastDelivery(id: unknown): BroadcastDelivery | null {
	return BROADCAST_DESTINATION_TYPES.find((type) => type.id === id)?.delivery ?? null;
}

const LEGACY_IDS: Record<string, BroadcastDestinationId> = { arize_ai: "arize", new_relic_ai: "new_relic" };

export function normalizeBroadcastDestinationId(value: unknown): string {
	const id = String(value ?? "").trim();
	return LEGACY_IDS[id] ?? id;
}

// Destinations of one type a workspace may create unless an operator raises it in
// workspace_broadcast_destination_limits. Enforced by the
// enforce_broadcast_destination_limit trigger, which raises
// BROADCAST_DESTINATION_LIMIT_ERROR; the sync script checks the two agree.
export const DEFAULT_BROADCAST_DESTINATIONS_PER_TYPE = 5;
export const BROADCAST_DESTINATION_LIMIT_ERROR = "broadcast_destination_limit_reached";

export function isBroadcastDestinationLimitError(error: unknown): boolean {
	const message = error && typeof error === "object" ? (error as { message?: unknown }).message : error;
	return String(message ?? "").includes(BROADCAST_DESTINATION_LIMIT_ERROR);
}

export const BROADCAST_RULE_FIELDS = [
	"model", "provider", "session_id", "user_id", "api_key_name", "finish_reason", "input", "output",
	"token_cost", "total_cost", "total_tokens", "prompt_tokens", "completion_tokens",
] as const;

export const BROADCAST_RULE_CONDITIONS = [
	"equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "exists", "not_exists", "matches_regex",
] as const;

export const OTLP_PROTOCOLS = ["http/json", "http/protobuf"] as const;
export type OtlpProtocol = (typeof OTLP_PROTOCOLS)[number];

// The OTLP/HTTP encoding set in otlp_protocol, using the values of
// OTEL_EXPORTER_OTLP_PROTOCOL. Unset means JSON, which every destination created
// before protobuf support uses. Returns null for an unsupported value.
export function otlpProtocol(config: Record<string, unknown>): OtlpProtocol | null {
	const value = String(config.otlp_protocol ?? "").trim().toLowerCase();
	if (!value) return "http/json";
	return OTLP_PROTOCOLS.includes(value as OtlpProtocol) ? value as OtlpProtocol : null;
}

export const OTLP_COMPRESSIONS = ["none", "gzip"] as const;
export type OtlpCompression = (typeof OTLP_COMPRESSIONS)[number];

// How a vendor's OTLP intake is reached from the fields its form collects.
// Templates use {field} for a config value, {field?} for one that may be left
// empty, and {basic:user_field:password_field} for an HTTP basic Authorization
// value. A placeholder at the start of the endpoint is a base URL and is
// inserted as is; any later one is URL-encoded.
export type OtlpPreset = {
	endpoint: string;
	// Used when the config leaves a field empty.
	defaults?: Record<string, string>;
	// Fields that must be one of these values, such as a vendor's regions.
	allowedValues?: Record<string, readonly string[]>;
	// A header or resource attribute whose template renders empty is left out.
	headers?: Record<string, string>;
	protocol?: OtlpProtocol;
	compression?: OtlpCompression;
	// Set on every resource, for vendors that read the project or service there.
	resourceAttributes?: Record<string, string>;
	// Span attributes copied to the names a vendor reads, as target: source.
	attributeAliases?: Record<string, string>;
	// String attribute values longer than this are cut, for vendors that reject
	// or drop oversized attributes.
	maxAttributeLength?: number;
};

// Destination types sent over OTLP with a vendor's settings. Types without an
// entry here, such as otel_collector, take the endpoint and headers as entered.
export const OTLP_PRESETS: Partial<Record<BroadcastDestinationId, OtlpPreset>> = {
	// https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry
	braintrust: {
		endpoint: "{base_url}/otel/v1/traces",
		defaults: { base_url: "https://api.braintrust.dev" },
		headers: { Authorization: "Bearer {api_key}", "x-bt-parent": "project_id:{project_id}" },
		protocol: "http/protobuf",
	},
	// LLM Observability over OTLP:
	// https://docs.datadoghq.com/llm_observability/instrumentation/otel_instrumentation/
	// Sites are those with an OTLP intake, less the government sites, which do
	// not offer LLM Observability. Without dd-ml-app the ML app is the
	// service.name, phaseo-gateway. dd_llmobs_enabled turns on the conversion
	// to LLM Observability spans; without it a trace can land as plain APM.
	datadog: {
		endpoint: "https://otlp.{site}/v1/traces",
		defaults: { site: "datadoghq.com" },
		allowedValues: {
			site: ["datadoghq.com", "us3.datadoghq.com", "us5.datadoghq.com", "datadoghq.eu", "ap1.datadoghq.com", "ap2.datadoghq.com", "uk1.datadoghq.com"],
		},
		headers: { "dd-api-key": "{api_key}", "dd-otlp-source": "llmobs", "dd-ml-app": "{ml_app?}" },
		protocol: "http/protobuf",
		resourceAttributes: { dd_llmobs_enabled: "true" },
	},
	// https://langfuse.com/integrations/native/opentelemetry
	// Without the ingestion version header, traces can take up to 10 minutes to
	// appear. Langfuse reads sessions from langfuse.session.id or session.id.
	langfuse: {
		endpoint: "{base_url}/api/public/otel/v1/traces",
		defaults: { base_url: "https://cloud.langfuse.com" },
		headers: { Authorization: "{basic:public_key:secret_key}", "x-langfuse-ingestion-version": "4" },
		protocol: "http/protobuf",
		attributeAliases: { "langfuse.session.id": "gen_ai.conversation.id" },
	},
	// https://docs.langchain.com/langsmith/trace-with-opentelemetry
	// Self-hosted instances take their API URL with /api/v1 as the base URL.
	// Without a project, traces go to the "default" project.
	langsmith: {
		endpoint: "{base_url}/otel/v1/traces",
		defaults: { base_url: "https://api.smith.langchain.com" },
		headers: { "x-api-key": "{api_key}", "Langsmith-Project": "{project?}" },
		protocol: "http/protobuf",
	},
};

// Everything needed to send one OTLP export to a destination.
export type OtlpTarget = {
	endpoint: string;
	headers: Record<string, string>;
	protocol: OtlpProtocol;
	compression: OtlpCompression;
	resourceAttributes: Record<string, string>;
	attributeAliases: Record<string, string>;
	maxAttributeLength: number | null;
};

const PLACEHOLDER = /\{([a-z0-9_:]+\??)\}/g;

function base64(text: string): string {
	let binary = "";
	for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function renderTemplate(
	template: string,
	config: Record<string, unknown>,
	preset: OtlpPreset,
	encode: (value: string, offset: number) => string = (value) => value,
): string {
	const field = (name: string, optional = false) => {
		const value = String(config[name] ?? "").trim() || preset.defaults?.[name] || "";
		if (!value) {
			if (optional) return "";
			throw new Error(`${name} is required`);
		}
		const allowed = preset.allowedValues?.[name];
		if (allowed && !allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
		return value;
	};
	return template.replace(PLACEHOLDER, (_match, name: string, offset: number) => {
		const [kind, user, password] = name.split(":");
		if (kind === "basic" && user && password) return `Basic ${base64(`${field(user)}:${field(password)}`)}`;
		const optional = name.endsWith("?");
		const value = field(optional ? name.slice(0, -1) : name, optional);
		return value ? encode(value, offset) : "";
	});
}

// Headers from headers_json and auth_header, which every OTLP destination may set.
function configuredHeaders(config: Record<string, unknown>): Headers {
	const result = new Headers();
	if (typeof config.headers_json === "string" && config.headers_json.trim()) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(config.headers_json);
		} catch {
			throw new Error("OTLP headers must be a JSON object");
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("OTLP headers must be a JSON object");
		}
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "string" && !["content-length", "host"].includes(key.toLowerCase())) {
				if (/[\r\n\0]/.test(value)) throw new Error(`Header ${key} must not contain line breaks`);
				result.set(key, value);
			}
		}
	}
	if (typeof config.auth_header === "string" && /[\r\n\0]/.test(config.auth_header)) {
		throw new Error("Header Authorization must not contain line breaks");
	}
	if (typeof config.auth_header === "string" && config.auth_header && !result.has("authorization")) {
		result.set("Authorization", config.auth_header);
	}
	return result;
}

// Resolves a destination's config into the request the exporter sends. Throws
// with a message fit to show when a required field or setting is missing or wrong.
export function resolveOtlpTarget(id: unknown, config: Record<string, unknown>): OtlpTarget {
	const preset = OTLP_PRESETS[normalizeBroadcastDestinationId(id) as BroadcastDestinationId];
	const protocolValue = String(config.otlp_protocol ?? "").trim() ? config.otlp_protocol : preset?.protocol;
	const protocol = otlpProtocol({ otlp_protocol: protocolValue });
	if (!protocol) throw new Error(`Protocol must be ${OTLP_PROTOCOLS.join(" or ")}`);
	const compressionValue = String(config.otlp_compression ?? "").trim().toLowerCase() || preset?.compression || "none";
	if (!OTLP_COMPRESSIONS.includes(compressionValue as OtlpCompression)) {
		throw new Error(`Compression must be ${OTLP_COMPRESSIONS.join(" or ")}`);
	}
	const headers = new Headers();
	for (const [key, template] of Object.entries(preset?.headers ?? {})) {
		const value = renderTemplate(template, config, preset!);
		if (!value) continue;
		// Headers rejects these with an unhelpful TypeError.
		if (/[\r\n\0]/.test(value)) throw new Error(`Header ${key} must not contain line breaks`);
		headers.set(key, value);
	}
	for (const [key, value] of configuredHeaders(config)) headers.set(key, value);
	return {
		endpoint: preset
			? renderTemplate(preset.endpoint, config, preset, (value, offset) => offset === 0 ? value.replace(/\/+$/, "") : encodeURIComponent(value))
			: otlpTracesEndpoint(config),
		headers: Object.fromEntries(headers),
		protocol,
		compression: compressionValue as OtlpCompression,
		resourceAttributes: Object.fromEntries(Object.entries(preset?.resourceAttributes ?? {})
			.map(([key, template]) => [key, renderTemplate(template, config, preset!)])
			.filter(([, value]) => value)),
		attributeAliases: { ...preset?.attributeAliases },
		maxAttributeLength: preset?.maxAttributeLength ?? null,
	};
}

type OtlpAttribute = { key?: unknown; value?: { stringValue?: unknown } & Record<string, unknown> };

function truncated(attributes: OtlpAttribute[], max: number | null): OtlpAttribute[] {
	if (max === null) return attributes;
	return attributes.map((attribute) => {
		const value = attribute.value?.stringValue;
		return typeof value === "string" && value.length > max
			? { ...attribute, value: { ...attribute.value, stringValue: value.slice(0, max) } }
			: attribute;
	});
}

// Applies a target's resource attributes, attribute aliases and truncation to
// an OTLP trace export request, without changing the original.
export function applyOtlpTarget(payload: unknown, target: OtlpTarget): unknown {
	const resources = Object.entries(target.resourceAttributes);
	const aliases = Object.entries(target.attributeAliases);
	if (!resources.length && !aliases.length && target.maxAttributeLength === null) return payload;
	const request = (payload ?? {}) as { resourceSpans?: Array<Record<string, any>> };
	return {
		...request,
		resourceSpans: (request.resourceSpans ?? []).map((resourceSpan) => {
			const resourceAttributes = (resourceSpan.resource?.attributes ?? [] as OtlpAttribute[])
				.filter((attribute: OtlpAttribute) => !(String(attribute.key) in target.resourceAttributes));
			for (const [key, value] of resources) resourceAttributes.push({ key, value: { stringValue: value } });
			return {
				...resourceSpan,
				resource: { ...resourceSpan.resource, attributes: truncated(resourceAttributes, target.maxAttributeLength) },
				scopeSpans: (resourceSpan.scopeSpans ?? []).map((scopeSpan: Record<string, any>) => ({
					...scopeSpan,
					spans: (scopeSpan.spans ?? []).map((span: Record<string, any>) => {
						const attributes: OtlpAttribute[] = [...(span.attributes ?? [])];
						const present = new Set(attributes.map((attribute) => String(attribute.key)));
						for (const [alias, source] of aliases) {
							const original = attributes.find((attribute) => attribute.key === source);
							if (original && !present.has(alias)) attributes.push({ ...original, key: alias });
						}
						return { ...span, attributes: truncated(attributes, target.maxAttributeLength) };
					}),
				})),
			};
		}),
	};
}

// Gzips a request body. CompressionStream is built into Workers and browsers.
export async function gzipBytes(body: string | Uint8Array): Promise<Uint8Array> {
	// A copy gives Blob the ArrayBuffer-backed view its type requires.
	const part = typeof body === "string" ? body : new Uint8Array(body);
	const stream = new Blob([part]).stream().pipeThrough(new CompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

const OTLP_BASE_ENDPOINT_KEYS = ["otlp_endpoint", "collector_endpoint", "endpoint"] as const;

// The endpoint the exporter will call, before network validation. Throws when an
// OTLP preset is missing a field its endpoint needs.
export function broadcastDestinationEndpoint(id: unknown, config: Record<string, unknown>): string {
	const delivery = broadcastDelivery(id);
	if (delivery === "webhook") return String(config.url ?? "").trim();
	return delivery === "otlp" ? resolveOtlpTarget(id, config).endpoint : "";
}

// An explicit otlp_traces_endpoint is used as is; the first other base URL gets
// /v1/traces appended unless it already ends with it.
export function otlpTracesEndpoint(config: Record<string, unknown>): string {
	const traces = String(config.otlp_traces_endpoint ?? "").trim();
	if (traces) return traces;
	for (const key of OTLP_BASE_ENDPOINT_KEYS) {
		const value = String(config[key] ?? "").trim();
		if (!value) continue;
		try {
			const url = new URL(value);
			if (!url.pathname.endsWith("/v1/traces")) url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/traces`;
			return url.toString();
		} catch {
			return value;
		}
	}
	return "";
}
