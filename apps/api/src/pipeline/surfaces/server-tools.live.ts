import type { Protocol } from "@protocols/detect";
import { encodeUnifiedStreamEvent, type StreamProtocol } from "@protocols/stream/encode";
import { dispatchBackground } from "@/runtime/env";
import { createToolCallKeyResolver, extractUnifiedStreamEvents, type UnifiedStreamEvent } from "../after/stream-events";
import { createResponsesStreamNormaliser } from "../after/responses-stream-normaliser";
import { argumentsToSend, type ArgumentsSent } from "../after/stream-reencode";
import { responsesOutputItemFrames, serverToolTraceOutputItem, type ServerToolTraceItem } from "./server-tools.stream";

type LiveProtocol = Extract<Protocol, StreamProtocol>;

export type ManagedToolLiveSink = {
	signal: AbortSignal;
	ready(): void;
	beginRound(): (event: UnifiedStreamEvent) => void;
	toolResult(item: ServerToolTraceItem): void;
	markFinalTurnBuffered(): void;
};

type ToolEvent = Extract<UnifiedStreamEvent, { type: "delta_tool" }>;
type TextChannel = "output_text" | "reasoning_text";

/** Text or reasoning streamed in one round: a Responses item or a Messages block. */
type LiveText = { channel: TextChannel; key: string; index: number; id: string; text: string };

/** A tool call a model turn made, with the arguments streamed or held so far. */
type LiveCall = {
	index: number;
	/** The Chat choice that made the call. */
	choiceIndex: number;
	id: string;
	callId?: string;
	upstreamKey?: string;
	name?: string;
	args: string;
	sent: ArgumentsSent;
	argsDone: boolean;
	done: boolean;
	result?: ServerToolTraceItem;
};

type LiveRound = {
	texts: LiveText[];
	openText: LiveText | null;
	calls: Map<string, LiveCall>;
	callOrder: LiveCall[];
	toolKey: ReturnType<typeof createToolCallKeyResolver>;
	channels: Set<TextChannel>;
};

type ParsedFrame = { eventName: string; payload: any };

function parseFrame(raw: string): ParsedFrame | null {
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

function newRound(): LiveRound {
	return { texts: [], openText: null, calls: new Map(), callOrder: [], toolKey: createToolCallKeyResolver(), channels: new Set() };
}

/**
 * Keep one public SSE response open across every internal model and server-tool turn.
 * Each turn's output reaches the client in the client protocol's own grammar, as a
 * request without server tools streams it: Responses items are added, receive their
 * deltas and are done (a server tool's call is done with its result); Messages blocks
 * start, receive their deltas and stop. Chat and Messages have no form for a call the
 * gateway already ran, so their clients get only the calls left for them to run, as the
 * buffered body returns them. The last turn's body (the pipeline's synthetic stream)
 * supplies what that turn did not stream live and the terminal event.
 */
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
	const responses = args.protocol === "openai.responses";
	const chat = args.protocol === "openai.chat.completions";
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			// Responses frames get one event name (SSE line and data.type), sequence
			// numbers and the part events, as every other Responses stream does.
			const normaliser = responses ? createResponsesStreamNormaliser() : null;
			let pending = "";
			const write = (eventName: string | null | undefined, payload: any) => {
				const frames = normaliser ? normaliser.normalise(eventName, payload) : [{ eventName: eventName ?? null, frame: payload }];
				for (const { eventName: name, frame } of frames) {
					pending += `${name ? `event: ${name}\n` : ""}data: ${JSON.stringify(frame)}\n\n`;
				}
			};
			/** Send what one source event produced as one chunk. */
			const flush = () => {
				if (!pending) return;
				const chunk = pending;
				pending = "";
				if (!closed) controller.enqueue(encoder.encode(chunk));
			};
			const emit = (event: UnifiedStreamEvent) => {
				const encoded = encodeUnifiedStreamEvent(args.protocol, event, { requestId: args.requestId, model: args.model });
				if (encoded) write(encoded.eventName, encoded.frame);
			};

			const rounds: LiveRound[] = [];
			/** Responses items in output order, from every round and tool result. */
			const items: Array<LiveText | LiveCall> = [];
			let nextIndex = 0;
			/** Tool call indexes sent to Chat clients so far, per choice. */
			const shownCalls = new Map<number, number>();
			let openBlock: LiveText | null = null;
			let outputText = "";
			let finalTurnBuffered = false;
			const executed = new Set<string>();

			const completedText = (text: LiveText) => text.channel === "output_text"
				? { id: text.id, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: text.text, annotations: [] }] }
				: { id: text.id, type: "reasoning", summary: [], content: [{ type: "reasoning_text", text: text.text }] };
			const completedCall = (call: LiveCall) => call.result
				? { ...serverToolTraceOutputItem(call.result), id: call.id }
				: { id: call.id, type: "function_call", call_id: call.callId ?? call.upstreamKey ?? call.id, name: call.name, arguments: call.args, status: "completed" };

			const closeText = (round: LiveRound) => {
				const text = round.openText;
				if (!text) return;
				round.openText = null;
				if (responses) write("response.output_item.done", { output_index: text.index, item: completedText(text) });
				else if (!chat && openBlock === text) {
					openBlock = null;
					write("content_block_stop", { type: "content_block_stop", index: text.index });
				}
			};
			const textFor = (round: LiveRound, channel: TextChannel, event: UnifiedStreamEvent): LiveText => {
				const upstreamId = typeof (event as any).payload?.item_id === "string" ? (event as any).payload.item_id : null;
				const key = `${channel}:${upstreamId ?? (event as any).choiceIndex ?? 0}`;
				if (round.openText?.key === key) return round.openText;
				closeText(round);
				const index = nextIndex++;
				const reasoning = channel === "reasoning_text";
				const text: LiveText = { channel, key, index, id: `${reasoning ? "rs" : "msg"}_${args.requestId}_${index}`, text: "" };
				round.texts.push(text);
				round.openText = text;
				items.push(text);
				if (responses) {
					write("response.output_item.added", {
						output_index: index,
						item: reasoning
							? { id: text.id, type: "reasoning", summary: [], content: [] }
							: { id: text.id, type: "message", role: "assistant", status: "in_progress", content: [] },
					});
				} else {
					openBlock = text;
					write("content_block_start", {
						type: "content_block_start",
						index,
						content_block: reasoning ? { type: "thinking", thinking: "" } : { type: "text", text: "" },
					});
				}
				return text;
			};
			const writeText = (round: LiveRound, event: Extract<UnifiedStreamEvent, { type: "delta_text" }>) => {
				round.channels.add(event.channel);
				if (event.channel === "output_text") outputText += event.text;
				if (chat) {
					emit(event);
					return;
				}
				const text = textFor(round, event.channel, event);
				text.text += event.text;
				if (responses) {
					write(event.channel === "reasoning_text" ? "response.reasoning_text.delta" : "response.output_text.delta", {
						item_id: text.id,
						output_index: text.index,
						content_index: 0,
						delta: event.text,
					});
				} else {
					emit({ ...event, choiceIndex: text.index });
				}
			};

			const findCall = (id: string) => rounds.flatMap((round) => round.callOrder)
				.find((call) => call.callId === id || call.upstreamKey === id);
			const callFor = (round: LiveRound, event: ToolEvent): LiveCall | null => {
				const key = round.toolKey(event);
				let call = round.calls.get(key);
				if (!call) {
					const name = event.toolName && event.toolName !== "tool_call" ? event.toolName : undefined;
					if (!name) return null;
					// Responses items are numbered as they start; Chat and Messages calls when sent.
					const index = responses ? nextIndex++ : -1;
					const upstreamKey = event.toolCallKey ?? event.toolCallId;
					call = {
						index,
						choiceIndex: event.choiceIndex ?? 0,
						id: upstreamKey ?? `fc_${args.requestId}_${index}`,
						callId: event.toolCallId,
						upstreamKey,
						name,
						args: "",
						sent: "none",
						argsDone: false,
						done: false,
					};
					round.calls.set(key, call);
					round.callOrder.push(call);
					if (responses) {
						// Items stream one after another: the text before a call is done when it starts.
						closeText(round);
						items.push(call);
						write("response.output_item.added", {
							output_index: index,
							item: { id: call.id, type: "function_call", call_id: call.callId ?? call.id, name, arguments: "", status: "in_progress" },
						});
					}
				}
				call.callId ??= event.toolCallId;
				return call;
			};
			const writeTool = (round: LiveRound, event: ToolEvent) => {
				const call = callFor(round, event);
				if (!call || call.done) return;
				const partial = argumentsToSend(call, event);
				if (!partial) return;
				call.args += partial;
				// Chat and Messages hold a call until its turn ends: a call the gateway runs is never shown.
				if (responses) write("response.function_call_arguments.delta", { item_id: call.id, output_index: call.index, delta: partial });
			};
			const finishArguments = (round: LiveRound) => {
				for (const call of round.callOrder) {
					if (call.argsDone) continue;
					call.argsDone = true;
					if (responses) write("response.function_call_arguments.done", { item_id: call.id, output_index: call.index, name: call.name, arguments: call.args });
				}
			};
			const finishCall = (call: LiveCall) => {
				if (call.done) return;
				call.done = true;
				if (responses) {
					write("response.output_item.done", { output_index: call.index, item: completedCall(call) });
					return;
				}
				if (call.callId && executed.has(call.callId)) return;
				if (chat) {
					const toolIndex = shownCalls.get(call.choiceIndex) ?? 0;
					shownCalls.set(call.choiceIndex, toolIndex + 1);
					write(null, {
						object: "chat.completion.chunk",
						choices: [{
							index: call.choiceIndex,
							delta: { tool_calls: [{ index: toolIndex, id: call.callId ?? call.id, type: "function", function: { name: call.name, arguments: call.args } }] },
							finish_reason: null,
						}],
					});
					return;
				}
				const index = nextIndex++;
				write("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: call.callId ?? call.id, name: call.name, input: {} } });
				if (call.args) write("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: call.args } });
				write("content_block_stop", { type: "content_block_stop", index });
			};
			/** A finished turn: its items are done; calls the gateway did not run are sent. */
			const closeRound = (round: LiveRound) => {
				closeText(round);
				finishArguments(round);
				for (const call of round.callOrder) finishCall(call);
			};
			const handleRoundEvent = (round: LiveRound, event: UnifiedStreamEvent) => {
				if (event.type === "error") emit(event);
				else if (event.type === "delta_text") writeText(round, event);
				else if (event.type === "delta_tool") writeTool(round, event);
				else if (event.type === "delta_content_part") emit(responses ? { ...event, choiceIndex: nextIndex++ } : event);
			};

			if (args.protocol !== "anthropic.messages") emit({ type: "start", protocol: args.protocol });
			else {
				// The documented message_start: an empty message the blocks below fill in.
				write("message_start", {
					type: "message_start",
					message: {
						id: args.requestId,
						type: "message",
						role: "assistant",
						model: args.model,
						content: [],
						stop_reason: null,
						stop_sequence: null,
						usage: { input_tokens: 0, output_tokens: 0 },
					},
				});
			}
			flush();
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
					const previous = rounds.at(-1);
					if (previous) {
						closeRound(previous);
						flush();
					}
					const round = newRound();
					rounds.push(round);
					return (event) => {
						if (event.type !== "delta_text" && event.type !== "delta_tool" && event.type !== "delta_content_part" && event.type !== "error") {
							return;
						}
						handleRoundEvent(round, event);
						flush();
					};
				},
				toolResult(item) {
					executed.add(item.id);
					if (!responses) return;
					const call = findCall(item.id);
					if (call) {
						const round = rounds.find((candidate) => candidate.callOrder.includes(call))!;
						closeText(round);
						finishArguments(round);
						call.result = item;
						finishCall(call);
					} else {
						// The turn that made this call was not streamed: send the call whole, with its result.
						const { frames, items: [sent] } = responsesOutputItemFrames([serverToolTraceOutputItem(item)], { firstOutputIndex: nextIndex, idPrefix: `fc_${args.requestId}` });
						for (const frame of frames) write(frame.eventName, frame.frame);
						items.push({ index: nextIndex++, choiceIndex: 0, id: sent.id, callId: item.id, name: item.name, args: item.arguments ?? "", sent: "full", argsDone: true, done: true, result: item });
					}
					flush();
				},
			};
			const completion = args.run(sink).then(async (response) => {
				if (!readyCalled) resolveEarlyResponse(response.clone());
				if (!response.ok || !response.body) {
					emit({ type: "error", message: `Managed tool request failed with status ${response.status}.` });
					flush();
					return;
				}
				let terminal: ParsedFrame | null = null;
				const chatFinal: ParsedFrame[] = [];
				const anthropicFinal: ParsedFrame[] = [];
				const finalEvents: UnifiedStreamEvent[] = [];
				const handleFrame = (frame: ParsedFrame) => {
					if (responses) {
						if (["response.completed", "response.failed", "response.incomplete"].includes(frame.eventName)) terminal = frame;
						return;
					}
					for (const event of extractUnifiedStreamEvents({ protocol: args.protocol, eventName: frame.eventName, frame: frame.payload })) {
						if (event.type === "delta_text" || event.type === "delta_tool") finalEvents.push(event);
					}
					if (chat && (frame.payload?.choices?.some((choice: any) => choice.finish_reason) || frame.payload?.usage)) {
						chatFinal.push(frame);
					} else if (!chat && frame.eventName === "message_delta") {
						anthropicFinal.push(frame);
					}
				};
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffered = "";
				while (true) {
					const chunk = await reader.read();
					if (chunk.done) break;
					buffered += decoder.decode(chunk.value, { stream: true });
					const rawFrames = buffered.split(/\r?\n\r?\n/);
					buffered = rawFrames.pop() ?? "";
					for (const raw of rawFrames) {
						const frame = parseFrame(raw);
						if (frame) handleFrame(frame);
					}
				}
				const trailing = parseFrame(buffered + decoder.decode());
				if (trailing) handleFrame(trailing);

				// The last turn's own round, when it streamed live.
				const lastRound = finalTurnBuffered ? null : (rounds.at(-1) ?? null);
				if (responses) {
					for (const round of rounds) closeRound(round);
					const final = terminal as ParsedFrame | null;
					const body = final?.payload?.response;
					if (!final) emit({ type: "error", message: "Managed tool stream ended without a terminal response." });
					else if (body && typeof body === "object") {
						const liveFinal: Array<LiveText | LiveCall> = lastRound ? [...lastRound.texts, ...lastRound.callOrder] : [];
						const matched = new Set<LiveText | LiveCall>();
						const match = (item: any): LiveText | LiveCall | undefined => liveFinal.find((live) => {
							if (matched.has(live)) return false;
							if ("channel" in live) {
								if (item?.type === "message") return live.channel === "output_text";
								const hasText = Array.isArray(item?.content) && item.content.some((part: any) => typeof part?.text === "string" && part.text);
								return item?.type === "reasoning" && hasText && live.channel === "reasoning_text";
							}
							return item?.type === "function_call" && typeof item.call_id === "string" &&
								(live.callId === item.call_id || live.upstreamKey === item.call_id);
						});
						// The last turn's body is the authority for its output; what it holds that
						// did not stream live (a buffered turn, text only in the final snapshot,
						// a call signature) is sent now, as items of their own.
						const finalOutput: any[] = Array.isArray(body.output) ? body.output : [];
						const slots: Array<{ item: any; live?: LiveText | LiveCall }> = finalOutput.map((item) => {
							const live = match(item);
							if (live) matched.add(live);
							return { item, live };
						});
						const unstreamed = slots.filter((slot) => !slot.live);
						const sent = responsesOutputItemFrames(unstreamed.map((slot) => slot.item), { firstOutputIndex: nextIndex, idPrefix: `item_${args.requestId}` });
						nextIndex += sent.items.length;
						unstreamed.forEach((slot, position) => { slot.item = sent.items[position]; });
						for (const frame of sent.frames) {
							if (frame.eventName === "response.output_text.delta") outputText += frame.frame.delta;
							write(frame.eventName, frame.frame);
						}
						const earlier = items
							.filter((item) => !liveFinal.includes(item))
							.sort((a, b) => a.index - b.index)
							.map((item) => ("channel" in item ? completedText(item) : completedCall(item)));
						// A streamed item keeps the id and status its done event had.
						const streamed = (slot: { item: any; live?: LiveText | LiveCall }) => ({
							...(slot.item?.type === "reasoning" ? {} : { status: "completed" }),
							...slot.item,
							id: slot.live!.id,
						});
						body.output = [...earlier, ...slots.map((slot) => (slot.live ? streamed(slot) : slot.item))];
						if (outputText) body.output_text = outputText;
					}
					if (final) write(final.eventName, final.payload);
				} else {
					// What the last turn did not stream live comes from its body: everything for a
					// buffered turn, otherwise text that reached only the final snapshot and calls
					// not seen yet. Calls the gateway ran are not shown.
					const round = lastRound ?? newRound();
					if (!lastRound) rounds.push(round);
					const streamedChannels = new Set(round.channels);
					for (const event of finalEvents) {
						if (event.type === "delta_text") {
							if (!streamedChannels.has(event.channel)) writeText(round, event);
						} else if (event.type === "delta_tool") {
							if (event.toolCallId && (executed.has(event.toolCallId) || findCall(event.toolCallId))) continue;
							// The body's calls carry their own ids; its block indexes are not unique.
							writeTool(round, event.toolCallId ? { ...event, toolCallKey: undefined, toolIndex: undefined } : event);
						}
					}
					for (const live of rounds) closeRound(live);
					if (chat) {
						for (const frame of chatFinal) write(frame.eventName, frame.payload);
					} else {
						// One message_delta with both the stop reason and usage, as Messages clients read it.
						const withStop = anthropicFinal.filter((frame) => frame.payload?.delta && typeof frame.payload.delta === "object");
						const usage = anthropicFinal.reduce<Record<string, any> | null>((merged, frame) =>
							frame.payload?.usage && typeof frame.payload.usage === "object" ? { ...(merged ?? {}), ...frame.payload.usage } : merged, null);
						const delta = withStop.at(-1)?.payload?.delta ?? {};
						if (anthropicFinal.length > 0) {
							write("message_delta", {
								type: "message_delta",
								delta: { stop_reason: delta.stop_reason ?? null, stop_sequence: delta.stop_sequence ?? null },
								usage: usage ?? { output_tokens: 0 },
							});
						}
						write("message_stop", { type: "message_stop" });
					}
				}
				flush();
				if (args.protocol !== "anthropic.messages" && !closed) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			}).catch((error) => {
				if (!readyCalled) {
					resolveEarlyResponse(new Response(JSON.stringify({ error: { message: error instanceof Error ? error.message : "managed_tool_stream_error" } }), {
						status: 500,
						headers: { "Content-Type": "application/json" },
					}));
				}
				emit({ type: "error", message: error instanceof Error ? error.message : "managed_tool_stream_error" });
				flush();
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
