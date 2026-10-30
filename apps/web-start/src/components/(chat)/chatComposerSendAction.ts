export type ChatComposerSendAction =
	| "none"
	| "open-model-selector"
	| "submit";

type ChatComposerSendState = {
	hasComposerContent: boolean;
	hasComposerText: boolean;
	hasSelectedModel: boolean;
	isRecording: boolean;
	slashMenuOpen: boolean;
};

export function getChatComposerSendAction({
	hasComposerContent,
	hasComposerText,
	hasSelectedModel,
	isRecording,
	slashMenuOpen,
}: ChatComposerSendState): ChatComposerSendAction {
	if (isRecording || slashMenuOpen || !hasComposerContent) {
		return "none";
	}

	if (hasSelectedModel) {
		return "submit";
	}

	return hasComposerText ? "open-model-selector" : "none";
}
