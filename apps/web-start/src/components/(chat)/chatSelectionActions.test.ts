import {
	appendChatSelectionPrompt,
	buildChatSelectionPrompt,
} from "./chatSelectionActions";
import { getChatSelectionToolbarPosition } from "./chatSelectionPosition";

describe("chat selection actions", () => {
	it("builds an editable prompt that keeps the selected text", () => {
		expect(buildChatSelectionPrompt("shorten", "  A long answer.  ")).toBe(
			"Shorten this: A long answer.",
		);
	});

	it("keeps multiline selections on one line", () => {
		expect(buildChatSelectionPrompt("explain", "First line\nSecond line")).toBe(
			"Explain this clearly: First line Second line",
		);
	});

	it("adds the selection prompt after an existing draft", () => {
		expect(appendChatSelectionPrompt("Keep this", "Explain that")).toBe(
			"Keep this\n\nExplain that",
		);
	});

	it("keeps the toolbar within both horizontal viewport edges", () => {
		const viewport = { width: 390, height: 844 };
		const toolbar = { width: 300, height: 40 };

		expect(
			getChatSelectionToolbarPosition(
				{ anchorLeft: 5, anchorTop: 100, anchorBottom: 120 },
				toolbar,
				viewport,
			).left,
		).toBe(162);
		expect(
			getChatSelectionToolbarPosition(
				{ anchorLeft: 385, anchorTop: 100, anchorBottom: 120 },
				toolbar,
				viewport,
			).left,
		).toBe(228);
	});

	it("places the toolbar above a final selected line near the viewport bottom", () => {
		expect(
			getChatSelectionToolbarPosition(
				{ anchorLeft: 200, anchorTop: 790, anchorBottom: 810 },
				{ width: 240, height: 40 },
				{ width: 390, height: 844 },
			),
		).toEqual({ left: 200, top: 742 });
	});
});
