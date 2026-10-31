import { useEffect, useRef } from "react";
import { Archive, X } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { shortDuration } from "../../shared/threadLifecycle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { showToast } from "../components/ui/toast";
import { shortcut, useCommand } from "../lib/keybindings";
import { mentionPlainText } from "../lib/mentions";
import { chatPrompts, historyEntries, recentPrompts, stepHistory, type HistoryPosition } from "./promptHistory";
import { clearStash, stashedDraft, stashPrompt, takeStashed, useStash } from "./promptStash";

type Draft = { text: string; setText: (value: string) => void };

/** Up and Down in an empty message box step through earlier prompts: this chat's, then other chats'. */
export function usePromptHistory(task: Pick<Task, "id" | "messages">, draft: Draft) {
	const position = useRef<HistoryPosition | undefined>(undefined);
	useEffect(() => { position.current = undefined; }, [task.id]);
	const step = (direction: "back" | "forward") => {
		const next = stepHistory(direction, historyEntries(chatPrompts(task.messages), recentPrompts()), position.current, draft.text);
		if (!next) return false;
		position.current = next.position; draft.setText(next.text);
	};
	useCommand("composer.historyPrevious", () => step("back"));
	useCommand("composer.historyNext", () => step("forward"));
}

/** Mod+S parks the draft, or brings back the newest stashed one when the box is empty (T3's composer.stash). */
export function usePromptStash(taskId: string, draft: Draft) {
	const restore = (id?: string) => {
		const item = takeStashed(id);
		if (!item) return false;
		// Bringing one back never loses what is in the box: it takes the stashed one's place.
		if (draft.text.trim()) stashPrompt(draft.text, taskId);
		const { text, dropped } = stashedDraft(item, taskId);
		draft.setText(text);
		if (dropped) showToast("info", dropped === 1 ? "The attachment stayed behind" : `${dropped} attachments stayed behind`, "Attachments belong to the chat they were added in.");
	};
	const stash = () => {
		if (!draft.text.trim()) return false;
		stashPrompt(draft.text, taskId); draft.setText("");
		const key = shortcut("composer.stash");
		showToast("info", "Draft stashed", key ? `${key} in an empty message box brings it back.` : undefined);
	};
	useCommand("composer.stash", () => draft.text.trim() ? stash() : restore());
	/** Parks a draft without asking, so something else can take the box (Edit from here). */
	const park = (text: string) => { if (text.trim()) { stashPrompt(text, taskId); showToast("info", "Your draft was stashed", "Bring it back from the stash beside Attach files."); } };
	return { restore, park };
}

/** The stash beside Attach files, once something is in it: bring a draft back, or clear the lot. */
export function StashMenu({ onRestore }: { onRestore: (id: string) => void }) {
	const items = useStash();
	if (!items.length) return null;
	const now = Date.now();
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" aria-label={`Stashed drafts (${items.length})`} title="Stashed drafts" className="flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4" />}><Archive />{items.length}</DropdownMenuTrigger>
		<DropdownMenuContent align="start" className="w-72">
			{items.map((item, index) => <DropdownMenuItem key={item.id} onClick={() => onRestore(item.id)}>
				<span className="min-w-0 flex-1 truncate">{mentionPlainText(item.text).replace(/\s+/g, " ")}</span>
				<DropdownMenuShortcut>{index === 0 && shortcut("composer.stash") ? shortcut("composer.stash") : `${shortDuration(now - Date.parse(item.createdAt))}`}</DropdownMenuShortcut>
			</DropdownMenuItem>)}
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={clearStash}><X />Clear stash</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;
}
