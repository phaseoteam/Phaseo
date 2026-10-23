// Source of truth for Broadcast destination types, shared by the gateway
// exporter and control API, the dashboard API and the dashboard. Edit this file,
// then run `node scripts/sync-broadcast-destinations.mjs` to refresh the copies.

// otlp sends traces, webhook posts each event, and rows writes one row per span
// in batches (see broadcast-rows.ts).
export type BroadcastDelivery = "otlp" | "rows" | "webhook";

export type BroadcastDestinationType = {
	id: string;
	// How events are sent. Null until the destination has an exporter.
	delivery: BroadcastDelivery | null;
};

// Every id accepted by workspace_broadcast_destinations.destination_id. The sync
// script checks this list against that table's CHECK constraint.
export const BROADCAST_DESTINATION_TYPES = [
	{ id: "arize", delivery: "otlp" },
	{ id: "axiom", delivery: "otlp" },
	{ id: "bigquery", delivery: "rows" },
	{ id: "braintrust", delivery: "otlp" },
	{ id: "clickhouse", delivery: "rows" },
	{ id: "comet_opik", delivery: "otlp" },
	{ id: "datadog", delivery: "otlp" },
	{ id: "dynatrace", delivery: "otlp" },
	{ id: "elastic", delivery: "otlp" },
	{ id: "gcs", delivery: "rows" },
	{ id: "grafana_cloud", delivery: "otlp" },
	{ id: "honeycomb", delivery: "otlp" },
	{ id: "langfuse", delivery: "otlp" },
	{ id: "langsmith", delivery: "otlp" },
	{ id: "new_relic", delivery: "otlp" },
	{ id: "otel_collector", delivery: "otlp" },
	{ id: "posthog", delivery: "otlp" },
	{ id: "r2", delivery: "rows" },
	{ id: "respan", delivery: "otlp" },
	{ id: "s3", delivery: "rows" },
	{ id: "sentry", delivery: "otlp" },
	{ id: "snowflake", delivery: "rows" },
	{ id: "wandb_weave", delivery: "otlp" },
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
	// Fields picked by name, such as a region, and the value each name stands
	// for. The name is matched without regard to case.
	choices?: Record<string, Record<string, string>>;
	// A header or resource attribute whose template renders empty is left out.
	headers?: Record<string, string>;
	protocol?: OtlpProtocol;
	// The only encodings the vendor accepts, when an otlp_protocol override to
	// another one could never deliver.
	protocols?: OtlpProtocol[];
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
	// https://arize.com/docs/ax/concepts/otel-openinference/exporter
	// gen_ai spans are converted to OpenInference on ingest. The HTTP intake
	// does not decompress bodies, so exports are sent uncompressed. EU spaces
	// use https://otlp.eu-west-1a.arize.com.
	arize: {
		endpoint: "{base_url}/v1/traces",
		defaults: { base_url: "https://otlp.arize.com" },
		headers: { space_id: "{space_id}", api_key: "{api_key}" },
		protocol: "http/protobuf",
		resourceAttributes: { "openinference.project.name": "{project_name}" },
	},
	// https://axiom.co/docs/send-data/opentelemetry
	// Ingest goes to the edge deployment the dataset was created in.
	axiom: {
		endpoint: "https://{region}/v1/traces",
		defaults: { region: "US" },
		choices: { region: { US: "us-east-1.aws.edge.axiom.co", EU: "eu-central-1.aws.edge.axiom.co" } },
		headers: { Authorization: "Bearer {api_token}", "X-Axiom-Dataset": "{dataset}" },
		protocol: "http/protobuf",
	},
	// https://www.braintrust.dev/docs/integrations/sdk-integrations/opentelemetry
	braintrust: {
		endpoint: "{base_url}/otel/v1/traces",
		defaults: { base_url: "https://api.braintrust.dev" },
		headers: { Authorization: "Bearer {api_key}", "x-bt-parent": "project_id:{project_id}" },
		protocol: "http/protobuf",
	},
	// https://www.comet.com/docs/opik/integrations/opentelemetry
	// Self-hosted Opik takes its URL, ending before /api, as the base URL.
	comet_opik: {
		endpoint: "{base_url}/api/v1/private/otel/v1/traces",
		defaults: { base_url: "https://www.comet.com/opik" },
		headers: { Authorization: "{api_key}", "Comet-Workspace": "{workspace}", projectName: "{project_name}" },
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
	// https://docs.dynatrace.com/docs/ingest-from/opentelemetry/otlp-api
	// The environment URL is https://{id}.live.dynatrace.com, without .apps.
	// Access tokens need openTelemetryTrace.ingest; platform tokens need
	// openpipeline:traces:ingest. Protobuf only.
	dynatrace: {
		endpoint: "{environment_url}/api/v2/otlp/v1/traces",
		defaults: { token_type: "access" },
		choices: { token_type: { access: "Api-Token", platform: "Bearer" } },
		headers: { Authorization: "{token_type} {api_token}" },
		protocol: "http/protobuf",
		protocols: ["http/protobuf"],
	},
	// https://www.elastic.co/docs/reference/opentelemetry/motlp
	// The endpoint is the deployment's or project's managed OTLP endpoint.
	elastic: {
		endpoint: "{otlp_endpoint}/v1/traces",
		headers: { Authorization: "ApiKey {api_key}" },
		protocol: "http/protobuf",
	},
	// https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/
	// The OTLP endpoint is the one on the stack's OpenTelemetry tile, ending in
	// /otlp. Traces go to Tempo, which takes gzip.
	grafana_cloud: {
		endpoint: "{otlp_endpoint}/v1/traces",
		headers: { Authorization: "{basic:instance_id:api_key}" },
		protocol: "http/protobuf",
		compression: "gzip",
	},
	// https://docs.honeycomb.io/send-data/opentelemetry/
	// The dataset is only read by Honeycomb Classic; other environments name
	// datasets after service.name.
	honeycomb: {
		endpoint: "https://{region}/v1/traces",
		defaults: { region: "US" },
		choices: { region: { US: "api.honeycomb.io", EU: "api.eu1.honeycomb.io" } },
		headers: { "x-honeycomb-team": "{api_key}", "x-honeycomb-dataset": "{dataset?}" },
		protocol: "http/protobuf",
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
	// https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/
	// Authenticated with an ingest license key. String attributes over 4,095
	// characters are not accepted, so prompts and outputs are cut to fit.
	new_relic: {
		endpoint: "https://{region}/v1/traces",
		defaults: { region: "US" },
		choices: { region: { US: "otlp.nr-data.net", EU: "otlp.eu01.nr-data.net", JP: "otlp.jp.nr-data.net" } },
		headers: { "api-key": "{license_key}" },
		protocol: "http/protobuf",
		compression: "gzip",
		maxAttributeLength: 4095,
	},
	// https://posthog.com/docs/llm-analytics/installation/opentelemetry
	// Authenticated with the project token. The intake keeps gen_ai spans and
	// reads gen_ai.conversation.id as the session; requests are capped at 4 MB.
	posthog: {
		endpoint: "{base_url}/i/v0/ai/otel",
		defaults: { base_url: "https://us.i.posthog.com" },
		headers: { Authorization: "Bearer {api_key}" },
		protocol: "http/protobuf",
	},
	// https://www.respan.ai/docs/apis/traces/ingest-traces-otlp
	respan: {
		endpoint: "{base_url}/api/v2/traces",
		defaults: { base_url: "https://api.respan.ai" },
		headers: { Authorization: "Bearer {api_key}" },
		protocol: "http/protobuf",
	},
	// https://docs.sentry.io/concepts/otlp/direct/traces/
	// Project settings > Client Keys (DSN) shows the OTLP traces endpoint and the
	// public key that authenticates it.
	sentry: {
		endpoint: "{otlp_endpoint}",
		headers: { "x-sentry-auth": "sentry sentry_key={public_key}" },
		protocol: "http/protobuf",
	},
	// https://docs.coreweave.com/products/wandb/weave/guides/tracking/trace-agents-otel
	// The agents endpoint renders gen_ai spans, groups them by
	// gen_ai.conversation.id and takes gzip. Spans without an entity and project
	// are rejected.
	wandb_weave: {
		endpoint: "{base_url}/agents/otel/v1/traces",
		defaults: { base_url: "https://trace.wandb.ai" },
		headers: { "wandb-api-key": "{api_key}" },
		protocol: "http/protobuf",
		compression: "gzip",
		resourceAttributes: { "wandb.entity": "{entity}", "wandb.project": "{project}" },
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
		const choices = preset.choices?.[name];
		if (!choices) return value;
		const choice = Object.keys(choices).find((key) => key.toLowerCase() === value.toLowerCase());
		if (!choice) throw new Error(`${name} must be one of: ${Object.keys(choices).join(", ")}`);
		return choices[choice];
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
	if (preset?.protocols && !preset.protocols.includes(protocol)) {
		throw new Error(`Protocol must be ${preset.protocols.join(" or ")} for this destination`);
	}
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

// Row destinations are checked by broadcastRowsEndpoint in broadcast-rows.ts.

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

// Webhook destinations with a signing_secret are signed like workspace webhooks:
// x-phaseo-signature is the hex HMAC-SHA256 of `${timestamp}.${body}`, with the
// Unix seconds in x-phaseo-timestamp.
export const BROADCAST_WEBHOOK_SIGNING_SECRET_MIN_LENGTH = 16;
export const BROADCAST_WEBHOOK_SIGNING_SECRET_MAX_LENGTH = 256;

export function broadcastWebhookSigningSecretError(value: unknown): string | null {
	if (value === undefined || value === null || value === "") return null;
	if (typeof value !== "string") return "Signing secret must be text";
	if (value.length < BROADCAST_WEBHOOK_SIGNING_SECRET_MIN_LENGTH || value.length > BROADCAST_WEBHOOK_SIGNING_SECRET_MAX_LENGTH) {
		return `Signing secret must be ${BROADCAST_WEBHOOK_SIGNING_SECRET_MIN_LENGTH} to ${BROADCAST_WEBHOOK_SIGNING_SECRET_MAX_LENGTH} characters`;
	}
	if (/[\x00-\x20\x7f]/.test(value)) return "Signing secret cannot contain spaces or control characters";
	return null;
}

export async function broadcastWebhookSignatureHeaders(
	config: Record<string, unknown>,
	body: string,
	nowMs = Date.now(),
): Promise<Record<string, string>> {
	const secret = config.signing_secret;
	if (typeof secret !== "string" || !secret) return {};
	const timestamp = String(Math.floor(nowMs / 1000));
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`));
	return {
		"x-phaseo-timestamp": timestamp,
		"x-phaseo-signature": Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join(""),
	};
}
