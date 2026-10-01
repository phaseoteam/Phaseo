import type { ExecutorExecuteArgs } from "@executors/types";
import { readSseEvents, sseReadable, SseProtocolError } from "@core/sse";
import { openAIResponsesToIR } from "./transform";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { applyStreamQuirks, normalizeResponsesEvent, type StreamAdapterState } from "./stream-shared";

export type { StreamAdapterState } from "./stream-shared";
export { transformChatStreamToResponses } from "./chat-to-responses-stream";

function readResponseToolCallName(item: any): string | null {
	const candidates = [
		item?.name,
		item?.function?.name,
		item?.tool_name,
		item?.tool?.name,
	];
	for (const candidate of candidates) {
		if (typeof candidate !== "string") continue;
		const trimmed = candidate.trim();
		if (trimmed && trimmed !== "tool_call") return trimmed;
	}
	return null;
}

function readResponseToolCallArguments(item: any): string | undefined {
	const raw =
		item?.arguments ??
		item?.function?.arguments ??
		item?.args ??
		item?.input;
	if (typeof raw === "string") return raw;
	if (raw == null) return undefined;
	try {
		return JSON.stringify(raw);
	} catch {
		return undefined;
	}
}

function isExecutableResponseToolItem(item: any): boolean {
	const itemType = String(item?.type ?? "").toLowerCase();
	return (itemType === "function_call" || itemType === "tool_call") && readResponseToolCallName(item) !== null;
}

export function transformChatStream(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
	state: StreamAdapterState,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return sseReadable(async function* (signal) {
		for await (const { data } of readSseEvents(stream, { signal })) {
			if (!data) continue;
			if (data === "[DONE]") {
				yield encoder.encode("data: [DONE]\n\n");
				return;
			}
			let payload: any;
			try { payload = JSON.parse(data); }
			catch { throw new SseProtocolError("sse_invalid_json"); }
			applyStreamQuirks(payload, state, args.providerId);
			yield encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
		}
		throw new SseProtocolError("sse_missing_terminal");
	});
}

export function transformResponsesStreamToChat(
	stream: ReadableStream<Uint8Array>,
	args: ExecutorExecuteArgs,
	state: StreamAdapterState,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let nativeResponseId: string | null = null;
	let created = Math.floor(Date.now() / 1000);
	let chatPassthrough = false;
	type Tool = { id: string; index: number; name: string; arguments: string; started: boolean };
	const tools = new Map<string, Tool>();
	const aliases = new Map<string, string>();
	let retainedArguments = 0;

	const canonicalId = (value: unknown): string | undefined =>
		typeof value === "string" && value ? aliases.get(value) ?? value : undefined;
	const getTool = (id: string, name: string): Tool => {
		const existing = tools.get(id);
		if (existing) {
			if (existing.name !== name) throw new SseProtocolError("sse_invalid_tool_delta");
			return existing;
		}
		if (tools.size >= 128 || id.length > 1024 || name.length > 1024) throw new SseProtocolError("sse_state_too_large");
		const tool = { id, index: tools.size, name, arguments: "", started: false };
		tools.set(id, tool);
		return tool;
	};
	const appendSnapshot = (tool: Tool, completeArguments: string): string => {
		// Done/item snapshots repeat the complete argument string, unlike deltas.
		// Never repeat the prefix already delivered to an append-based client.
		if (!completeArguments.startsWith(tool.arguments)) throw new SseProtocolError("sse_invalid_tool_delta");
		const delta = completeArguments.slice(tool.arguments.length);
		retainedArguments += delta.length;
		if (retainedArguments > 4 * 1024 * 1024) throw new SseProtocolError("sse_state_too_large");
		tool.arguments = completeArguments;
		return delta;
	};
	const emit = (payload: any): Uint8Array => {
		applyStreamQuirks(payload, state, args.providerId);
		return encoder.encode("data: " + JSON.stringify(payload) + "\n\n");
	};
	const emitDelta = (delta: Record<string, unknown>, extra?: Record<string, unknown>): Uint8Array => emit({
		object: "chat.completion.chunk", nativeResponseId, created,
		model: args.providerModelSlug ?? args.ir.model, provider: args.providerId,
		choices: [{ index: 0, delta, finish_reason: null, ...(extra ?? {}) }],
	});
	const emitTool = (tool: Tool, argumentDelta: string): Uint8Array => {
		const first = !tool.started;
		tool.started = true;
		return emitDelta({ role: "assistant", tool_calls: [{
			index: tool.index,
			...(first ? { id: tool.id, type: "function" } : {}),
			function: { ...(first ? { name: tool.name } : {}), arguments: argumentDelta },
		}] });
	};

	return sseReadable(async function* (signal) {
		for await (const { event, data } of readSseEvents(stream, { signal })) {
			if (!data) continue;
			if (data === "[DONE]") {
				if (!chatPassthrough) throw new SseProtocolError("sse_missing_terminal");
				yield encoder.encode("data: [DONE]\n\n"); return;
			}
			let payload: any;
			try { payload = JSON.parse(data); } catch { throw new SseProtocolError("sse_invalid_json"); }

			// Some compatible providers serve Chat wire data on /responses.
			if (payload?.object === "chat.completion.chunk" || payload?.object === "chat.completion") {
				chatPassthrough = true;
				yield emit(payload);
				if (payload.object === "chat.completion") { yield encoder.encode("data: [DONE]\n\n"); return; }
				continue;
			}
			const type = normalizeResponsesEvent(event ?? payload?.type ?? null);
			switch (type) {
				case "response.created":
					nativeResponseId = payload?.response?.id ?? payload?.id ?? nativeResponseId;
					created = payload?.response?.created_at ?? payload?.created_at ?? created;
					break;
				case "response.output_text.delta":
					if (typeof payload?.delta === "string") yield emitDelta({ role: "assistant", content: payload.delta }, payload.logprobs ? { logprobs: payload.logprobs } : undefined);
					break;
				case "response.reasoning_text.delta":
					if (typeof payload?.delta === "string") yield emitDelta({ role: "assistant", reasoning_content: payload.delta });
					break;
				case "response.output_item.added":
				case "response.output_item.done": {
					const item = payload?.item;
					if (!isExecutableResponseToolItem(item)) break;
					const name = readResponseToolCallName(item);
					const id = canonicalId(item?.call_id) ?? canonicalId(item?.id) ?? canonicalId(item?.tool_call_id) ?? canonicalId(payload?.item_id);
					if (!id || !name) break;
					const tool = getTool(id, name);
					for (const alias of [item?.call_id, item?.id, item?.tool_call_id, payload?.item_id]) {
						if (typeof alias !== "string" || !alias) continue;
						if (alias.length > 1024 || (!aliases.has(alias) && aliases.size >= 512)) throw new SseProtocolError("sse_state_too_large");
						if (aliases.has(alias) && aliases.get(alias) !== id) throw new SseProtocolError("sse_invalid_tool_delta");
						aliases.set(alias, id);
					}
					const delta = appendSnapshot(tool, readResponseToolCallArguments(item) ?? tool.arguments);
					if (!tool.started || delta) yield emitTool(tool, delta);
					break;
				}
				case "response.function_call_arguments.delta": {
					const id = canonicalId(payload?.item_id);
					const tool = id ? tools.get(id) : undefined;
					if (!tool || typeof payload?.delta !== "string") break;
					const delta = appendSnapshot(tool, tool.arguments + payload.delta);
					if (delta) yield emitTool(tool, delta);
					break;
				}
				case "response.function_call_arguments.done": {
					const id = canonicalId(payload?.item_id);
					const name = typeof payload?.name === "string" ? payload.name.trim() : undefined;
					if (!id) break;
					const tool = tools.get(id) ?? (name && name !== "tool_call" ? getTool(id, name) : undefined);
					if (!tool) break;
					const delta = appendSnapshot(tool, typeof payload?.arguments === "string" ? payload.arguments : tool.arguments);
					if (!tool.started || delta) yield emitTool(tool, delta);
					break;
				}
				case "response.completed":
				case "response.incomplete": {
					const response = payload?.response;
					if (!response || typeof response !== "object") throw new SseProtocolError("sse_invalid_json");
					const ir = openAIResponsesToIR(response, args.requestId, args.ir.model, args.providerId);
					yield emit(encodeOpenAIChatResponse(ir, args.requestId));
					yield encoder.encode("data: [DONE]\n\n");
					return;
				}
				case "response.failed":
				case "error":
					yield emit({ object: "error", error: payload?.response?.error ?? payload?.error ?? { message: "stream_error" } });
					return;
			}
		}
		throw new SseProtocolError("sse_missing_terminal");
	});
}
