// Generated from packages/shared/broadcast-destinations/index.ts by scripts/sync-broadcast-destinations.mjs. Do not edit.
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
	{ id: "braintrust", delivery: null },
	{ id: "clickhouse", delivery: null },
	{ id: "comet_opik", delivery: null },
	{ id: "datadog", delivery: null },
	{ id: "grafana_cloud", delivery: null },
	{ id: "langfuse", delivery: null },
	{ id: "langsmith", delivery: null },
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
// Templates use {field} for a config value and {basic:user_field:password_field}
// for an HTTP basic Authorization value. A placeholder at the start of the
// endpoint is a base URL and is inserted as is; any later one is URL-encoded.
export type OtlpPreset = {
	endpoint: string;
	// Used when the config leaves a field empty.
	defaults?: Record<string, string>;
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
export const OTLP_PRESETS: Partial<Record<BroadcastDestinationId, OtlpPreset>> = {};

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

const PLACEHOLDER = /\{([a-z0-9_:]+)\}/g;

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
	const field = (name: string) => {
		const value = String(config[name] ?? "").trim() || preset.defaults?.[name] || "";
		if (!value) throw new Error(`${name} is required`);
		return value;
	};
	return template.replace(PLACEHOLDER, (_match, name: string, offset: number) => {
		const [kind, user, password] = name.split(":");
		if (kind === "basic" && user && password) return `Basic ${base64(`${field(user)}:${field(password)}`)}`;
		return encode(field(name), offset);
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
			.map(([key, template]) => [key, renderTemplate(template, config, preset!)])),
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
