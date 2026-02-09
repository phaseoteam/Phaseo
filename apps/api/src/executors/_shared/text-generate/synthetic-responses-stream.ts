import type { IRChatResponse } from "@core/ir";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";

export function createSyntheticResponsesStreamFromIR(
	ir: IRChatResponse,
	requestId?: string,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const response = encodeOpenAIResponsesResponse(ir, requestId ?? ir.id);
	const nativeId = response.nativeResponseId || ir.nativeId || response.id;
	const finalResponse = {
		...response,
		id: nativeId,
		nativeResponseId: nativeId,
	};

	return new ReadableStream<Uint8Array>({
		start(controller) {
			try {
				controller.enqueue(encoder.encode(`event: response.created\ndata: ${JSON.stringify({
					response: {
						id: nativeId,
						created_at: finalResponse.created,
						model: finalResponse.model,
					},
				})}\n\n`));
				controller.enqueue(encoder.encode(`event: response.completed\ndata: ${JSON.stringify({
					response: finalResponse,
				})}\n\n`));
			} finally {
				controller.close();
			}
		},
	});
}
