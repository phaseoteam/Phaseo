import { useEffect, useRef, useState } from "react";
import type { Task } from "../../shared/workspace";
import { showToast } from "../components/ui/toast";
import { shortcut, useCommand } from "../lib/keybindings";
import type { ComposerEditor } from "./composerEditor";
import { chatPrompts, historyEntries, recentPrompts, stepHistory, type HistoryPosition } from "./promptHistory";
import { deleteStashed, stashedDraft, stashKeyAction, stashPrompt, takeStashed, useStash } from "./promptStash";

type Draft = { text: string; setText: (value: string) => void };

/** Whether the caret is on the box's first visual line (back) or last (forward), counting wrapped lines. */
function atEdge(editor: ComposerEditor | undefined, direction: "back" | "forward") {
	const instance = editor?.editor;
	if (!instance || instance.isDestroyed) return true;
	const { view } = instance, paragraph = view.state.selection.$from.index(0);
	return view.endOfTextblock(direction === "back" ? "up" : "down") && paragraph === (direction === "back" ? 0 : view.state.doc.childCount - 1);
}

/**
 * Up and Down in an empty message box step through earlier prompts: this chat's, then other chats'. On a recalled prompt
 * left as it was they keep stepping while the caret is on its first line (Up) or last line (Down); elsewhere they move the caret.
 */
export function usePromptHistory(task: Pick<Task, "id" | "messages">, draft: Draft, editor?: ComposerEditor) {
	const position = useRef<HistoryPosition | undefined>(undefined);
	useEffect(() => { position.current = undefined; }, [task.id]);
	const step = (direction: "back" | "forward") => {
		if (draft.text && !atEdge(editor, direction)) return false;
		const next = stepHistory(direction, historyEntries(chatPrompts(task.messages), recentPrompts()), position.current, draft.text);
		if (!next) return false;
		position.current = next.position; draft.setText(next.text);
	};
	useCommand("composer.historyPrevious", () => step("back"));
	useCommand("composer.historyNext", () => step("forward"));
}

/**
 * The stash: Mod+S parks the draft; in an empty box it brings back the only stashed draft, or opens the stash to choose
 * from several (composer.stash). The stash shows as a tab above the box while it holds anything.
 */
export function usePromptStash(taskId: string, draft: Draft) {
	const items = useStash();
	const [open, setOpen] = useState(false);
	// Bumped per stash, so the tab's count replays its fade in.
	const [pulse, setPulse] = useState(0);
	useEffect(() => { setOpen(false); }, [taskId]);
	useEffect(() => { if (!items.length) setOpen(false); }, [items.length]);
	const restore = (id?: string) => {
		const item = takeStashed(id);
		if (!item) return false;
		setOpen(false);
		// Bringing one back never loses what is in the box: it takes the stashed one's place.
		if (draft.text.trim()) stashPrompt(draft.text, taskId);
		const { text, dropped } = stashedDraft(item, taskId);
		draft.setText(text);
		if (dropped) showToast("info", dropped === 1 ? "The attachment stayed behind" : `${dropped} attachments stayed behind`, "Attachments belong to the chat they were added in.");
	};
	const stash = () => { stashPrompt(draft.text, taskId); draft.setText(""); setPulse(value => value + 1); };
	useCommand("composer.stash", () => {
		const action = stashKeyAction(draft.text, items.length);
		if (action === "stash") return stash();
		if (action === "restore") return restore();
		if (action === "open") { setOpen(true); return; }
		return false;
	});
	/** Parks a draft without asking, so something else can take the box (Edit from here). */
	const park = (text: string) => { if (text.trim()) { stashPrompt(text, taskId); setPulse(value => value + 1); showToast("info", "Your draft was stashed", "Bring it back from Stash above the message box."); } };
	return { items, open, setOpen, pulse, restore, remove: deleteStashed, park, shortcut: shortcut("composer.stash") };
}
