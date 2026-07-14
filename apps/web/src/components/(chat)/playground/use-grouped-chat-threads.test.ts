import { getChatThreadActivityTime } from "./use-grouped-chat-threads";
import type { ChatThread } from "@/lib/indexeddb/chats";

function createThread(messages: ChatThread["messages"]): ChatThread {
	return {
		id: "thread-1",
		title: "Thread",
		modelId: "openai/gpt-5.6-luna",
		createdAt: "2026-07-11T09:00:00.000Z",
		updatedAt: "2026-07-11T09:00:00.000Z",
		messages,
		settings: {
			temperature: null,
			maxOutputTokens: null,
			systemPrompt: "",
			stream: true,
		},
	};
}

describe("getChatThreadActivityTime", () => {
	it("uses the newest message timestamp when messages are present", () => {
		const thread = createThread([
			{
				id: "message-1",
				role: "user",
				content: "First",
				createdAt: "2026-07-11T09:15:00.000Z",
			},
			{
				id: "message-2",
				role: "assistant",
				content: "Second",
				createdAt: "2026-07-11T09:30:00.000Z",
			},
		]);

		expect(getChatThreadActivityTime(thread)).toBe(
			Date.parse("2026-07-11T09:30:00.000Z"),
		);
	});

	it("uses the creation time for an empty thread", () => {
		expect(getChatThreadActivityTime(createThread([]))).toBe(
			Date.parse("2026-07-11T09:00:00.000Z"),
		);
	});
});
