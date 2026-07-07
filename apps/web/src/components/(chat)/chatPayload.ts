export const coerceResponseText = (value: unknown) => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return value
            .map((entry) => {
                if (typeof entry === "string") return entry;
                if (entry && typeof entry === "object") {
                    const typeValue = (entry as { type?: string }).type;
                    if (
                        typeValue === "reasoning" ||
                        typeValue === "reasoning_text" ||
                        typeValue === "summary_text"
                    ) {
                        return "";
                    }
                    if (typeValue === "output_text" || typeValue === "text") {
                        return (entry as { text?: string }).text ?? "";
                    }
                }
                return "";
            })
            .filter(Boolean)
            .join("");
    }
    return "";
};

export const extractOutputText = (output: unknown) => {
    if (!Array.isArray(output)) return "";
    const candidates: string[] = [];
    for (const item of output) {
        if (!item) continue;
        if (typeof item === "string") return item;
        if (typeof (item as any).text === "string") {
            candidates.push((item as any).text);
            continue;
        }
        if (Array.isArray((item as any).content)) {
            const contentText = coerceResponseText((item as any).content);
            if (contentText) candidates.push(contentText);
            continue;
        }
        if ((item as any).content) {
            const contentText = coerceResponseText((item as any).content);
            if (contentText) candidates.push(contentText);
        }
    }
    return candidates.join("");
};

export const extractResponseText = (payload: any) => {
    const candidates = [
        payload?.choices?.[0]?.message?.content,
        payload?.choices?.[0]?.delta?.content,
        coerceResponseText(payload?.output_text),
        coerceResponseText(payload?.response?.output_text),
        extractOutputText(payload?.output),
        extractOutputText(payload?.response?.output),
        coerceResponseText(payload?.response?.output?.[0]?.content),
    ];
    for (const candidate of candidates) {
        if (candidate) return candidate;
    }
    return "";
};

export type ChatToolCallStatus = "running" | "completed" | "failed";

export type ChatToolCall = {
	id: string;
	type: string;
	name: string;
	status: ChatToolCallStatus;
	input?: unknown;
	inputText?: string;
	output?: unknown;
	errorText?: string;
};

export type ChatTraceEvent =
	| {
			id: string;
			type: "reasoning";
			sequence: number;
			text: string;
		}
	| {
			id: string;
			type: "tool_call";
			sequence: number;
			toolCallId: string;
		}
	| {
			id: string;
			type: "response";
			sequence: number;
			text: string;
		};

const TOOL_OUTPUT_ITEM_TYPES = new Set([
	"function_call",
	"tool_call",
	"web_search_call",
	"file_search_call",
	"image_generation_call",
	"code_interpreter_call",
	"computer_call",
	"mcp_call",
]);
const GENERIC_TOOL_CALL_NAMES = new Set(["tool_call"]);

const parseJsonIfPossible = (value: string): unknown => {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
};

const stringifyToolInput = (value: unknown): string | undefined => {
	if (typeof value === "string") return value;
	if (value == null) return undefined;
	try {
		return JSON.stringify(value);
	} catch {
		return undefined;
	}
};

const normalizeToolCallStatus = (
	status: unknown,
	fallback: ChatToolCallStatus,
): ChatToolCallStatus => {
	if (typeof status !== "string") return fallback;
	const normalized = status.toLowerCase();
	if (
		normalized === "in_progress" ||
		normalized === "running" ||
		normalized === "queued"
	) {
		return "running";
	}
	if (
		normalized === "failed" ||
		normalized === "error" ||
		normalized === "errored" ||
		normalized === "cancelled"
	) {
		return "failed";
	}
	return "completed";
};

const normalizeToolCallFromOutputItem = (
	item: any,
	index: number,
	fallbackStatus: ChatToolCallStatus,
): ChatToolCall | null => {
	if (!item || typeof item !== "object") return null;
	const type = typeof item.type === "string" ? item.type : "tool_call";
	if (!TOOL_OUTPUT_ITEM_TYPES.has(type)) return null;
	const explicitName =
		typeof item.name === "string" && item.name.trim()
			? item.name.trim()
			: typeof item.tool_name === "string" && item.tool_name.trim()
				? item.tool_name.trim()
				: typeof item.function?.name === "string" &&
					  item.function.name.trim()
					? item.function.name.trim()
					: null;
	if (explicitName && GENERIC_TOOL_CALL_NAMES.has(explicitName)) return null;
	if (type === "tool_call" && !explicitName) return null;
	const idCandidate =
		item.call_id ??
		item.id ??
		item.item_id ??
		item.tool_call_id ??
		item.output_index ??
		index;
	const id =
		typeof idCandidate === "string" && idCandidate.trim()
			? idCandidate.trim()
			: `tool-${index}`;
	const name = explicitName ?? type;
	const argumentText =
		typeof item.arguments === "string"
			? item.arguments
			: typeof item.input === "string"
				? item.input
				: stringifyToolInput(item.arguments ?? item.input ?? item.query);
	const parsedInput =
		typeof argumentText === "string"
			? parseJsonIfPossible(argumentText)
			: undefined;
	const errorText =
		typeof item.error === "string"
			? item.error
			: typeof item.error?.message === "string"
				? item.error.message
				: undefined;
	return {
		id,
		type,
		name,
		status: errorText
			? "failed"
			: normalizeToolCallStatus(item.status, fallbackStatus),
		...(parsedInput !== undefined ? { input: parsedInput } : {}),
		...(argumentText ? { inputText: argumentText } : {}),
		...(item.output !== undefined ? { output: item.output } : {}),
		...(errorText ? { errorText } : {}),
	};
};

const normalizeToolCallFromChatToolCall = (
	toolCall: any,
	index: number,
): ChatToolCall | null => {
	if (!toolCall || typeof toolCall !== "object") return null;
	const id =
		typeof toolCall.id === "string" && toolCall.id.trim()
			? toolCall.id.trim()
			: `tool-${index}`;
	const type =
		typeof toolCall.type === "string" && toolCall.type.trim()
			? toolCall.type.trim()
			: "function";
	const functionCall = toolCall.function ?? {};
	const name =
		typeof functionCall.name === "string" && functionCall.name.trim()
			? functionCall.name.trim()
			: typeof toolCall.name === "string" && toolCall.name.trim()
				? toolCall.name.trim()
				: type;
	if (GENERIC_TOOL_CALL_NAMES.has(name)) return null;
	const argumentText =
		typeof functionCall.arguments === "string"
			? functionCall.arguments
			: typeof toolCall.arguments === "string"
				? toolCall.arguments
				: undefined;
	const parsedInput =
		typeof argumentText === "string"
			? parseJsonIfPossible(argumentText)
			: undefined;
	return {
		id,
		type,
		name,
		status: "completed",
		...(parsedInput !== undefined ? { input: parsedInput } : {}),
		...(argumentText ? { inputText: argumentText } : {}),
	};
};

const dedupeToolCalls = (calls: ChatToolCall[]) => {
	const byId = new Map<string, ChatToolCall>();
	for (const call of calls) {
		const previous = byId.get(call.id);
		if (!previous) {
			byId.set(call.id, call);
			continue;
		}
		byId.set(call.id, {
			...previous,
			...call,
			input: call.input ?? previous.input,
			inputText: call.inputText ?? previous.inputText,
			output: call.output ?? previous.output,
			errorText: call.errorText ?? previous.errorText,
			status:
				call.status === "completed" || previous.status !== "failed"
					? call.status
					: previous.status,
		});
	}
	return Array.from(byId.values());
};

export const extractResponseToolCalls = (payload: any): ChatToolCall[] => {
	const calls: ChatToolCall[] = [];
	const collectOutput = (
		output: unknown,
		fallbackStatus: ChatToolCallStatus,
	) => {
		if (!Array.isArray(output)) return;
		output.forEach((item, index) => {
			const call = normalizeToolCallFromOutputItem(
				item,
				calls.length + index,
				fallbackStatus,
			);
			if (call) calls.push(call);
		});
	};
	collectOutput(payload?.output, "completed");
	collectOutput(payload?.response?.output, "completed");

	const collectChatChoices = (choices: unknown) => {
		if (!Array.isArray(choices)) return;
		for (const choice of choices) {
			const messageToolCalls = (choice as any)?.message?.tool_calls;
			const deltaToolCalls = (choice as any)?.delta?.tool_calls;
			const toolCalls = Array.isArray(messageToolCalls)
				? messageToolCalls
				: Array.isArray(deltaToolCalls)
					? deltaToolCalls
					: [];
			toolCalls.forEach((toolCall, index) => {
				const call = normalizeToolCallFromChatToolCall(
					toolCall,
					calls.length + index,
				);
				if (call) calls.push(call);
			});
		}
	};
	collectChatChoices(payload?.choices);
	collectChatChoices(payload?.response?.choices);
	return dedupeToolCalls(calls);
};


type ExtractedImage = {
	url?: string;
	data?: string;
	mimeType?: string;
};

const IMAGE_BLOCK_TYPES = new Set(["output_image", "image", "image_url"]);

const coerceImageUrl = (value: any): string | null => {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (typeof value?.url === "string") return value.url;
	return null;
};

const coerceImageData = (value: any): string | null => {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (typeof value?.b64_json === "string") return value.b64_json;
	if (typeof value?.data === "string") return value.data;
	return null;
};

const extractImagesFromContent = (content: any): ExtractedImage[] => {
	if (!Array.isArray(content)) return [];
	const images: ExtractedImage[] = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const type = part.type;
		if (IMAGE_BLOCK_TYPES.has(type)) {
			const url = coerceImageUrl(part.image_url ?? part.url);
			const data = coerceImageData(part);
			if (url || data) {
				images.push({
					url: url ?? (data ? `data:${part.mime_type || "image/png"};base64,${data}` : undefined),
					data: data ?? undefined,
					mimeType: part.mime_type ?? part.mimeType ?? undefined,
				});
			}
		}
	}
	return images;
};

const extractImagesFromOutputItems = (output: any): ExtractedImage[] => {
	if (!Array.isArray(output)) return [];
	const images: ExtractedImage[] = [];
	for (const item of output) {
		if (!item || typeof item !== "object") continue;
		if (IMAGE_BLOCK_TYPES.has(item.type)) {
			const url = coerceImageUrl(item.image_url ?? item.url);
			const data = coerceImageData(item);
			if (url || data) {
				images.push({
					url: url ?? (data ? `data:${item.mime_type || "image/png"};base64,${data}` : undefined),
					data: data ?? undefined,
					mimeType: item.mime_type ?? item.mimeType ?? undefined,
				});
			}
		}
		if (item.type === "message" && Array.isArray(item.content)) {
			images.push(...extractImagesFromContent(item.content));
		}
		if (item.type === "image_generation_call") {
			const data = coerceImageData(item);
			if (data) {
				images.push({
					url: `data:image/png;base64,${data}`,
					data,
					mimeType: "image/png",
				});
			}
		}
	}
	return images;
};

const extractImagesFromDataArray = (data: any): ExtractedImage[] => {
	if (!Array.isArray(data)) return [];
	const images: ExtractedImage[] = [];
	for (const entry of data) {
		if (!entry || typeof entry !== "object") continue;
		const b64 =
			typeof entry.b64_json === "string"
				? entry.b64_json
				: typeof entry.data === "string"
					? entry.data
					: null;
		const url =
			typeof entry.url === "string"
				? entry.url
				: typeof entry.image_url === "string"
					? entry.image_url
					: null;
		if (!b64 && !url) continue;
		images.push({
			url: url ?? (b64 ? `data:image/png;base64,${b64}` : undefined),
			data: b64 ?? undefined,
			mimeType:
				typeof entry.mime_type === "string"
					? entry.mime_type
					: "image/png",
		});
	}
	return images;
};

const extractImagesFromChatChoices = (choices: any): ExtractedImage[] => {
	if (!Array.isArray(choices)) return [];
	const images: ExtractedImage[] = [];
	for (const choice of choices) {
		const message = choice?.message;
		if (!message || typeof message !== "object") continue;
		if (Array.isArray(message.content)) {
			images.push(...extractImagesFromContent(message.content));
		}
		if (Array.isArray(message.images)) {
			images.push(...extractImagesFromContent(message.images));
		}
	}
	return images;
};

const dedupeImages = (images: ExtractedImage[]) => {
	const seen = new Set<string>();
	return images.filter((image) => {
		const key = image.url ?? image.data ?? "";
		if (!key) return false;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

export const extractResponseImages = (payload: any): ExtractedImage[] => {
	const images: ExtractedImage[] = [];
	images.push(...extractImagesFromOutputItems(payload?.output));
	images.push(...extractImagesFromOutputItems(payload?.response?.output));
	images.push(...extractImagesFromDataArray(payload?.data));
	images.push(...extractImagesFromDataArray(payload?.response?.data));
	images.push(...extractImagesFromChatChoices(payload?.choices));
	images.push(...extractImagesFromChatChoices(payload?.response?.choices));
	const content = payload?.choices?.[0]?.message?.content;
	if (Array.isArray(content)) {
		images.push(...extractImagesFromContent(content));
	}
	return dedupeImages(images);
};

export const appendImagesToText = (text: string, images: ExtractedImage[]) => {
	if (!images.length) return text;
	const rendered = images
		.map((img, idx) => {
			const src = img.url ?? (img.data ? `data:${img.mimeType || "image/png"};base64,${img.data}` : "");
			if (!src) return "";
			return `

![Generated image ${idx + 1}](${src})`;
		})
		.filter(Boolean)
		.join("");
	return `${text}${rendered}`;
};

/**
 * Extract reasoning/thinking text from Responses API format
 *
 * The gateway always returns responses in the format matching the endpoint called.
 * Since the web app calls /responses, we only need to parse Responses API format:
 * - reasoning.summary
 * - output items with type "reasoning"
 */
export const extractReasoningText = (payload: any) => {
    const ignoredSummaries = new Set(["auto", "detailed"]);
    const candidates: string[] = [];

    // 1. Check Responses API reasoning.summary
    const reasoning = payload?.reasoning ?? payload?.response?.reasoning;
    const summary = reasoning?.summary;
    if (typeof summary === "string") {
        const trimmed = summary.trim().toLowerCase();
        if (summary && !ignoredSummaries.has(trimmed)) {
            candidates.push(summary);
        }
    } else if (Array.isArray(summary)) {
        const joined = summary
            .map((item: any) =>
                typeof item === "string" ? item : item?.text ?? ""
            )
            .filter(Boolean)
            .join("\n");
        if (joined) {
            const trimmed = joined.trim().toLowerCase();
            if (!ignoredSummaries.has(trimmed)) {
                candidates.push(joined);
            }
        }
    }
    // 2. Check Responses API output items
    const outputs = payload?.output ?? payload?.response?.output;
    if (Array.isArray(outputs)) {
        for (const item of outputs) {
            if (item?.type !== "reasoning") continue;
            if (typeof item.summary === "string") {
                candidates.push(item.summary);
            } else if (Array.isArray(item.summary)) {
                const joined = item.summary
                    .map((entry: any) =>
                        typeof entry === "string" ? entry : entry?.text ?? ""
                    )
                    .filter(Boolean)
                    .join("\n");
                if (joined) candidates.push(joined);
            }
            if (Array.isArray(item.content)) {
                const contentText = coerceResponseText(item.content);
                if (contentText) candidates.push(contentText);
            } else if (typeof item.content === "string") {
                candidates.push(item.content);
            }
        }
    }

    // Return first non-empty candidate
    for (const candidate of candidates) {
        if (candidate) return candidate;
    }
    return "";
};
