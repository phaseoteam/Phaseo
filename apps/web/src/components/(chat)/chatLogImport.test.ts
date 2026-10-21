import {
	buildThreadFromLogReplay,
	defaultChatLogImportOptions,
	replayInputPrefix,
} from "@/components/(chat)/chatLogImport";
import type { LogReplay } from "@/lib/chat/logReplay";

const replay: LogReplay = {
	endpoint: "chat.completions",
	model: "openai/gpt-5-mini",
	systemPrompt: "Be brief.",
	turns: [
		{ role: "user", parts: [{ type: "text", text: "Look this up" }, { type: "image", url: "data:image/png;base64,AAAA" }] },
		{ role: "assistant", text: "", reasoning: "", toolCalls: [{ id: "call_1", name: "lookup", arguments: "{\"q\":1}" }, { id: "call_2", name: "lookup", arguments: "{\"q\":2}" }] },
		{ role: "tool", callId: "call_1", output: "found" },
		{ role: "assistant", text: "Done.", reasoning: "Thought", toolCalls: [] },
	],
	requestTurnCount: 3,
	params: { temperature: 0.4, maxOutputTokens: 300, reasoningEffort: "high", reasoningEnabled: true, serviceTier: "priority" },
	functionTools: [{ name: "lookup", parameters: { type: "object" } }],
	serverTools: ["gateway:web_search"],
	warnings: ["unanswered_tool_calls"],
};

const source = { requestId: "req_1", workspaceId: "ws_1", provider: "openai", loggedAt: "2026-10-20T10:00:00Z" };

test("defaults keep everything and declare tools when the history has tool calls", () => {
	expect(defaultChatLogImportOptions(replay, "openai/gpt-5-mini")).toEqual({
		modelId: "openai/gpt-5-mini",
		pinProvider: false,
		keepParams: true,
		keepSystemPrompt: true,
		keepServerTools: true,
		keepFunctionTools: true,
		includeResponse: true,
	});
});

test("builds a new chat that renders the log and resends it as structured input", () => {
	const options = { ...defaultChatLogImportOptions(replay, "openai/gpt-5-mini"), pinProvider: true };
	const thread = buildThreadFromLogReplay({ replay, options, source, emptyTitle: "New chat", now: "2026-10-21T00:00:00Z" });

	expect(thread.sessionId).toBeTruthy();
	expect(thread.sessionId).not.toBe(thread.id);
	expect(thread.title).toBe("Look this up");
	expect(thread.settings).toMatchObject({
		systemPrompt: "Be brief.",
		providerId: "openai",
		temperature: 0.4,
		maxOutputTokens: 300,
		reasoningEnabled: true,
		reasoningEffort: "high",
		serviceTier: "priority",
		serverTools: ["phaseo:web_search"],
	});

	const [user, toolTurn, answer] = thread.messages;
	expect(thread.messages).toHaveLength(3);
	expect(user).toMatchObject({ role: "user", content: "Look this up", meta: { attachment_previews: [{ dataUrl: "data:image/png;base64,AAAA", isImage: true }] } });
	expect(toolTurn.meta?.tool_calls).toEqual([
		expect.objectContaining({ id: "call_1", name: "lookup", input: { q: 1 }, output: "found" }),
		expect.objectContaining({ id: "call_2", name: "lookup", input: { q: 2 } }),
	]);
	expect(answer).toMatchObject({ role: "assistant", content: "Done.", meta: { reasoning_text: "Thought" } });

	const replayState = thread.replay!;
	expect(replayState.source).toEqual({ requestId: "req_1", workspaceId: "ws_1", endpoint: "chat.completions", loggedAt: "2026-10-20T10:00:00Z" });
	expect(replayState.functionTools).toEqual([{ type: "function", name: "lookup", parameters: { type: "object" } }]);
	expect(replayState.messages[user.id].items).toEqual([
		{ role: "user", content: [{ type: "input_text", text: "Look this up" }, { type: "input_image", image_url: "data:image/png;base64,AAAA" }] },
	]);
	// The answered call stays a call, directly before its result; the unanswered
	// one becomes text ahead of it.
	expect(replayState.messages[toolTurn.id].items).toEqual([
		{ role: "assistant", content: "Called lookup with {\"q\":2}" },
		{ type: "function_call", call_id: "call_1", name: "lookup", arguments: "{\"q\":1}" },
		{ type: "function_call_output", call_id: "call_1", output: "found" },
	]);
});

test("leaves out the response, parameters and provider when not carried over", () => {
	const options = {
		...defaultChatLogImportOptions(replay, "anthropic/claude-haiku-5-5"),
		keepParams: false,
		keepSystemPrompt: false,
		keepFunctionTools: false,
		includeResponse: false,
	};
	const thread = buildThreadFromLogReplay({ replay, options, source, emptyTitle: "New chat" });

	expect(thread.modelId).toBe("anthropic/claude-haiku-5-5");
	expect(thread.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
	expect(thread.settings).toMatchObject({ providerId: "auto", temperature: null, serviceTier: "standard" });
	expect(thread.settings.systemPrompt).not.toBe("Be brief.");
	expect(thread.replay?.functionTools).toBeUndefined();
});

test("sends structured input only for unedited imported messages at the start", () => {
	const thread = buildThreadFromLogReplay({ replay, options: defaultChatLogImportOptions(replay, "m"), source, emptyTitle: "New chat" });
	const [user, toolTurn, answer] = thread.messages;
	const followUp = { id: "new", content: "And then?" };

	const full = replayInputPrefix(thread.replay, [user, toolTurn, answer, followUp]);
	expect(full.count).toBe(3);
	expect(full.items).toHaveLength(5);

	const edited = replayInputPrefix(thread.replay, [user, { ...toolTurn, content: "edited" }, answer]);
	expect(edited.count).toBe(1);
	expect(edited.items).toHaveLength(1);

	expect(replayInputPrefix(undefined, [user])).toEqual({ count: 0, items: [] });
});
