// Purpose: One vocabulary for finish reasons across Chat, Responses and Messages.
// Why: Each surface documents a different set of values; translating them ad hoc lost
//      max_tokens, refusal, stop_sequence and pause_turn on the way between dialects.
// How: Normalise any provider or surface value to the IR finish reason plus an optional
//      detail, and map that pair to the closest documented value of each client surface.

import type { IRChoice } from "./ir";

export type IRFinishReason = NonNullable<IRChoice["finishReason"]>;
export type IRFinishDetail = NonNullable<IRChoice["finishDetail"]>;

export type NormalizedFinish = {
	finishReason: IRFinishReason;
	finishDetail?: IRFinishDetail;
};

/** Anthropic Messages stop reasons (https://docs.anthropic.com/en/api/messages). */
export type AnthropicStopReason =
	| "end_turn"
	| "max_tokens"
	| "stop_sequence"
	| "tool_use"
	| "pause_turn"
	| "refusal";

/**
 * Gateway-internal key on a Responses `response` object. Responses statuses cannot
 * express Anthropic's `stop_sequence`, `pause_turn` or `refusal`, so executors that use
 * Responses as their canonical stream put the provider's own stop reason here for the
 * Messages adapters. It is removed before a frame reaches a client
 * (`stripGatewayStop`).
 */
export const GATEWAY_STOP_KEY = "_phaseo_stop";

/**
 * Gateway-internal key on a Responses `response` object carrying Anthropic's
 * `context_management` result (the edits context editing applied) to the Messages
 * adapter. Responses has no such field, so it is removed with the stop carrier.
 */
export const GATEWAY_CONTEXT_MANAGEMENT_KEY = "_phaseo_context_management";

export type GatewayStop = {
	reason: IRFinishDetail;
	sequence?: string | null;
};

/**
 * Normalise a provider or surface finish value (OpenAI `finish_reason`, Responses
 * status or incomplete reason, Anthropic `stop_reason`) to the IR finish reason.
 * Unknown values are treated as a normal stop.
 */
export function normalizeFinishReason(raw: string | null | undefined): NormalizedFinish {
	const value = String(raw ?? "").trim().toLowerCase();
	switch (value) {
		case "":
		case "stop":
		case "end_turn":
		case "completed":
			return { finishReason: "stop" };
		case "stop_sequence":
			return { finishReason: "stop", finishDetail: "stop_sequence" };
		case "pause_turn":
			return { finishReason: "stop", finishDetail: "pause_turn" };
		case "refusal":
			return { finishReason: "content_filter", finishDetail: "refusal" };
		case "length":
		case "max_tokens":
		case "max_output_tokens":
		case "model_context_window_exceeded":
			return { finishReason: "length" };
		case "tool_calls":
		case "tool_use":
		case "function_call":
			return { finishReason: "tool_calls" };
		case "content_filter":
			return { finishReason: "content_filter" };
		case "error":
		case "failed":
			return { finishReason: "error" };
		default:
			break;
	}
	if (value.includes("tool")) return { finishReason: "tool_calls" };
	if (value.includes("content") || value.includes("safety")) return { finishReason: "content_filter" };
	return { finishReason: "stop" };
}

/**
 * The Messages `stop_reason` for an IR finish. A refusal detail wins over the reason
 * (OpenAI-style refusals finish with `stop`), and `null` stands for a failed response.
 */
export function anthropicStopReasonFor(
	finishReason: IRChoice["finishReason"] | undefined,
	finishDetail?: IRChoice["finishDetail"],
): AnthropicStopReason | null {
	if (finishDetail === "refusal") return "refusal";
	switch (finishReason) {
		case "length":
			return "max_tokens";
		case "tool_calls":
			return "tool_use";
		case "content_filter":
			return "refusal";
		case "error":
			return null;
		default:
			if (finishDetail === "stop_sequence") return "stop_sequence";
			if (finishDetail === "pause_turn") return "pause_turn";
			return "end_turn";
	}
}

/** The Responses `status` and `incomplete_details` for an IR finish. */
export function responsesStatusFor(finishReason: IRChoice["finishReason"] | undefined): {
	status: "completed" | "incomplete" | "failed";
	incompleteDetails?: { reason: "max_output_tokens" | "content_filter" };
} {
	switch (finishReason) {
		case "length":
			return { status: "incomplete", incompleteDetails: { reason: "max_output_tokens" } };
		case "content_filter":
			return { status: "incomplete", incompleteDetails: { reason: "content_filter" } };
		case "error":
			return { status: "failed" };
		default:
			return { status: "completed" };
	}
}

/** The internal stop carried on a Responses `response` object, if any. */
export function readGatewayStop(response: any): GatewayStop | null {
	const value = response && typeof response === "object" ? response[GATEWAY_STOP_KEY] : null;
	if (!value || typeof value !== "object") return null;
	const reason = value.reason;
	if (reason !== "stop_sequence" && reason !== "pause_turn" && reason !== "refusal") return null;
	return {
		reason,
		...(typeof value.sequence === "string" ? { sequence: value.sequence } : {}),
	};
}

/** The internal stop entry to spread onto a Responses `response` object. */
export function gatewayStopEntry(
	detail: IRChoice["finishDetail"] | null | undefined,
	sequence?: string | null,
): Record<string, GatewayStop> {
	if (!detail) return {};
	return {
		[GATEWAY_STOP_KEY]: {
			reason: detail,
			...(typeof sequence === "string" && sequence ? { sequence } : {}),
		},
	};
}

/** The internal context-management entry to spread onto a Responses `response` object. */
export function gatewayContextManagementEntry(value: unknown): Record<string, Record<string, any>> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return { [GATEWAY_CONTEXT_MANAGEMENT_KEY]: value as Record<string, any> };
}

/** The Anthropic `context_management` result carried on a Responses `response` object, if any. */
export function readGatewayContextManagement(response: any): Record<string, any> | null {
	const value = response && typeof response === "object" ? response[GATEWAY_CONTEXT_MANAGEMENT_KEY] : null;
	return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function withoutGatewayKeys(record: Record<string, any>): Record<string, any> | null {
	if (!(GATEWAY_STOP_KEY in record) && !(GATEWAY_CONTEXT_MANAGEMENT_KEY in record)) return null;
	const { [GATEWAY_STOP_KEY]: _stop, [GATEWAY_CONTEXT_MANAGEMENT_KEY]: _context, ...rest } = record;
	return rest;
}

/**
 * Remove the internal stop and context-management carriers from a client-bound frame (a
 * Responses event with a `response`, or a bare `response` object). Returns the frame
 * unchanged when it has neither.
 */
export function stripGatewayStop<T>(frame: T): T {
	if (!frame || typeof frame !== "object") return frame;
	const record = frame as Record<string, any>;
	const stripped = withoutGatewayKeys(record);
	if (stripped) return stripped as T;
	const response = record.response;
	const strippedResponse = response && typeof response === "object" ? withoutGatewayKeys(response) : null;
	if (strippedResponse) return { ...record, response: strippedResponse } as T;
	return frame;
}

/** True when a Responses output carries a refusal content part. */
export function responsesOutputHasRefusal(response: any): boolean {
	const output = Array.isArray(response?.output) ? response.output : [];
	return output.some((item: any) =>
		Array.isArray(item?.content) &&
		item.content.some((part: any) => part?.type === "refusal"),
	);
}
