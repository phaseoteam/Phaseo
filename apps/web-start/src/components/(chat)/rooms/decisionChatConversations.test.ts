import { listRoomHistory } from "@/lib/indexeddb/chatRoomHistory";
import { getAllChatTags, getAllChats } from "@/lib/indexeddb/chats";
import { createDefaultDecisionDraft } from "@/components/(chat)/DecisionComposer";
import {
	createDecisionConversation,
	loadDecisionConversationHistory,
	type DecisionHistoryPayload,
} from "./decisionChatConversations";

jest.mock("@/lib/indexeddb/chatRoomHistory", () => ({
	listRoomHistory: jest.fn(),
}));
jest.mock("@/lib/indexeddb/chats", () => ({
	getAllChatTags: jest.fn(),
	getAllChats: jest.fn(),
}));

const storedRun: DecisionHistoryPayload = {
	id: "run-1",
	conversationId: "decisions-chat-1",
	conversationTitle: "Recovered chat",
	input: "Should we proceed?",
	model: "typesafe/jev-1.13.0",
	request: { state: {}, questions: {} },
	draft: createDefaultDecisionDraft(),
	result: { answer: "yes" },
	createdAt: "2026-09-21T10:00:00.000Z",
	completedAt: "2026-09-21T10:00:01.000Z",
};

describe("loadDecisionConversationHistory", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("keeps loaded runs when chat metadata cannot be read", async () => {
		jest.mocked(listRoomHistory).mockResolvedValue([
			{
				id: storedRun.id,
				roomId: "decisions",
				createdAt: storedRun.createdAt,
				updatedAt: storedRun.completedAt ?? storedRun.createdAt,
				payload: storedRun,
			},
		] as never);
		jest.mocked(getAllChats).mockRejectedValue(new Error("unavailable"));
		jest.mocked(getAllChatTags).mockRejectedValue(new Error("unavailable"));

		const result = await loadDecisionConversationHistory(
			"typesafe/jev-1.13.0",
			null,
		);

		expect(result.runs).toHaveLength(1);
		expect(result.conversations[0]?.title).toBe("Recovered chat");
		expect(result.conversationsToPersist).toEqual([]);
		expect(result.tags).toEqual([]);
		expect(result.complete).toBe(false);
	});

	it("keeps loaded chats when room history cannot be read", async () => {
		const conversation = createDecisionConversation("typesafe/jev-1.13.0", {
			id: "decisions-chat-2",
			title: "Saved chat",
		});
		jest.mocked(listRoomHistory).mockRejectedValue(new Error("unavailable"));
		jest.mocked(getAllChats).mockResolvedValue([conversation]);
		jest.mocked(getAllChatTags).mockRejectedValue(new Error("unavailable"));

		const result = await loadDecisionConversationHistory(
			"typesafe/jev-1.13.0",
			null,
		);

		expect(result.runs).toEqual([]);
		expect(result.conversations.map((entry) => entry.id)).toEqual([
			"decisions-chat-2",
		]);
		expect(result.conversationsToPersist).toEqual([]);
		expect(result.tags).toEqual([]);
		expect(result.complete).toBe(false);
	});
});
