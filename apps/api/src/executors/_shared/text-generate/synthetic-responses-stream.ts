import type { IRChatResponse } from "@core/ir";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";

export function createSyntheticResponsesStreamFromIR(
	ir: IRChatResponse,
	requestId?: string,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const response = encodeOpenAIResponsesResponse(ir, requestId ?? ir.id);
	const nativeId = ir.nativeId || response.nativeResponseId || response.id;
	const finalResponse = {
		...response,
		id: nativeId,
		nativeResponseId: nativeId,
	};
	const emit = (controller: ReadableStreamDefaultController<Uint8Array>, type: string, payload: Record<string, unknown>) => {
		controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`));
	};

	return new ReadableStream<Uint8Array>({
		start(controller) {
			try {
				emit(controller, "response.created", {
					response: {
						id: nativeId,
						created_at: finalResponse.created,
						model: finalResponse.model,
						object: "response",
						status: "in_progress",
					},
				});

				for (const [outputIndex, rawItem] of finalResponse.output.entries()) {
					const item: any = {
						...rawItem,
						id: (rawItem as any).id ?? `${nativeId}-output-${outputIndex}`,
						status: "in_progress",
					};
					emit(controller, "response.output_item.added", { item, output_index: outputIndex });

					if (item.type === "message") {
						for (const part of Array.isArray(item.content) ? item.content : []) {
							if (part?.type !== "output_text" || typeof part.text !== "string") continue;
							emit(controller, "response.output_text.delta", {
								item_id: item.id,
								output_index: outputIndex,
								content_index: 0,
								delta: part.text,
							});
							emit(controller, "response.output_text.done", {
								item_id: item.id,
								output_index: outputIndex,
								content_index: 0,
								text: part.text,
							});
						}
					} else if (item.type === "reasoning") {
						for (const part of Array.isArray(item.content) ? item.content : []) {
							if (part?.type !== "output_text" || typeof part.text !== "string") continue;
							emit(controller, "response.reasoning.delta", { item_id: item.id, delta: part.text });
						}
					} else if (item.type === "function_call") {
						emit(controller, "response.function_call_arguments.delta", {
							item_id: item.id,
							call_id: item.call_id ?? item.id,
							name: item.name,
							delta: item.arguments ?? "",
						});
						emit(controller, "response.function_call_arguments.done", {
							item_id: item.id,
							call_id: item.call_id ?? item.id,
							name: item.name,
							arguments: item.arguments ?? "",
						});
					}

					emit(controller, "response.output_item.done", {
						item: { ...item, status: "completed" },
						output_index: outputIndex,
					});
				}

				emit(controller, "response.completed", { response: finalResponse });
			} finally {
				controller.close();
			}
		},
	});
}
