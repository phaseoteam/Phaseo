// Purpose: Read per-attempt provider detail from v2_request_attempts for request detail views.
// Why: gateway_upstream_requests is being retired; the gateway no longer writes to it and it stays
// read-only for older requests. v2_request_attempts only holds the provider's status text, error code, message,
// description and the attempt start time for requests created at or after the cut-over below.
import type { RequestRow } from "./actions";

/**
 * First instant at which every v2_request_attempts row carries the detail added in #3607
 * (status_text, upstream_error_code/message/description, started_at/completed_at and
 * safe_metadata.provider_api_model_id). Requests created at or after it are read from
 * v2_request_attempts; older requests keep reading gateway_upstream_requests, which tolerates
 * that table being missing so a later drop only empties the older detail.
 */
export const V2_ATTEMPT_DETAIL_CUTOVER = "2026-11-09T14:00:00.000Z";
const CUTOVER_MS = Date.parse(V2_ATTEMPT_DETAIL_CUTOVER);

/** Whether a request created at this time has full attempt detail in v2_request_attempts. */
export function hasV2AttemptDetail(createdAt: string | null | undefined): boolean {
	const time = Date.parse(createdAt ?? "");
	return Number.isFinite(time) && time >= CUTOVER_MS;
}

/** The v2_request_attempts columns the request detail views read. */
export const V2_ATTEMPT_DETAIL_COLUMNS = "attempt_id,attempt_number,provider_model_id,started_at,completed_at,status_code,status_text,success,error_code,failure_class,upstream_response_id,latency_ms,safe_metadata,upstream_error_code,upstream_error_message,upstream_error_description,upstream_error_type";

type Row = Record<string, unknown>;

function record(value: unknown): Row {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function finite(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Attempts ordered by attempt_number, as the gateway made them. */
export function sortedV2Attempts(value: unknown): Row[] {
	const attempts = Array.isArray(value) ? value.map(record) : [];
	return attempts.sort((left, right) => Number(left.attempt_number ?? 0) - Number(right.attempt_number ?? 0));
}

/**
 * The attempt that carries the request-level values, picked the way the gateway_upstream_requests
 * writer did: the last successful attempt, otherwise the last attempt.
 */
export function finalV2AttemptIndex(attempts: Row[]): number {
	for (let index = attempts.length - 1; index >= 0; index -= 1) {
		if (attempts[index].success === true) return index;
	}
	return attempts.length - 1;
}

/**
 * Provider, Phaseo route model and provider-side model id for one attempt. provider_model_id is
 * the route id ("openai:openai/gpt-x"); safe_metadata.provider_api_model_id is the id sent to the
 * provider ("gpt-x"), which matches gateway_upstream_requests.provider_model_slug.
 */
export function v2AttemptModel(attempt: Row, fallbackProviderModelId?: unknown) {
	const metadata = record(attempt.safe_metadata);
	const routeId = text(attempt.provider_model_id) ?? text(fallbackProviderModelId) ?? "";
	const separator = routeId.indexOf(":");
	const routeModel = separator > 0 ? routeId.slice(separator + 1) : null;
	return {
		provider: text(metadata.provider) ?? (separator > 0 ? routeId.slice(0, separator) : null),
		api_model_id: routeModel,
		provider_model_slug: text(metadata.provider_api_model_id) ?? routeModel,
	};
}

/**
 * Map a v2_request_facts row with its embedded v2_request_attempts to the request detail's
 * provider_attempts shape. As in gateway_upstream_requests, request-level values (cost, finish
 * reason, request latency, generation and total time) go on the final attempt only.
 */
export function v2AttemptsToProviderAttempts(fact: unknown): RequestRow["provider_attempts"] {
	const request = record(fact);
	const attempts = sortedV2Attempts(request.v2_request_attempts);
	const finalIndex = finalV2AttemptIndex(attempts);
	return attempts.map((attempt, index) => {
		const isFinal = index === finalIndex;
		const success = attempt.success === true;
		const metadata = record(attempt.safe_metadata);
		const duration = finite(attempt.latency_ms);
		const startedAt = Date.parse(typeof attempt.started_at === "string" ? attempt.started_at : "");
		return {
			sequence: finite(attempt.attempt_number) ?? index + 1,
			round_number: 1,
			attempt_number: finite(attempt.attempt_number) ?? index + 1,
			internal_attempt_number: null,
			...v2AttemptModel(attempt),
			outcome: success ? "success" : text(attempt.failure_class) ?? "error",
			status: finite(attempt.status_code),
			status_text: text(attempt.status_text),
			duration_ms: duration,
			started_at_unix_ms: Number.isFinite(startedAt) ? startedAt : null,
			latency_ms: isFinal ? finite(request.latency_ms) : null,
			generation_ms: isFinal ? finite(request.generation_ms) : null,
			total_ms: isFinal ? finite(request.gateway_total_ms) ?? finite(request.latency_ms) ?? duration : duration,
			cost_nanos: isFinal && success ? finite(request.cost_nanos) ?? 0 : 0,
			currency: text(request.currency),
			finish_reason: isFinal ? text(request.stop_reason) : null,
			provider_finish_reason: null,
			retryable: typeof metadata.retryable === "boolean" ? metadata.retryable : null,
			fallback_attempted: metadata.fallback_attempted === true,
			upstream_error_code: text(attempt.upstream_error_code),
			upstream_error_type: text(attempt.upstream_error_type),
			upstream_error_message: text(attempt.upstream_error_message),
			upstream_error_description: text(attempt.upstream_error_description),
		};
	});
}
