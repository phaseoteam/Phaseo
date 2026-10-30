export type ChatSelectionAction =
	| "explain"
	| "improve"
	| "shorten"
	| "change-tone"
	| "fix-grammar";

const ACTION_INSTRUCTIONS: Record<ChatSelectionAction, string> = {
	explain: "Explain this clearly:",
	improve: "Improve this:",
	shorten: "Shorten this:",
	"change-tone": "Rewrite this in a more appropriate tone:",
	"fix-grammar": "Fix the grammar:",
};

export function buildChatSelectionPrompt(
	action: ChatSelectionAction,
	selectedText: string,
) {
	const text = selectedText.trim().replace(/\s+/g, " ");
	return `${ACTION_INSTRUCTIONS[action]} ${text}`;
}

export function appendChatSelectionPrompt(
	composer: string,
	selectionPrompt: string,
) {
	const existing = composer.trim();
	return existing ? `${existing}\n\n${selectionPrompt}` : selectionPrompt;
}
