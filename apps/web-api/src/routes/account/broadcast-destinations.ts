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

const OTLP_BASE_ENDPOINT_KEYS = ["otlp_endpoint", "collector_endpoint", "endpoint"] as const;

// The endpoint the exporter will call, before network validation.
export function broadcastDestinationEndpoint(id: unknown, config: Record<string, unknown>): string {
	const delivery = broadcastDelivery(id);
	if (delivery === "webhook") return String(config.url ?? "").trim();
	return delivery === "otlp" ? otlpTracesEndpoint(config) : "";
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
