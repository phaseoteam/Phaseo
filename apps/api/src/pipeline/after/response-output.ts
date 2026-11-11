// What a response produced as output, decided in one place for every billing decision that asks:
// the zero-output waiver for a single response and for each round of a server-tool request
// (buffered from the response, streamed from what the stream delivered), and the empty-response
// check. Kept together so those decisions cannot drift apart.

import { outputModalityCounts } from "../usage";

const positive = (value: unknown): boolean => {
	const number = typeof value === "string" ? Number(value) : value;
	return typeof number === "number" && Number.isFinite(number) && number > 0;
};

const nonEmptyText = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;

/**
 * A tool call the model actually produced: it names a tool or carries arguments (any non-blank
 * argument text, `"{}"` included). Some providers emit an empty placeholder
 * (`{ id: "", name: "", arguments: "" }`), which is not output. Buffered responses and the stream
 * materialiser both classify with this.
 */
export function isBillableToolCall(call: unknown): boolean {
	if (!call || typeof call !== "object") return false;
	const record = call as Record<string, any>;
	const fn = record.function && typeof record.function === "object" ? record.function : {};
	if (nonEmptyText(record.name) || nonEmptyText(fn.name)) return true;
	const args = record.arguments ?? fn.arguments ?? record.input;
	if (nonEmptyText(args)) return true;
	return Boolean(args && typeof args === "object" && Object.keys(args).length > 0);
}

/** The billable tool calls in a list (see isBillableToolCall). */
export function countBillableToolCalls(calls: unknown): number {
	return Array.isArray(calls) ? calls.filter(isBillableToolCall).length : 0;
}

/** Usage detail objects that carry output counts by modality, beyond the aliases usage shaping reads. */
const OUTPUT_DETAIL_KEYS = ["completion_tokens_details", "output_tokens_details", "outputTokensDetails"];
const DETAIL_OUTPUT_COUNTS = ["reasoning_tokens", "audio_tokens", "image_tokens", "video_tokens", "reasoningTokens", "audioTokens", "imageTokens"];

/**
 * Output the provider's own usage reports besides text output tokens: reasoning, image, audio and
 * video (every alias usage shaping reads, through the same outputModalityCounts, plus the
 * provider's nested detail objects), and server-tool or native web meters.
 */
export function usageReportsProviderOutput(usage: unknown): boolean {
	if (!usage || typeof usage !== "object") return false;
	const record = usage as Record<string, any>;
	if (Object.values(outputModalityCounts(record)).some(positive)) return true;
	for (const [key, value] of Object.entries(record)) {
		if (!positive(value)) continue;
		if (
			key.startsWith("output_image") || key.startsWith("output_audio") || key.startsWith("output_video") ||
			key.startsWith("server_tool_") || key.startsWith("native_web_") ||
			key === "reasoning_tokens" || key === "output_reasoning_tokens"
		) return true;
	}
	for (const detailKey of OUTPUT_DETAIL_KEYS) {
		const detail = record[detailKey];
		if (detail && typeof detail === "object" && DETAIL_OUTPUT_COUNTS.some((key) => positive(detail[key]))) return true;
	}
	return false;
}

/**
 * Output the gateway counted in a response (tool calls, web search results, citations), attached to
 * its usage for reporting. A stream counts these from the provider's events, which include output
 * its client never received (after a cancel, or dropped by its encoder), so a stream's waiver does
 * not read them: it reads what was delivered (DeliveredOutput) instead.
 */
const OBSERVED_OUTPUT_COUNTS = ["output_tool_call_count", "tool_call_count", "output_web_search_result_count", "output_citation_count"];

/** All the non-text output a usage record reports: the provider's own and the gateway's counts. */
export function usageReportsNonTextOutput(usage: unknown): boolean {
	if (usageReportsProviderOutput(usage)) return true;
	const record = usage && typeof usage === "object" ? usage as Record<string, any> : {};
	return OBSERVED_OUTPUT_COUNTS.some((key) => positive(record[key]));
}

/**
 * Output an IR chat response carries besides plain text: a billable tool call, an image, audio or
 * video part, or reasoning text.
 */
export function irReportsNonTextOutput(ir: unknown): boolean {
	const choices = (ir as { choices?: unknown })?.choices;
	if (!Array.isArray(choices)) return false;
	return choices.some((choice: any) => {
		if (countBillableToolCalls(choice?.message?.toolCalls) > 0) return true;
		return (Array.isArray(choice?.message?.content) ? choice.message.content : []).some((part: any) =>
			part?.type === "image" || part?.type === "audio" || part?.type === "video" ||
			(part?.type === "reasoning_text" && nonEmptyText(part.text)));
	});
}

/** Non-text output a stream delivered to the client, recorded as it was emitted. */
export type DeliveredOutput = { reasoning: boolean; toolCalls: number; media: boolean };

export function emptyDeliveredOutput(): DeliveredOutput {
	return { reasoning: false, toolCalls: 0, media: false };
}

/** Output delivered so far together with a frame's own output (that frame not yet written). */
export function withFrameOutput(delivered: DeliveredOutput, frame: DeliveredOutput): DeliveredOutput {
	return {
		reasoning: delivered.reasoning || frame.reasoning,
		toolCalls: delivered.toolCalls + frame.toolCalls,
		media: delivered.media || frame.media,
	};
}

/** Whether a stream delivered output besides plain text (the streamed equivalent of irReportsNonTextOutput). */
export function deliveredNonTextOutput(delivered: DeliveredOutput | null | undefined): boolean {
	return Boolean(delivered && (delivered.reasoning || delivered.toolCalls > 0 || delivered.media));
}
