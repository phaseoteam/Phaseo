// Purpose: Structured-output fallback helpers for OpenAI-compatible providers.
// Why: Many providers only support json_object (or provider-specific schema fields), not OpenAI json_schema shapes.
// How: Downgrade to json_object and inject a strict JSON schema instruction into the prompt payload.

type JsonSchema = Record<string, any>;

function safeJsonStringify(value: unknown): string | null {
	try {
		return JSON.stringify(value);
	} catch {
		return null;
	}
}

function buildSchemaInstruction(schema: JsonSchema): string | null {
	const raw = safeJsonStringify(schema);
	if (!raw) return null;
	return [
		"Return only valid JSON.",
		"Do not include markdown or extra commentary.",
		`The JSON must match this schema: ${raw}`,
	].join(" ");
}

function appendTextToMessageContent(message: any, text: string) {
	if (!message || typeof message !== "object") return;
	const content = message.content;

	if (typeof content === "string") {
		message.content = content ? `${content}\n\n${text}` : text;
		return;
	}

	if (Array.isArray(content)) {
		const textPart = content.find((part: any) => part?.type === "text" && typeof part.text === "string");
		if (textPart) {
			textPart.text = textPart.text ? `${textPart.text}\n\n${text}` : text;
			return;
		}
		content.unshift({ type: "text", text });
		return;
	}

	message.content = text;
}

function injectInstructionIntoMessages(request: any, instruction: string): boolean {
	if (!Array.isArray(request?.messages)) return false;
	const systemMessage = request.messages.find((msg: any) => msg?.role === "system");
	if (systemMessage) {
		appendTextToMessageContent(systemMessage, instruction);
		return true;
	}
	request.messages.unshift({
		role: "system",
		content: instruction,
	});
	return true;
}

function injectInstructionIntoInputItems(request: any, instruction: string): boolean {
	if (typeof request?.input === "string") {
		request.input = `${instruction}\n\n${request.input}`;
		return true;
	}
	if (Array.isArray(request?.input)) {
		const systemItem = request.input.find(
			(item: any) => item?.type === "message" && item?.role === "system",
		);
		if (systemItem) {
			appendTextToMessageContent(systemItem, instruction);
			return true;
		}
		request.input.unshift({
			type: "message",
			role: "system",
			content: [{ type: "input_text", text: instruction }],
		});
		return true;
	}
	if (Array.isArray(request?.input_items)) {
		const systemItem = request.input_items.find(
			(item: any) => item?.type === "message" && item?.role === "system",
		);
		if (systemItem) {
			appendTextToMessageContent(systemItem, instruction);
			return true;
		}
		request.input_items.unshift({
			type: "message",
			role: "system",
			content: [{ type: "input_text", text: instruction }],
		});
		return true;
	}
	return false;
}

function injectInstruction(request: any, instruction: string) {
	if (injectInstructionIntoMessages(request, instruction)) return;
	if (injectInstructionIntoInputItems(request, instruction)) return;
	if (typeof request.instructions === "string" && request.instructions.length > 0) {
		request.instructions = `${request.instructions}\n\n${instruction}`;
		return;
	}
	request.instructions = instruction;
}

/**
 * Downgrade json_schema requests to json_object and enforce schema via instruction text.
 * Useful for providers that reject OpenAI json_schema wire format.
 */
export function applyJsonSchemaFallback(request: any): void {
	if (!request || typeof request !== "object") return;

	let schema: JsonSchema | null = null;
	if (request.response_format?.type === "json_schema") {
		schema =
			request.response_format?.json_schema?.schema ??
			request.response_format?.json_schema?.schema_ ??
			request.response_format?.schema ??
			null;
		request.response_format = { type: "json_object" };
	} else if (request.text?.format?.type === "json_schema") {
		schema =
			request.text?.format?.schema ??
			request.text?.format?.json_schema?.schema ??
			request.text?.format?.json_schema?.schema_ ??
			null;
		request.text = {
			...(request.text ?? {}),
			format: { type: "json_object" },
		};
	}

	if (!schema || typeof schema !== "object") return;
	const instruction = buildSchemaInstruction(schema);
	if (!instruction) return;
	injectInstruction(request, instruction);
}
