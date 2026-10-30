import {
	CHAT_TIME_SEPARATOR_GAP_MS,
	formatChatTimeSeparator,
	formatModelChangeMarker,
	shouldShowChatTimeSeparator,
} from "@/components/(chat)/chatMessageMarkerHelpers";

describe("chat message marker helpers", () => {
	const base = "2026-08-27T08:00:00.000Z";

	it("shows a separator at the six-hour boundary", () => {
		const sixHoursLater = new Date(
			Date.parse(base) + CHAT_TIME_SEPARATOR_GAP_MS,
		).toISOString();
		const almostSixHoursLater = new Date(
			Date.parse(base) + CHAT_TIME_SEPARATOR_GAP_MS - 1,
		).toISOString();

		expect(shouldShowChatTimeSeparator(almostSixHoursLater, base)).toBe(false);
		expect(shouldShowChatTimeSeparator(sixHoursLater, base)).toBe(true);
	});

	it("shows a separator when the local calendar day changes", () => {
		const previous = new Date(2026, 7, 27, 23, 55).toISOString();
		const current = new Date(2026, 7, 28, 0, 15).toISOString();
		expect(
			shouldShowChatTimeSeparator(current, previous),
		).toBe(true);
	});

	it("formats the first message with an explicit today label", () => {
		const messageDate = new Date(2026, 7, 27, 14, 30);
		const now = new Date(2026, 7, 27, 18, 0);
		expect(
			formatChatTimeSeparator(messageDate.toISOString(), now),
		).toBe("Today at 14:30");
	});

	it("summarizes a multi-model change while retaining the full title", () => {
		expect(
			formatModelChangeMarker(["GPT-5.6", "Claude Opus", "Gemini Pro"]),
		).toEqual({
			label: "Models changed to GPT-5.6 + Claude Opus + 1 more",
			title: "Models changed to GPT-5.6, Claude Opus, Gemini Pro",
		});
	});
});
