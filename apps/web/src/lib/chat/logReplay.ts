// Purpose: Turn a stored Gateway I/O log back into a conversation.
// Why: Logged requests come from Chat Completions, Responses or Messages, each with its
//      own message, content-part, tool and reasoning shapes. Opening one in Chat needs a
//      single conversation shape that can be both rendered and sent again.
// How: Read the request into turns (user parts, assistant text/reasoning/tool calls, tool
//      results), append the logged response as the final assistant turn, and record what
//      could not be carried over as warnings. Nothing here touches storage or the network.

export type LogReplayEndpoint = "chat.completions" | "responses" | "messages";

export type LogReplayPart =
	| { type: "text"; text: string }
	| { type: "image"; url: string }
	| { type: "audio"; data: string; format: string }
	| { type: "file"; name: string; data: string };

export type LogReplayToolCall = {
	id: string;
	name: string;
	/** JSON arguments for a function; free-form input for a custom tool. */
	arguments: string;
	/** Responses custom tools take free-form input rather than JSON arguments. */
	kind?: "custom";
};

export type LogReplayTurn =
	| { role: "user"; parts: LogReplayPart[] }
	| { role: "assistant"; text: string; reasoning: string; toolCalls: LogReplayToolCall[] }
	| { role: "tool"; callId: string; output: string };

export type LogReplayWarningCode =
	| "earlier_history_missing"
	| "unsupported_content"
	| "attachment_reference"
	| "no_response"
	| "response_truncated"
	| "extra_choices"
	| "unanswered_tool_calls";

export type LogReplayFunctionTool = {
	name: string;
	description?: string;
	parameters?: unknown;
	strict?: boolean;
	/** A Responses custom tool, defined by its input `format` instead of parameters. */
	kind?: "custom";
	format?: unknown;
};

export type LogReplayParams = {
	temperature?: number;
	topP?: number;
	topK?: number;
	maxOutputTokens?: number;
	seed?: number;
	presencePenalty?: number;
	frequencyPenalty?: number;
	reasoningEffort?: string;
	reasoningEnabled?: boolean;
	serviceTier?: string;
};

export type LogReplay = {
	endpoint: LogReplayEndpoint;
	model: string | null;
	systemPrompt: string;
	turns: LogReplayTurn[];
	/** Number of leading turns that came from the request rather than the response. */
	requestTurnCount: number;
	params: LogReplayParams;
	functionTools: LogReplayFunctionTool[];
	serverTools: string[];
	warnings: LogReplayWarningCode[];
};

type Json = Record<string, any>;

const isObject = (value: unknown): value is Json =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const asFiniteNumber = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) ? value : undefined;

const stringifyOutput = (value: unknown): string => {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		const text = value
			.map((part) => (typeof part === "string" ? part : asString(part?.text)))
			.filter(Boolean)
			.join("\n");
		if (text) return text;
	}
	if (value === undefined || value === null) return "";
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const stringifyArguments = (value: unknown): string => {
	if (typeof value === "string") return value;
	if (value === undefined) return "{}";
	try {
		return JSON.stringify(value);
	} catch {
		return "{}";
	}
};

export function normalizeLogReplayEndpoint(value: unknown): LogReplayEndpoint | null {
	const endpoint = asString(value).trim().toLowerCase().replace(/^\/?(v1\/)?/, "");
	if (endpoint === "chat.completions" || endpoint === "chat/completions") return "chat.completions";
	if (endpoint === "responses") return "responses";
	if (endpoint === "messages") return "messages";
	return null;
}

class ReplayBuilder {
	turns: LogReplayTurn[] = [];
	systemParts: string[] = [];
	warnings = new Set<LogReplayWarningCode>();
	/** Turns before this index belong to the request; the response never merges into them. */
	responseStart = 0;

	warn(code: LogReplayWarningCode) {
		this.warnings.add(code);
	}

	user(parts: LogReplayPart[]) {
		if (parts.length === 0) return;
		this.turns.push({ role: "user", parts });
	}

	assistant(text: string, reasoning = "", toolCalls: LogReplayToolCall[] = []) {
		if (!text && !reasoning && toolCalls.length === 0) return;
		const last = this.turns[this.turns.length - 1];
		// Responses input lists an assistant message and its function calls as
		// separate items; they are one assistant turn.
		const sameSide = this.turns.length > this.responseStart;
		if (sameSide && last?.role === "assistant" && (last.toolCalls.length === 0 || !text)) {
			last.text = [last.text, text].filter(Boolean).join("\n\n");
			last.reasoning = [last.reasoning, reasoning].filter(Boolean).join("\n\n");
			last.toolCalls.push(...toolCalls);
			return;
		}
		this.turns.push({ role: "assistant", text, reasoning, toolCalls: [...toolCalls] });
	}

	tool(callId: string, output: string) {
		this.turns.push({ role: "tool", callId, output });
	}

	/** Image, audio and file inputs, in any of the three request shapes. */
	mediaPart(part: Json): LogReplayPart | null {
		const type = asString(part.type);
		if (type === "image_url" || type === "input_image") {
			const url = typeof part.image_url === "string" ? part.image_url : asString(part.image_url?.url);
			if (url) return { type: "image", url };
			if (part.file_id) this.warn("attachment_reference");
			return null;
		}
		if (type === "image") {
			const source = isObject(part.source) ? part.source : {};
			if (source.type === "base64" && source.data) {
				return { type: "image", url: `data:${asString(source.media_type) || "image/png"};base64,${source.data}` };
			}
			if (source.type === "url" && source.url) return { type: "image", url: asString(source.url) };
			this.warn("attachment_reference");
			return null;
		}
		if (type === "input_audio") {
			const audio = isObject(part.input_audio) ? part.input_audio : part;
			if (audio.data) return { type: "audio", data: asString(audio.data), format: asString(audio.format) || "wav" };
			this.warn("attachment_reference");
			return null;
		}
		if (type === "file" || type === "input_file" || type === "document") {
			const file = isObject(part.file) ? part.file : part;
			const source = isObject(part.source) ? part.source : null;
			const data = asString(file.file_data) ||
				(source?.type === "base64" && source.data
					? `data:${asString(source.media_type) || "application/pdf"};base64,${source.data}`
					: "");
			if (data) return { type: "file", name: asString(file.filename) || asString(part.title) || "file", data };
			this.warn("attachment_reference");
			return null;
		}
		return null;
	}

	/** User content: a string or text/media parts. */
	userParts(content: unknown): LogReplayPart[] {
		if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
		if (!Array.isArray(content)) return [];
		const parts: LogReplayPart[] = [];
		for (const raw of content) {
			if (typeof raw === "string") {
				if (raw) parts.push({ type: "text", text: raw });
				continue;
			}
			if (!isObject(raw)) continue;
			const type = asString(raw.type);
			if (type === "text" || type === "input_text" || type === "output_text") {
				if (raw.text) parts.push({ type: "text", text: asString(raw.text) });
				continue;
			}
			// Messages puts tool results inside user turns; callers handle them.
			if (type === "tool_result") continue;
			const media = this.mediaPart(raw);
			if (media) parts.push(media);
			else if (!["image_url", "input_image", "image", "input_audio", "file", "input_file", "document"].includes(type)) {
				this.warn("unsupported_content");
			}
		}
		return parts;
	}

	text(content: unknown): string {
		return this.userParts(content)
			.map((part) => (part.type === "text" ? part.text : ""))
			.filter(Boolean)
			.join("\n");
	}
}

function readChatCompletionsRequest(body: Json, builder: ReplayBuilder) {
	for (const message of Array.isArray(body.messages) ? body.messages : []) {
		if (!isObject(message)) continue;
		const role = asString(message.role);
		if (role === "system" || role === "developer") {
			const text = builder.text(message.content);
			if (text) builder.systemParts.push(text);
		} else if (role === "user") {
			builder.user(builder.userParts(message.content));
		} else if (role === "assistant") {
			builder.assistant(
				builder.text(message.content),
				asString(message.reasoning_content) || asString(message.reasoning),
				readChatToolCalls(message.tool_calls),
			);
		} else if (role === "tool" || role === "function") {
			builder.tool(asString(message.tool_call_id) || asString(message.name), stringifyOutput(message.content));
		}
	}
}

function readChatToolCalls(value: unknown): LogReplayToolCall[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isObject).map((call, index) => ({
		id: asString(call.id) || `call_${index}`,
		name: asString(call.function?.name) || asString(call.name) || "tool",
		arguments: stringifyArguments(call.function?.arguments ?? call.arguments),
	}));
}

function readResponsesItems(input: unknown, builder: ReplayBuilder) {
	if (typeof input === "string") {
		builder.user([{ type: "text", text: input }]);
		return;
	}
	for (const item of Array.isArray(input) ? input : []) {
		if (!isObject(item)) continue;
		const type = asString(item.type);
		const role = asString(item.role);
		if (role && (!type || type === "message")) {
			if (role === "system" || role === "developer") {
				const text = builder.text(item.content);
				if (text) builder.systemParts.push(text);
			} else if (role === "assistant") {
				builder.assistant(builder.text(item.content));
			} else {
				builder.user(builder.userParts(item.content));
			}
		} else if (type === "function_call" || type === "custom_tool_call") {
			builder.assistant("", "", [readResponsesToolCall(item)]);
		} else if (type === "function_call_output" || type === "custom_tool_call_output") {
			builder.tool(asString(item.call_id), stringifyOutput(item.output));
		} else if (type === "reasoning") {
			builder.assistant("", readReasoningSummary(item));
		} else {
			builder.warn("unsupported_content");
		}
	}
}

function readResponsesToolCall(item: Json): LogReplayToolCall {
	const custom = item.type === "custom_tool_call";
	return {
		id: asString(item.call_id) || asString(item.id) || "call",
		name: asString(item.name) || "tool",
		arguments: custom ? asString(item.input) : stringifyArguments(item.arguments),
		...(custom ? { kind: "custom" as const } : {}),
	};
}

function readReasoningSummary(item: Json): string {
	const summary = item.summary ?? item.content;
	if (typeof summary === "string") return summary;
	if (!Array.isArray(summary)) return "";
	return summary.map((entry) => (typeof entry === "string" ? entry : asString(entry?.text))).filter(Boolean).join("\n");
}

function readMessagesRequest(body: Json, builder: ReplayBuilder) {
	const system = typeof body.system === "string" ? body.system : builder.text(body.system);
	if (system) builder.systemParts.push(system);
	for (const message of Array.isArray(body.messages) ? body.messages : []) {
		if (!isObject(message)) continue;
		if (message.role === "assistant") {
			readMessagesAssistant(message.content, builder);
			continue;
		}
		const blocks = Array.isArray(message.content) ? message.content : null;
		for (const block of blocks ?? []) {
			if (isObject(block) && block.type === "tool_result") {
				builder.tool(asString(block.tool_use_id), stringifyOutput(block.content));
			}
		}
		builder.user(builder.userParts(message.content));
	}
}

function readMessagesAssistant(content: unknown, builder: ReplayBuilder) {
	if (typeof content === "string") {
		builder.assistant(content);
		return;
	}
	const text: string[] = [];
	const reasoning: string[] = [];
	const toolCalls: LogReplayToolCall[] = [];
	for (const block of Array.isArray(content) ? content : []) {
		if (!isObject(block)) continue;
		if (block.type === "text") text.push(asString(block.text));
		else if (block.type === "thinking") reasoning.push(asString(block.thinking));
		else if (block.type === "tool_use") {
			toolCalls.push({ id: asString(block.id) || "call", name: asString(block.name) || "tool", arguments: stringifyArguments(block.input) });
		} else if (block.type !== "redacted_thinking") builder.warn("unsupported_content");
	}
	builder.assistant(text.filter(Boolean).join(""), reasoning.filter(Boolean).join("\n\n"), toolCalls);
}

function readResponse(response: unknown, builder: ReplayBuilder) {
	const payload = isObject(response) && isObject(response.response) && !response.choices ? response.response : response;
	if (!isObject(payload) || payload.error || asString(payload.status) === "failed") {
		builder.warn("no_response");
		return;
	}
	if (payload.gateway_log_truncated) builder.warn("response_truncated");
	if (Array.isArray(payload.choices)) {
		if (payload.choices.length > 1) builder.warn("extra_choices");
		const message = payload.choices[0]?.message;
		if (!isObject(message)) {
			builder.warn("no_response");
			return;
		}
		const before = builder.turns.length;
		builder.assistant(
			builder.text(message.content),
			asString(message.reasoning_content) || asString(message.reasoning),
			readChatToolCalls(message.tool_calls),
		);
		if (builder.turns.length === before) builder.warn("no_response");
		return;
	}
	if (Array.isArray(payload.output)) {
		const before = builder.turns.length;
		for (const item of payload.output) {
			if (!isObject(item)) continue;
			if (item.type === "message") builder.assistant(builder.text(item.content));
			else if (item.type === "reasoning") builder.assistant("", readReasoningSummary(item));
			else if (item.type === "function_call" || item.type === "custom_tool_call") {
				builder.assistant("", "", [readResponsesToolCall(item)]);
			}
		}
		if (builder.turns.length === before) builder.warn("no_response");
		return;
	}
	if (payload.type === "message" && Array.isArray(payload.content)) {
		readMessagesAssistant(payload.content, builder);
		return;
	}
	builder.warn("no_response");
}

function readParams(endpoint: LogReplayEndpoint, body: Json): LogReplayParams {
	const params: LogReplayParams = {
		temperature: asFiniteNumber(body.temperature),
		topP: asFiniteNumber(body.top_p),
		topK: asFiniteNumber(body.top_k),
		maxOutputTokens:
			asFiniteNumber(body.max_output_tokens) ??
			asFiniteNumber(body.max_completion_tokens) ??
			asFiniteNumber(body.max_tokens),
		seed: asFiniteNumber(body.seed),
		presencePenalty: asFiniteNumber(body.presence_penalty),
		frequencyPenalty: asFiniteNumber(body.frequency_penalty),
		serviceTier: asString(body.service_tier) || undefined,
	};
	const effort =
		asString(body.reasoning?.effort) ||
		asString(body.reasoning_effort) ||
		asString(body.output_config?.effort);
	if (effort) {
		params.reasoningEffort = effort;
		params.reasoningEnabled = effort !== "none";
	} else if (endpoint === "messages" && isObject(body.thinking)) {
		params.reasoningEnabled = body.thinking.type === "enabled" || body.thinking.type === "adaptive";
	} else if (body.reasoning?.enabled === true) {
		params.reasoningEnabled = true;
	}
	for (const key of Object.keys(params) as Array<keyof LogReplayParams>) {
		if (params[key] === undefined) delete params[key];
	}
	return params;
}

function readTools(body: Json): { functionTools: LogReplayFunctionTool[]; serverTools: string[] } {
	const functionTools: LogReplayFunctionTool[] = [];
	const serverTools: string[] = [];
	for (const tool of Array.isArray(body.tools) ? body.tools : []) {
		if (!isObject(tool)) continue;
		const type = asString(tool.type);
		if (type.startsWith("phaseo:") || type.startsWith("gateway:")) {
			serverTools.push(type);
			continue;
		}
		// Chat Completions nests the definition; Responses and Messages do not.
		// Provider-run tools (web search, code execution, ...) are not functions.
		const fn = isObject(tool.function) ? tool.function : tool;
		const name = asString(fn.name);
		if (name && type === "custom" && !isObject(tool.input_schema)) {
			functionTools.push({
				name,
				kind: "custom",
				...(asString(tool.description) ? { description: asString(tool.description) } : {}),
				...(tool.format !== undefined ? { format: tool.format } : {}),
			});
			continue;
		}
		const isFunction = type === "function" || ((!type || type === "custom") && isObject(tool.input_schema));
		if (!name || !isFunction) continue;
		functionTools.push({
			name,
			...(asString(fn.description) ? { description: asString(fn.description) } : {}),
			...(fn.parameters !== undefined || tool.input_schema !== undefined
				? { parameters: fn.parameters ?? tool.input_schema }
				: {}),
			...(typeof fn.strict === "boolean" ? { strict: fn.strict } : {}),
		});
	}
	return { functionTools, serverTools };
}

/** Function calls that never got a result can't be sent again as calls. */
function markUnansweredToolCalls(turns: LogReplayTurn[], builder: ReplayBuilder) {
	const answered = new Set(turns.flatMap((turn) => (turn.role === "tool" ? [turn.callId] : [])));
	const unanswered = turns.some(
		(turn) => turn.role === "assistant" && turn.toolCalls.some((call) => !answered.has(call.id)),
	);
	if (unanswered) builder.warn("unanswered_tool_calls");
}

export function readLogReplay(input: {
	endpoint: unknown;
	requestPayload: unknown;
	gatewayResponse?: unknown;
	model?: string | null;
}): LogReplay | null {
	const endpoint = normalizeLogReplayEndpoint(input.endpoint);
	const body = input.requestPayload;
	if (!endpoint || !isObject(body)) return null;

	const builder = new ReplayBuilder();
	if (endpoint === "chat.completions") {
		readChatCompletionsRequest(body, builder);
	} else if (endpoint === "responses") {
		if (asString(body.instructions)) builder.systemParts.push(asString(body.instructions));
		readResponsesItems(body.input, builder);
		if (body.previous_response_id || body.conversation) builder.warn("earlier_history_missing");
	} else {
		readMessagesRequest(body, builder);
	}
	const requestTurnCount = builder.turns.length;
	builder.responseStart = requestTurnCount;
	readResponse(input.gatewayResponse, builder);
	markUnansweredToolCalls(builder.turns, builder);

	if (builder.turns.length === 0 && builder.systemParts.length === 0) return null;
	const { functionTools, serverTools } = readTools(body);
	return {
		endpoint,
		model: asString(body.model) || input.model || null,
		systemPrompt: builder.systemParts.join("\n\n"),
		turns: builder.turns,
		requestTurnCount,
		params: readParams(endpoint, body),
		functionTools,
		serverTools,
		warnings: Array.from(builder.warnings),
	};
}
