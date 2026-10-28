// Purpose: Replay a Responses stream the way the OpenAI SDK's `responses.stream()` helper does.
// Why: The helper builds its snapshot from `response.created.response`, appends each
//      `output_item.added` item at exactly the next index, writes deltas into the content
//      part named by `content_index`, and throws when any of that is missing. A stream that
//      looks fine frame by frame can still break `finalResponse()`.
// How: A small mirror of the SDK accumulator's checks (openai-node
//      src/internal/responses/response-accumulator.ts), enough for gateway-built streams.

export type ResponsesFrame = { event: string; data: any };

function fail(message: string): never {
	throw new Error(`Responses stream helper would fail: ${message}`);
}

function outputAt(snapshot: any, index: unknown, itemId?: unknown) {
	if (!Number.isSafeInteger(index)) fail(`output_index ${String(index)} is not an integer`);
	const output = snapshot.output[index as number];
	if (!output) fail(`missing output at index ${String(index)}`);
	if (itemId !== undefined && output.id !== itemId) fail(`item_id ${String(itemId)} does not match output ${String(output.id)}`);
	return output;
}

function contentAt(output: any, index: unknown, type: string) {
	if (!Array.isArray(output.content)) fail(`output ${String(output.id)} has no content`);
	if (!Number.isSafeInteger(index)) fail(`content_index ${String(index)} is not an integer`);
	const part = output.content[index as number];
	if (!part) fail(`missing content at index ${String(index)}`);
	if (part.type !== type) fail(`expected content to be '${type}', got ${String(part.type)}`);
	return part;
}

/**
 * Accumulate a Responses stream and return what `finalResponse()` would, plus the
 * snapshot built from the streamed events (before the terminal event replaced it).
 */
export function accumulateResponsesStream(frames: ResponsesFrame[]): { finalResponse: any; streamed: any } {
	let snapshot: any = null;
	let streamed: any = null;
	let finalResponse: any = null;
	for (const { event, data } of frames) {
		if (event === "response.created") {
			if (snapshot) fail("a second response.created");
			if (!data?.response) fail("response.created has no response");
			snapshot = structuredClone(data.response);
			snapshot.output ??= [];
			continue;
		}
		if (!snapshot) fail(`${event} before response.created`);
		if (/^response\.(completed|incomplete|failed)$/.test(event)) {
			if (data?.response?.id !== snapshot.id) fail(`response id changed from ${snapshot.id} to ${data?.response?.id}`);
			streamed = snapshot;
			finalResponse = structuredClone(data.response);
			if (!Array.isArray(finalResponse.output)) fail("terminal response has no output");
			continue;
		}
		switch (event) {
			case "response.output_item.added":
				if (data.output_index !== snapshot.output.length) fail(`output_index ${data.output_index} is not the next index ${snapshot.output.length}`);
				snapshot.output.push(structuredClone(data.item));
				break;
			case "response.output_item.done": {
				const output = outputAt(snapshot, data.output_index);
				if (output.type !== data.item?.type || output.id !== data.item?.id) fail(`output_item.done changed item ${String(output.id)}`);
				snapshot.output[data.output_index] = structuredClone(data.item);
				break;
			}
			case "response.content_part.added": {
				const output = outputAt(snapshot, data.output_index, data.item_id);
				output.content ??= [];
				if (data.content_index !== output.content.length) fail(`content_index ${data.content_index} is not the next part`);
				output.content.push(structuredClone(data.part));
				break;
			}
			case "response.content_part.done": {
				const output = outputAt(snapshot, data.output_index, data.item_id);
				contentAt(output, data.content_index, data.part?.type);
				output.content[data.content_index] = structuredClone(data.part);
				break;
			}
			case "response.output_text.delta":
				contentAt(outputAt(snapshot, data.output_index, data.item_id), data.content_index, "output_text").text += data.delta;
				break;
			case "response.output_text.done":
				contentAt(outputAt(snapshot, data.output_index, data.item_id), data.content_index, "output_text").text = data.text;
				break;
			case "response.reasoning_text.delta":
				contentAt(outputAt(snapshot, data.output_index, data.item_id), data.content_index, "reasoning_text").text += data.delta;
				break;
			case "response.reasoning_text.done":
				contentAt(outputAt(snapshot, data.output_index, data.item_id), data.content_index, "reasoning_text").text = data.text;
				break;
			case "response.function_call_arguments.delta": {
				const output = outputAt(snapshot, data.output_index, data.item_id);
				if (output.type === "function_call") output.arguments += data.delta;
				break;
			}
			default:
				break;
		}
	}
	if (!finalResponse) fail("stream ended without producing a Response");
	return { finalResponse, streamed };
}

/** Whether each output item was announced and closed, by output index. */
export function itemLifecycle(frames: ResponsesFrame[]): Array<{ index: number; type: string; added: boolean; done: boolean }> {
	const items = new Map<number, { index: number; type: string; added: boolean; done: boolean }>();
	for (const { event, data } of frames) {
		if (event === "response.output_item.added") items.set(data.output_index, { index: data.output_index, type: data.item?.type, added: true, done: false });
		if (event === "response.output_item.done") {
			const item = items.get(data.output_index) ?? { index: data.output_index, type: data.item?.type, added: false, done: false };
			item.done = true;
			items.set(data.output_index, item);
		}
	}
	return [...items.values()].sort((left, right) => left.index - right.index);
}
