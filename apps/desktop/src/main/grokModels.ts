import type { ModelOption } from "../shared/workspace";
import type { Stream } from "@agentclientprotocol/sdk";

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown, max = 1000): string | undefined => typeof value === "string" && value.trim() && value.length <= max ? value : undefined;
type Message = Stream["readable"] extends ReadableStream<infer Value> ? Value : never;
/** The stable SDK drops legacy model fields; preserve this native extension in metadata before validation. */
export function grokModelStream(stream: Stream): Stream {
	return { ...stream, readable: stream.readable.pipeThrough(new TransformStream<Message, Message>({ transform(message, controller) {
		const result = "result" in message ? record(message.result) : undefined;
		if (result?.models !== undefined) controller.enqueue({ ...message, result: { ...result, _meta: { ...record(result._meta), modelState: result.models } } });
		else controller.enqueue(message);
	} })) };
}
/** Only retain public model fields from Grok's initialization/session metadata. */
export function grokModels(value: unknown): ModelOption[] {
	const state = record(value);
	if (!state || !Array.isArray(state.availableModels)) return [];
	if (state.availableModels.length > 1000) throw new Error("The Grok model catalog exceeds its limit.");
	const seen = new Set<string>();
	return state.availableModels.flatMap(value => {
		const model = record(value); const id = text(model?.modelId); const name = text(model?.name);
		if (!model || !id || !name || seen.has(id)) return []; seen.add(id);
		const meta = record(model._meta); const effortIds = new Set<string>();
		const reasoningEfforts = Array.isArray(meta?.reasoningEfforts) ? meta.reasoningEfforts.slice(0, 100).flatMap(value => {
			const effort = record(value); const id = text(effort?.id, 100);
			if (!id || effortIds.has(id)) return []; effortIds.add(id);
			return [{ id, description: text(effort?.description, 2000) ?? text(effort?.label) ?? id }];
		}) : [];
		const defaultEffort = text(meta?.reasoningEffort, 100);
		return [{ id, name, default: id === state.currentModelId, ...(text(model.description, 2000) ? { description: text(model.description, 2000) } : {}), ...(reasoningEfforts.length ? { reasoningEfforts, ...(defaultEffort && effortIds.has(defaultEffort) ? { defaultReasoningEffort: defaultEffort } : {}) } : {}) }];
	});
}
