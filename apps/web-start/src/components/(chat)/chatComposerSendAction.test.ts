import { getChatComposerSendAction } from "./chatComposerSendAction";

describe("getChatComposerSendAction", () => {
	it("opens model selection when content is ready but no model is selected", () => {
		expect(
			getChatComposerSendAction({
				hasComposerContent: true,
				hasComposerText: true,
				hasSelectedModel: false,
				isRecording: false,
				slashMenuOpen: false,
			}),
		).toBe("open-model-selector");
	});

	it("submits when content and a selected model are present", () => {
		expect(
			getChatComposerSendAction({
				hasComposerContent: true,
				hasComposerText: true,
				hasSelectedModel: true,
				isRecording: false,
				slashMenuOpen: false,
			}),
		).toBe("submit");
	});

	it.each([
		{ hasComposerContent: false, hasComposerText: false, isRecording: false, slashMenuOpen: false },
		{ hasComposerContent: true, hasComposerText: true, isRecording: true, slashMenuOpen: false },
		{ hasComposerContent: true, hasComposerText: true, isRecording: false, slashMenuOpen: true },
		{ hasComposerContent: true, hasComposerText: false, isRecording: false, slashMenuOpen: false },
	])("does nothing when the composer cannot act: %o", (state) => {
		expect(
			getChatComposerSendAction({
				...state,
				hasSelectedModel: false,
			}),
		).toBe("none");
	});
});
