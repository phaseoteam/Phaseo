import type { Editor } from "@tiptap/core";

// Typing or pasting here is already going somewhere.
const editable = "input, textarea, select, [contenteditable=\"true\"], [contenteditable=\"plaintext-only\"], [role=\"textbox\"], .xterm, [data-browser-surface]";
// A focused control keeps its own keys: Enter on a button, letters in a menu.
const interactive = "button, a[href], summary, [role=\"button\"], [role=\"checkbox\"], [role=\"menuitem\"], [role=\"option\"], [role=\"radio\"], [role=\"switch\"], [role=\"tab\"]";
// Popups mount only while open, so their presence means one is up.
const layers = "[role=\"dialog\"], [role=\"alertdialog\"], [role=\"menu\"], [role=\"listbox\"]";

type Target = { closest?: (selector: string) => unknown } | null;

/** Whether input aimed at this element would otherwise go nowhere, so the message box can have it. */
export function redirectableTarget(target: Target, popupOpen: boolean) {
	if (popupOpen) return false;
	if (!target?.closest) return true;
	return !target.closest(editable) && !target.closest(interactive);
}

/**
 * The character a key types, when it should start a message: one printable character without Ctrl, Alt or Cmd.
 * Space is left out, since it scrolls the conversation.
 */
export function typedCharacter(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "isComposing" | "defaultPrevented">) {
	if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
	return event.key.length === 1 && event.key !== " " ? event.key : undefined;
}

// The message boxes on screen, newest last; the newest one that can take text gets redirected input.
const composers: Editor[] = [];

function target() {
	for (const editor of [...composers].reverse()) {
		const dom = editor.isDestroyed ? undefined : editor.view.dom;
		if (dom?.isConnected && editor.isEditable && dom.getClientRects().length) return editor;
	}
}

const redirectable = (event: Event) => redirectableTarget(event.target as Element | null, Boolean(document.querySelector(layers)));

/** A key the shortcuts left alone while nothing editable had focus: it starts typing in the message box. */
export function typeIntoComposer(event: KeyboardEvent) {
	const character = typedCharacter(event), editor = character ? target() : undefined;
	if (!character || !editor || !redirectable(event)) return false;
	editor.chain().focus("end").insertContent(character).run();
	return true;
}

// A click in the conversation takes focus from the message box, so a paste that follows would be lost.
function onPaste(event: ClipboardEvent) {
	const data = event.clipboardData, text = data?.getData("text/plain") ?? "";
	if (event.defaultPrevented || !data || (!text && !data.files.length) || !redirectable(event)) return;
	const editor = target();
	if (!editor) return;
	editor.commands.focus("end");
	// The editor's own paste handling, so images become attachments and a long paste is folded the same way.
	if (editor.view.pasteText(text, event)) { event.preventDefault(); event.stopPropagation(); }
}

/** Lets stray typing and pastes reach this message box while it is on screen. */
export function registerComposer(editor: Editor) {
	if (!composers.length) window.addEventListener("paste", onPaste, true);
	composers.push(editor);
	return () => {
		const index = composers.indexOf(editor);
		if (index >= 0) composers.splice(index, 1);
		if (!composers.length) window.removeEventListener("paste", onPaste, true);
	};
}
