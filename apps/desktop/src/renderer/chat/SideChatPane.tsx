import { useState } from "react";
import { CornerDownLeft, Trash2, X } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { useSelectedTask } from "../lib/useSelectedTask";
import { composeMessage } from "../lib/mentions";
import { Tip } from "../components/ui/tooltip";
import { showToast } from "../components/ui/toast";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { deleteWithUndo } from "../shell/threadUndo";
import { bringBackBlocker } from "../../shared/sideChats";
import { Composer } from "./Composer";
import { useComposerEditor } from "./composerEditor";
import { useComposerMenu } from "./ComposerMenu";
import { Conversation } from "./Conversation";
import { Requests } from "./Requests";
import { PermissionMenu } from "./NewChat";
import { useTaskDraft } from "./ChatView";

/**
 * A side chat in the right pane: its conversation and its own message box, with Bring back, Delete and Close. It
 * runs on its own, so its composer neither steers nor stops the main chat, and its shortcuts stay with the main box.
 */
export function SideChatPane({ id, onClose }: { id: string; onClose: () => void }) {
	const { api, overview, command, select } = useWorkspace();
	const snapshot = overview.tasks.find(task => task.id === id);
	const { task } = useSelectedTask(api?.task, id, snapshot ? JSON.stringify([snapshot.revision, snapshot.updatedAt]) : undefined);
	const parent = overview.tasks.find(value => value.id === snapshot?.delegation?.parentTaskId);
	const draft = useTaskDraft(id);
	const [busy, setBusy] = useState(false);
	const [preview, setPreview] = useState<string>();
	const running = snapshot?.status === "running" || snapshot?.status === "waiting";
	const editor = useComposerEditor({ value: draft.text, onChange: draft.setText, disabled: !snapshot, label: "Side chat message", placeholder: running ? "Queue a follow-up…" : "Ask a follow-up…" });
	const menu = useComposerMenu({ editor, taskId: id, harness: snapshot?.harness, accountId: snapshot?.accountId, projectId: snapshot?.projectId });
	const message = composeMessage(draft.text);
	const canSend = !busy && Boolean(snapshot) && Boolean(message.text) && !message.attachments.length;
	if (!snapshot) return <p className="p-4 text-xs text-muted-foreground">This side chat was deleted.</p>;
	const blocker = task ? bringBackBlocker(task) : "Loading…";

	async function send() {
		if (!canSend) return;
		setBusy(true);
		try {
			const prepared = await menu.prepare(message.text);
			if (await command({ type: "send", id, text: prepared.text, ...(message.threadReferences.length ? { threadReferences: message.threadReferences } : {}), ...(message.githubReferences.length ? { githubReferences: message.githubReferences } : {}) })) draft.clear();
		} finally { setBusy(false); }
	}
	async function bringBack() {
		if (blocker || !await command({ type: "bring-back", id })) return;
		const busyParent = parent && (parent.status === "running" || parent.status === "waiting");
		showToast("success", "Brought back", busyParent ? "The main chat gets it when its current turn ends." : "The main chat is reading it now.");
	}
	/** Branch from here makes an ordinary chat from the side chat, as it does from any chat. */
	async function branch(messageId: string) {
		const known = new Set(overview.tasks.map(value => value.id));
		const state = await command({ type: "fork", id, messageId });
		const next = state?.tasks.find(value => !known.has(value.id))?.id;
		if (next) select(next);
	}
	const remove = () => { onClose(); deleteWithUndo(id, () => command({ type: "delete-task", id })); };

	return <section aria-label="Side chat" data-side-chat-pane className="flex min-h-0 flex-1 flex-col">
		<div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 pr-1 pl-3">
			<span className="min-w-0 flex-1 truncate text-xs font-medium">{snapshot.title}</span>
			<Tip label={blocker ?? "Add this side chat's questions and answers to the main chat"} side="bottom">
				<button type="button" aria-disabled={Boolean(blocker) || undefined} onClick={() => void bringBack()} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-accent aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent [&_svg]:size-3.5"><CornerDownLeft />Bring back</button>
			</Tip>
			<Tip label={running ? "Stop the side chat before deleting it" : "Delete side chat"} side="bottom">
				<button type="button" aria-label="Delete side chat" aria-disabled={running || undefined} onClick={() => { if (!running) remove(); }} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground aria-disabled:cursor-default aria-disabled:opacity-50 [&_svg]:size-3.5"><Trash2 /></button>
			</Tip>
			<Tip label="Close side chat" side="bottom">
				<button type="button" aria-label="Close side chat" onClick={onClose} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5"><X /></button>
			</Tip>
		</div>
		{task ? <Conversation task={task} compact className="min-h-0 flex-1" onAttachment={setPreview} onBranch={messageId => void branch(messageId)}><Requests task={task} inlineQuestions /></Conversation> : <p className="min-h-0 flex-1 p-4 text-xs text-muted-foreground">Loading…</p>}
		<div className="shrink-0 px-3 pt-2 pb-3">
			<Composer editor={editor} menu={menu} shortcuts={false} onSubmit={() => void send()} canSend={canSend} running={running} onStop={() => void command({ type: "cancel", id })}
				tools={snapshot.mode !== "chat" && <PermissionMenu value={task?.permissionMode ?? "supervised"} onChange={permissionMode => void command({ type: "update-task", id, permissionMode })} />} />
		</div>
		{preview && <AttachmentPreview taskId={id} id={preview} onClose={() => setPreview(undefined)} />}
	</section>;
}
