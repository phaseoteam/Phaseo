import type { ChatToolCall } from "@/components/(chat)/chatPayload";
import {
	buildDefaultSystemPrompt,
	buildTitle,
	DEFAULT_SERVER_TOOLS,
	DEFAULT_SETTINGS,
	generateId,
} from "@/components/(chat)/playground/chat-playground-core";
import type {
	ChatMessage,
	ChatReasoningEffort,
	ChatServerToolType,
	ChatServiceTier,
	ChatSettings,
	ChatThread,
	ChatThreadReplay,
} from "@/lib/indexeddb/chats";
import type { LogReplay, LogReplayPart } from "@/lib/chat/logReplay";

/** What the user chose to carry over when continuing a logged request. */
export type ChatLogImportOptions = {
	modelId: string;
	pinProvider: boolean;
	keepParams: boolean;
	keepSystemPrompt: boolean;
	keepServerTools: boolean;
	keepFunctionTools: boolean;
	includeResponse: boolean;
};

export type ChatLogImportSource = {
	requestId: string;
	workspaceId: string | null;
	provider: string | null;
	loggedAt: string | null;
};

const REASONING_EFFORTS = new Set<ChatReasoningEffort>(["none", "instant", "minimal", "low", "medium", "high", "xhigh", "max"]);
const SERVICE_TIERS = new Set<ChatServiceTier>(["standard", "priority", "flex", "ultrafast"]);
const SERVER_TOOLS = new Set<ChatServerToolType>([
	"gateway:datetime",
	"phaseo:web_search",
	"phaseo:web_fetch",
	"phaseo:advisor",
	"phaseo:image_generation",
	"phaseo:apply_patch",
	"phaseo:fusion",
	"phaseo:subagent",
]);

export function defaultChatLogImportOptions(replay: LogReplay, modelId: string): ChatLogImportOptions {
	return {
		modelId,
		pinProvider: false,
		keepParams: true,
		keepSystemPrompt: true,
		keepServerTools: true,
		// Providers reject tool calls in history unless the tools are declared.
		keepFunctionTools: replay.turns.some((turn) => turn.role === "assistant" && turn.toolCalls.length > 0),
		includeResponse: replay.turns.length > replay.requestTurnCount,
	};
}

function toServerTool(type: string): ChatServerToolType | null {
	if (type === "gateway:datetime") return type;
	const name = type.replace(/^(phaseo|gateway):/, "");
	const candidate = `phaseo:${name}` as ChatServerToolType;
	return SERVER_TOOLS.has(candidate) ? candidate : null;
}

function mediaPreview(part: LogReplayPart) {
	if (part.type === "image") return { name: "image", dataUrl: part.url, isImage: true };
	if (part.type === "audio") {
		return { name: "audio", mimeType: `audio/${part.format}`, dataUrl: `data:audio/${part.format};base64,${part.data}`, isAudio: true };
	}
	return null;
}

function userInputItem(parts: LogReplayPart[]) {
	return {
		role: "user",
		content: parts.map((part) => {
			if (part.type === "text") return { type: "input_text", text: part.text };
			if (part.type === "image") return { type: "input_image", image_url: part.url };
			if (part.type === "audio") return { type: "input_audio", input_audio: { data: part.data, format: part.format } };
			return { type: "input_file", filename: part.name, file_data: part.data };
		}),
	};
}

function parseArguments(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function buildSettings(replay: LogReplay, options: ChatLogImportOptions, source: ChatLogImportSource): ChatSettings {
	const settings: ChatSettings = {
		...DEFAULT_SETTINGS,
		systemPrompt: options.keepSystemPrompt && replay.systemPrompt
			? replay.systemPrompt
			: buildDefaultSystemPrompt(options.modelId),
		providerId: options.pinProvider && source.provider ? source.provider : "auto",
	};
	if (options.keepParams) {
		const { params } = replay;
		settings.temperature = params.temperature ?? null;
		settings.maxOutputTokens = params.maxOutputTokens ?? null;
		settings.topP = params.topP ?? null;
		settings.topK = params.topK ?? null;
		settings.seed = params.seed ?? null;
		settings.presencePenalty = params.presencePenalty ?? null;
		settings.frequencyPenalty = params.frequencyPenalty ?? null;
		if (params.reasoningEnabled !== undefined) settings.reasoningEnabled = params.reasoningEnabled;
		if (params.reasoningEffort && REASONING_EFFORTS.has(params.reasoningEffort as ChatReasoningEffort)) {
			settings.reasoningEffort = params.reasoningEffort as ChatReasoningEffort;
		}
		const tier = params.serviceTier === "default" || params.serviceTier === "auto" ? "standard" : params.serviceTier;
		if (tier && SERVICE_TIERS.has(tier as ChatServiceTier)) settings.serviceTier = tier as ChatServiceTier;
	}
	if (options.keepServerTools && replay.serverTools.length > 0) {
		const tools = Array.from(new Set(replay.serverTools.map(toServerTool).filter((tool): tool is ChatServerToolType => Boolean(tool))));
		settings.serverTools = tools.length > 0 ? tools : DEFAULT_SERVER_TOOLS;
		settings.apiServerToolsEnabled = true;
	}
	return settings;
}

/** Build a new chat from a logged request. The chat gets its own session ID. */
export function buildThreadFromLogReplay(args: {
	replay: LogReplay;
	options: ChatLogImportOptions;
	source: ChatLogImportSource;
	emptyTitle: string;
	now?: string;
}): ChatThread {
	const { replay, options, source } = args;
	const createdAt = args.now ?? new Date().toISOString();
	const turns = options.includeResponse ? replay.turns : replay.turns.slice(0, replay.requestTurnCount);
	const messages: ChatMessage[] = [];
	const replayMessages: ChatThreadReplay["messages"] = {};
	const callOwners = new Map<string, ChatMessage>();
	const callKinds = new Map<string, "custom" | undefined>();
	const callNames = new Map<string, string>();
	const answeredCalls = new Set<string>();

	for (const turn of turns) {
		if (turn.role === "tool") {
			const owner = callOwners.get(turn.callId);
			if (owner) {
				const calls = (owner.meta?.tool_calls ?? []) as ChatToolCall[];
				const call = calls.find((entry) => entry.id === turn.callId);
				if (call) call.output = turn.output;
				replayMessages[owner.id].items.push({
					type: callKinds.get(turn.callId) === "custom" ? "custom_tool_call_output" : "function_call_output",
					call_id: turn.callId,
					output: turn.output,
				});
				answeredCalls.add(turn.callId);
				continue;
			}
			// A result whose call is not in the log is kept as context text.
			const message: ChatMessage = { id: generateId(), role: "user", content: turn.output, createdAt };
			messages.push(message);
			replayMessages[message.id] = { content: message.content, items: [{ role: "user", content: turn.output }] };
			continue;
		}
		if (turn.role === "user") {
			const text = turn.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
			const previews = turn.parts.map(mediaPreview).filter(Boolean);
			const message: ChatMessage = {
				id: generateId(),
				role: "user",
				content: text,
				createdAt,
				...(previews.length > 0 ? { meta: { attachment_previews: previews } } : {}),
			};
			messages.push(message);
			replayMessages[message.id] = { content: message.content, items: [userInputItem(turn.parts)] };
			continue;
		}
		const toolCalls: ChatToolCall[] = turn.toolCalls.map((call) => ({
			id: call.id,
			type: call.kind ?? "function",
			name: call.name,
			status: "completed",
			input: call.kind === "custom" ? call.arguments : parseArguments(call.arguments),
			inputText: call.arguments,
		}));
		const meta: Record<string, unknown> = {};
		if (turn.reasoning) meta.reasoning_text = turn.reasoning;
		if (toolCalls.length > 0) meta.tool_calls = toolCalls;
		const message: ChatMessage = {
			id: generateId(),
			role: "assistant",
			content: turn.text,
			createdAt,
			modelId: replay.model ?? options.modelId,
			...(source.provider ? { providerId: source.provider } : {}),
			...(Object.keys(meta).length > 0 ? { meta } : {}),
		};
		messages.push(message);
		const items: unknown[] = turn.text ? [{ role: "assistant", content: turn.text }] : [];
		for (const call of turn.toolCalls) {
			callOwners.set(call.id, message);
			callKinds.set(call.id, call.kind);
			callNames.set(call.id, call.name);
			items.push(call.kind === "custom"
				? { type: "custom_tool_call", call_id: call.id, name: call.name, input: call.arguments }
				: { type: "function_call", call_id: call.id, name: call.name, arguments: call.arguments });
		}
		replayMessages[message.id] = { content: message.content, items };
	}

	// Providers reject a call that has no result, or any call whose tool isn't
	// declared. Those go as text, ahead of the remaining calls so each result
	// still directly follows its call.
	const declareTools = options.keepFunctionTools && replay.functionTools.length > 0;
	for (const entry of Object.values(replayMessages)) {
		const text: unknown[] = [];
		const calls: unknown[] = [];
		const outputs: unknown[] = [];
		for (const item of entry.items) {
			const record = item as Record<string, unknown>;
			const isCall = record.type === "function_call" || record.type === "custom_tool_call";
			const isOutput = record.type === "function_call_output" || record.type === "custom_tool_call_output";
			const callId = String(record.call_id);
			if (isOutput) {
				if (declareTools) outputs.push(item);
				else outputs.push({ role: "user", content: `Result of ${callNames.get(callId) ?? "tool"}: ${String(record.output)}` });
			} else if (!isCall) text.push(item);
			else if (declareTools && answeredCalls.has(callId)) calls.push(item);
			else text.push({ role: "assistant", content: `Called ${String(record.name)} with ${String(record.arguments ?? record.input)}` });
		}
		entry.items = [...text, ...calls, ...outputs];
	}

	const replayState: ChatThreadReplay = {
		source: {
			requestId: source.requestId,
			workspaceId: source.workspaceId,
			endpoint: replay.endpoint,
			loggedAt: source.loggedAt,
		},
		messages: replayMessages,
		...(declareTools
			? {
					functionTools: replay.functionTools.map((tool) => tool.kind === "custom"
						? {
								type: "custom",
								name: tool.name,
								...(tool.description ? { description: tool.description } : {}),
								...(tool.format !== undefined ? { format: tool.format } : {}),
							}
						: {
								type: "function",
								name: tool.name,
								...(tool.description ? { description: tool.description } : {}),
								parameters: tool.parameters ?? { type: "object", properties: {} },
								...(typeof tool.strict === "boolean" ? { strict: tool.strict } : {}),
							}),
				}
			: {}),
	};

	return {
		id: crypto.randomUUID(),
		// A new session, so continued turns don't join the original session's logs.
		sessionId: crypto.randomUUID(),
		title: buildTitle(messages, args.emptyTitle),
		titleLocked: false,
		pinned: false,
		modelId: options.modelId,
		createdAt,
		updatedAt: createdAt,
		messages,
		settings: buildSettings(replay, options, source),
		replay: replayState,
	};
}

/**
 * The structured input for the unedited imported messages at the start of the
 * conversation. Sending stops using it at the first message that was edited or
 * was not imported, and those messages go as text as before.
 */
export function replayInputPrefix(
	replay: ChatThreadReplay | undefined,
	contextMessages: Array<Pick<ChatMessage, "id" | "content">>,
): { count: number; items: unknown[] } {
	if (!replay) return { count: 0, items: [] };
	const items: unknown[] = [];
	let count = 0;
	for (const message of contextMessages) {
		const entry = replay.messages[message.id];
		if (!entry || entry.content !== message.content) break;
		items.push(...entry.items);
		count += 1;
	}
	return { count, items };
}
