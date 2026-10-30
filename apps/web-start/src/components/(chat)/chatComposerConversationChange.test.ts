import { shouldResetComposerForConversationChange } from "./chatComposerConversationChange";

describe("shouldResetComposerForConversationChange", () => {
	it("preserves the composer when temporary mode is explicitly toggled on or off", () => {
		expect(
			shouldResetComposerForConversationChange(
				{
					activeThreadId: "stored-chat",
					temporaryReturnThreadId: null,
					temporaryMode: false,
				},
				{
					activeThreadId: "__temporary_chat__",
					temporaryReturnThreadId: "stored-chat",
					temporaryMode: true,
				},
			),
		).toBe(false);
		expect(
			shouldResetComposerForConversationChange(
				{
					activeThreadId: "__temporary_chat__",
					temporaryReturnThreadId: "stored-chat",
					temporaryMode: true,
				},
				{
					activeThreadId: "stored-chat",
					temporaryReturnThreadId: "stored-chat",
					temporaryMode: false,
				},
			),
		).toBe(false);
	});

	it("resets when a saved thread is selected from temporary mode", () => {
		expect(
			shouldResetComposerForConversationChange(
				{
					activeThreadId: "__temporary_chat__",
					temporaryReturnThreadId: "stored-chat",
					temporaryMode: true,
				},
				{
					activeThreadId: "another-chat",
					temporaryReturnThreadId: "stored-chat",
					temporaryMode: false,
				},
			),
		).toBe(true);
	});

	it("resets the composer when switching between stored chats", () => {
		expect(
			shouldResetComposerForConversationChange(
				{
					activeThreadId: "chat-one",
					temporaryReturnThreadId: null,
					temporaryMode: false,
				},
				{
					activeThreadId: "chat-two",
					temporaryReturnThreadId: null,
					temporaryMode: false,
				},
			),
		).toBe(true);
	});

	it("retains the initial reset behavior", () => {
		expect(
			shouldResetComposerForConversationChange(null, {
				activeThreadId: "chat-one",
				temporaryReturnThreadId: null,
				temporaryMode: false,
			}),
		).toBe(true);
	});
});
