import { getProviderQuirks } from "./quirks";
import { GatewayStreamError } from "@core/stream-error";

export type StreamAdapterState = {
	requestId: string;
	providerId: string;
	choiceStates: Map<number, { reasoningChunks: string[] }>;
	aionStates?: Map<number, any>;
};

export function applyStreamQuirks(chunk: any, state: StreamAdapterState, providerId: string) {
	const quirks = getProviderQuirks(providerId);
	if (quirks.transformStreamChunk) {
		try {
			quirks.transformStreamChunk({ chunk, accumulated: state });
		} catch {
			throw new GatewayStreamError("gateway", "transform", "gateway_stream_transform_failed");
		}
	}
}

export function normalizeResponsesEvent(event: string | null): string | null {
	if (!event) return event;
	if (event === "response.reasoning.delta") return "response.reasoning_text.delta";
	if (event === "response.reasoning_summary_text.delta") return "response.reasoning_text.delta";
	if (event === "response.reasoning_summary.delta") return "response.reasoning_text.delta";
	if (event === "response.output.delta") return "response.output_text.delta";
	if (event === "response.text.delta") return "response.output_text.delta";
	return event;
}
