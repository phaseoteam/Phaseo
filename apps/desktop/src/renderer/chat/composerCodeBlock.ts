import { draftContent, type ComposerEditor } from "./composerEditor";

/** A fenced block around the selected text, or an empty one; a longer fence when the text holds one. */
export function fencedBlock(selected: string, language = "") {
	const fence = /```/.test(selected) ? "````" : "```";
	return `${fence}${language === "text" ? "" : language}\n${selected}\n${fence}`;
}

/**
 * Ctrl+Alt+C in the message box: wraps the selection in a code block, or starts an empty one with the caret inside. Type
 * the language after the opening fence. The draft stays plain Markdown, as typing ``` does.
 */
export function insertCodeBlock(editor: ComposerEditor) {
	const current = editor.editor;
	if (!current || current.isDestroyed) return false;
	const { from, to } = current.state.selection;
	const selected = current.state.doc.textBetween(from, to, "\n");
	current.chain().focus().insertContentAt({ from, to }, draftContent(fencedBlock(selected)).content ?? []).run();
	// The caret goes to the opening fence when the block is empty, ready for the language and then the code.
	if (!selected) { const position = current.state.selection.from; current.commands.setTextSelection(Math.max(1, position - 7)); }
	return true;
}
