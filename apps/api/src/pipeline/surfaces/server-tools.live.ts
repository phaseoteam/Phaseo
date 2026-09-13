import type { Protocol } from "@protocols/detect";
import { encodeUnifiedStreamEvent, type StreamProtocol } from "@protocols/stream/encode";
import { dispatchBackground } from "@/runtime/env";
import type { UnifiedStreamEvent } from "../after/stream-events";
import type { ServerToolTraceItem } from "./server-tools.stream";

type LiveProtocol = Extract<Protocol, StreamProtocol>;

export type ManagedToolLiveSink = {
	signal: AbortSignal;
	ready(): void;
	beginRound(): (event: UnifiedStreamEvent) => void;
	toolResult(item: ServerToolTraceItem): void;
	markFinalTurnBuffered(): void;
};

function parseFrame(raw: string): { eventName: string; payload: any } | null {
	let eventName = "";
	const data: string[] = [];
	for (const line of raw.split(/\r?\n/)) {
		if (line.startsWith("event:")) eventName = line.slice(6).trim();
		if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
	}
	if (!data.length || data.join("").trim() === "[DONE]") return null;
	try {
		return { eventName, payload: JSON.parse(data.join("")) };
	} catch {
		return null;
	}
}

/** Keep one public SSE response open across every internal model and server-tool turn. */
export async function createManagedToolLiveResponse(args: {
	protocol: LiveProtocol;
	requestId: string;
	model: string;
	run: (sink: ManagedToolLiveSink) => Promise<Response>;
}): Promise<Response> {
	const encoder = new TextEncoder();
	const abortController = new AbortController();
	let closed = false;
	let readyCalled = false;
	let resolveReady!: () => void;
	let resolveEarlyResponse!: (response: Response) => void;
	const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
	const earlyResponse = new Promise<Response>((resolve) => { resolveEarlyResponse = resolve; });
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let sequenceNumber = 0;
			let nextOutputIndex = 0;
			let outputText = "";
			let finalTurnBuffered = false;
			const rounds: Array<{ text: string; tools: Map<string, { id: string; callId: string; name: string; arguments: string; index: number }> }> = [];
			const enqueue = (eventName: string | null | undefined, payload: any) => {
				if (closed) return;
				const frame = args.protocol === "openai.responses" && eventName
					? { ...payload, type: eventName, sequence_number: sequenceNumber++ }
					: payload;
				controller.enqueue(encoder.encode(`${eventName ? `event: ${eventName}\n` : ""}data: ${JSON.stringify(frame)}\n\n`));
			};
			const emit = (event: UnifiedStreamEvent) => {
				const encoded = encodeUnifiedStreamEvent(args.protocol, event, { requestId: args.requestId, model: args.model });
				if (encoded) enqueue(encoded.eventName, encoded.frame);
			};
			emit({ type: "start", protocol: args.protocol });
			const sink: ManagedToolLiveSink = {
				signal: abortController.signal,
				ready() {
					if (readyCalled) return;
					readyCalled = true;
					resolveReady();
				},
				markFinalTurnBuffered() {
					finalTurnBuffered = true;
				},
				beginRound() {
					sink.ready();
					finalTurnBuffered = false;
					const round = { text: "", tools: new Map<string, { id: string; callId: string; name: string; arguments: string; index: number }>() };
					rounds.push(round);
					const offset = nextOutputIndex;
					let maxIndex = 0;
					nextOutputIndex += 1;
					return (event) => {
						if (event.type !== "delta_text" && event.type !== "delta_tool" && event.type !== "delta_content_part" && event.type !== "error") {
							return;
						}
						if (event.type === "error") {
							emit(event);
							return;
						}
						if (event.type === "delta_text" && event.channel === "output_text") {
							outputText += event.text;
							round.text += event.text;
						}
						const normalizedEvent = event.type === "delta_tool"
							? { ...event, toolCallId: event.toolCallId ?? event.toolCallKey }
							: event;
						const index = args.protocol === "openai.responses" && Number.isInteger(event.payload?.output_index) && event.payload.output_index >= 0
							? event.payload.output_index
							: (event.choiceIndex ?? 0);
						if (normalizedEvent.type === "delta_tool" && normalizedEvent.toolCallId && normalizedEvent.toolName && normalizedEvent.arguments !== undefined) {
							round.tools.set(normalizedEvent.toolCallId, {
								id: normalizedEvent.toolCallKey ?? normalizedEvent.toolCallId,
								callId: normalizedEvent.toolCallId,
								name: normalizedEvent.toolName,
								arguments: normalizedEvent.arguments,
								index: offset + index,
							});
						}
						if (event.type === "delta_tool" && args.protocol === "openai.chat.completions" && event.arguments !== undefined && event.argumentsDelta === undefined) {
							return;
						}
						maxIndex = Math.max(maxIndex, index);
						nextOutputIndex = Math.max(nextOutputIndex, offset + maxIndex + 1);
						emit(args.protocol === "openai.chat.completions" ? normalizedEvent : { ...normalizedEvent, choiceIndex: offset + index });
					};
				},
				toolResult(item) {
					if (args.protocol !== "openai.responses") return;
					const call = rounds.flatMap((round) => [...round.tools.values()]).find((tool) => tool.callId === item.id);
					emit({ type: "delta_tool", toolCallId: item.id, toolName: item.name, arguments: item.arguments, choiceIndex: call?.index ?? nextOutputIndex, payload: { server_tool_result: { output: item.output, is_error: item.isError } } });
				},
			};
			const completion = args.run(sink).then(async (response) => {
				if (!readyCalled) resolveEarlyResponse(response.clone());
				if (!response.ok || !response.body) {
					emit({ type: "error", message: `Managed tool request failed with status ${response.status}.` });
					return;
				}
				const body = await response.text();
				const frames = body.split(/\r?\n\r?\n/).map(parseFrame).filter((frame): frame is NonNullable<typeof frame> => Boolean(frame));
				if (finalTurnBuffered || rounds.at(-1)?.text.length === 0) {
					for (const frame of frames) {
						if (args.protocol === "openai.responses" && frame.eventName === "response.output_text.delta") {
							const delta = frame.payload?.delta;
							if (typeof delta === "string") { outputText += delta; enqueue(frame.eventName, { ...frame.payload, output_index: nextOutputIndex }); }
						} else if (args.protocol === "openai.chat.completions") {
							const choices = frame.payload?.choices;
							if (Array.isArray(choices) && choices.some((choice: any) => choice.delta?.content || choice.delta?.reasoning_content)) {
								enqueue(frame.eventName, frame.payload);
							}
						} else if (args.protocol === "anthropic.messages" && frame.eventName === "content_block_delta") {
							enqueue(frame.eventName, { ...frame.payload, index: nextOutputIndex });
						}
					}
				}
				if (args.protocol === "openai.responses") {
					const terminal = [...frames].reverse().find((frame) => ["response.completed", "response.failed", "response.incomplete"].includes(frame.eventName));
					if (terminal) {
						if (terminal.payload?.response) {
							const preceding = rounds.slice(0, finalTurnBuffered ? undefined : -1).flatMap((round) => [
								...(round.text ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: round.text }] }] : []),
								...[...round.tools.values()].sort((a, b) => a.index - b.index).map((tool) => ({
									type: "function_call", id: tool.id, call_id: tool.callId, name: tool.name, arguments: tool.arguments, status: "completed",
								})),
							]);
							const finalOutput = Array.isArray(terminal.payload.response.output) ? terminal.payload.response.output : [];
							if (!finalTurnBuffered && finalOutput.length === 0 && rounds.at(-1)?.text) {
								finalOutput.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: rounds.at(-1)!.text }] });
							}
							terminal.payload.response.output = [...preceding, ...finalOutput];
							if (outputText) terminal.payload.response.output_text = outputText;
						}
						enqueue(terminal.eventName, terminal.payload);
					} else emit({ type: "error", message: "Managed tool stream ended without a terminal response." });
				} else if (args.protocol === "openai.chat.completions") {
					for (const frame of frames.filter((frame) => frame.payload?.choices?.some((choice: any) => choice.finish_reason) || frame.payload?.usage)) enqueue(frame.eventName, frame.payload);
				} else {
					for (const frame of frames.filter((frame) => frame.eventName === "message_delta" || frame.eventName === "message_stop")) enqueue(frame.eventName, frame.payload);
					if (!frames.some((frame) => frame.eventName === "message_stop")) enqueue("message_stop", { type: "message_stop" });
				}
				if (args.protocol !== "anthropic.messages" && !closed) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			}).catch((error) => {
				if (!readyCalled) {
					resolveEarlyResponse(new Response(JSON.stringify({ error: { message: error instanceof Error ? error.message : "managed_tool_stream_error" } }), {
						status: 500,
						headers: { "Content-Type": "application/json" },
					}));
				}
				emit({ type: "error", message: error instanceof Error ? error.message : "managed_tool_stream_error" });
			}).finally(() => {
				if (closed) return;
				closed = true;
				controller.close();
			});
			dispatchBackground(completion);
		},
		cancel() {
			closed = true;
			abortController.abort();
		},
	});
	const liveResponse = new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" } });
	return Promise.race([ready.then(() => liveResponse), earlyResponse]);
}
