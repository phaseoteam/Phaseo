import { useEffect, useState } from "react";
import { Archive, CornerLeftUp, Download, Ellipsis, FolderOpen, GitBranch, Layers, Paperclip, Pin, PinOff, RotateCcw, X } from "lucide-react";
import type { Attachment, Task } from "../../shared/workspace";
import { errorText, useWorkspace } from "../app/workspace";
import { useSelectedTask } from "../lib/useSelectedTask";
import { usePersistedState } from "../lib/persistedState";
import { rememberModel, type ModelSelection } from "../lib/modelPreferences";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { StatusDot } from "../shell/Sidebar";
import { Composer, ToolButton } from "./Composer";
import { useComposerMenu } from "./ComposerMenu";
import { useComposerEditor } from "./composerEditor";
import { composeMessage, mentionPlainText } from "../lib/mentions";
import { Conversation } from "./Conversation";
import { ModelPicker } from "./ModelPicker";
import { ModelSettings } from "./ModelSettings";
import { PermissionMenu, PlanToggle } from "./NewChat";
import { Requests } from "./Requests";
import { AgentThreads } from "./AgentThreads";
import { optionHarnesses, selectionSettings } from "./startChat";

function ChatHeader({ task }: { task: Task }) {
	const { overview, command, select, api, setError } = useWorkspace();
	const project = overview.projects.find(value => value.id === task.projectId);
	const snapshot = overview.tasks.find(value => value.id === task.id);
	const [renaming, setRenaming] = useState(false);
	const fork = async () => { const known = new Set(overview.tasks.map(value => value.id)); const state = await command({ type: "fork", id: task.id }); const id = state?.tasks.find(value => !known.has(value.id))?.id; if (id) select(id); };
	const canCompact = ["opencode", "codex", "claude", "pi"].includes(task.harness) && !!task.nativeSessionId && !task.archived && !["running", "waiting"].includes(task.status);
	// Agents link to the chat that started them; launched chats to the chat that launched them.
	const parentId = task.delegation?.parentTaskId ?? task.launch?.byTaskId;
	const parent = parentId ? overview.tasks.find(value => value.id === parentId) : undefined;
	return <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
		{parent && <><button type="button" title={task.delegation ? "Open the chat that started this agent" : "Open the chat that launched this one"} onClick={() => select(parent.id)} className="flex min-w-0 max-w-56 shrink items-center gap-1 rounded-md px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><CornerLeftUp className="size-3.5 shrink-0" /><span className="truncate">{parent.title}</span></button><span className="text-muted-foreground/60">/</span></>}
		{renaming
			? <input autoFocus defaultValue={task.title} maxLength={200} aria-label="Chat title" className="h-7 min-w-0 flex-1 rounded-md border border-ring bg-background px-2 text-sm font-semibold outline-none"
				onBlur={event => { const title = event.target.value.trim(); setRenaming(false); if (title && title !== task.title) void command({ type: "update-task", id: task.id, title }); }}
				onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(false); }} />
			: <button type="button" title="Rename" onClick={() => setRenaming(true)} className="min-w-0 truncate rounded-md px-1.5 py-0.5 text-sm font-semibold hover:bg-muted">{task.title}</button>}
		{project && <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11.5px] text-muted-foreground"><FolderOpen className="size-3.5" />{project.name}{project.worktree && <span className="font-mono">⎇ {project.worktree.branch}</span>}</span>}
		<div className="ml-auto flex items-center gap-1.5">
			{snapshot && (snapshot.status !== "completed" && snapshot.status !== "idle" || snapshot.approvalsCount > 0) && <span className="flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11.5px] text-muted-foreground"><StatusDot task={snapshot} />{snapshot.approvalsCount || snapshot.answersCount ? "Needs your input" : snapshot.status === "running" ? "Working" : snapshot.status === "waiting" ? "Waiting" : snapshot.status === "limited" ? "Usage limit reached" : snapshot.status === "interrupted" ? "Interrupted" : snapshot.status === "failed" ? "Failed" : ""}</span>}
			<DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" aria-label="Chat actions" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" />}><Ellipsis className="size-4" /></DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onClick={() => void command({ type: "update-task", id: task.id, pinned: !task.pinned })}>{task.pinned ? <PinOff /> : <Pin />}{task.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
					<DropdownMenuItem disabled={["running", "waiting"].includes(task.status)} onClick={() => void fork()}><GitBranch />Branch chat</DropdownMenuItem>
					{canCompact && <DropdownMenuItem onClick={() => void command({ type: "send", id: task.id, text: "/compact" })}><Layers />Compact context</DropdownMenuItem>}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => void api?.exportTask(task.id, "markdown").catch(reason => setError(errorText(reason)))}><Download />Export as Markdown</DropdownMenuItem>
					<DropdownMenuItem onClick={() => void api?.exportTask(task.id, "json").catch(reason => setError(errorText(reason)))}><Download />Export as JSON</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => void command({ type: "update-task", id: task.id, archived: !task.archived })}><Archive />{task.archived ? "Unarchive" : "Archive"}</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	</header>;
}

/** Draft text for an existing chat, persisted across restarts. Attachments, files and chats sit in it as chips. */
export function useTaskDraft(id: string) {
	const [drafts, setDrafts] = usePersistedState<Record<string, string>>("phaseo.desktop.messageDrafts", {});
	return {
		text: drafts[id] ?? "",
		setText: (value: string) => setDrafts(current => { if ((current[id] ?? "") === value) return current; const next = { ...current }; if (value) next[id] = value; else delete next[id]; return next; }),
		clear: () => { setDrafts(current => { const next = { ...current }; delete next[id]; return next; }); },
	};
}

function ChatComposer({ task }: { task: Task }) {
	const { api, command, overview, select, setError } = useWorkspace();
	const draft = useTaskDraft(task.id);
	const [busy, setBusy] = useState(false);
	const [uploading, setUploading] = useState(false);
	const running = ["running", "waiting"].includes(task.status);
	const code = task.mode !== "chat";
	const editor = useComposerEditor({ value: draft.text, onChange: draft.setText, disabled: task.archived, onFiles: files => void upload(files),
		placeholder: task.archived ? "This chat is archived" : running ? "Queue a follow-up…" : code ? "Ask for a change, or reply to the agent…" : "Reply…" });
	const menu = useComposerMenu({ editor, taskId: task.id, harness: task.harness, accountId: task.accountId, projectId: task.projectId });
	useEffect(() => { editor.focus(); }, [task.id, editor.editor]);
	const selection: ModelSelection = { harness: task.harness, model: task.model, accountId: task.accountId, reasoningEffort: task.reasoningEffort, serviceTier: task.serviceTier, options: task.modelOptions };
	const message = composeMessage(draft.text);
	const canSend = !busy && !uploading && !task.archived && (!!message.text || message.attachments.length > 0);

	async function send() {
		if (!canSend) return;
		setBusy(true);
		try {
			const prepared = await menu.prepare(message.text);
			if (await command({ type: "send", id: task.id, text: prepared.text || "Please review the attached files.", attachments: message.attachments,
				...(message.threadReferences.length ? { threadReferences: message.threadReferences } : {}), ...(prepared.nativeAction ? { nativeAction: prepared.nativeAction } : {}) })) {
				rememberModel(selection); draft.clear();
			}
		} catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
	}
	const attachmentChips = (attachments: Attachment[]) => editor.insert(attachments.map(attachment => ({ kind: "attachment" as const, ref: attachment.id, label: attachment.name })));
	async function attach() {
		if (!api || uploading) return;
		setUploading(true);
		try { const result = await api.chooseAttachments(task.id); attachmentChips(result.attachments); if (result.errors.length) setError(result.errors.join("\n")); }
		catch (reason) { setError(errorText(reason)); } finally { setUploading(false); }
	}
	/** Pasted or dropped images upload straight away and land at the caret; other files go through Attach files. */
	async function upload(files: File[]) {
		if (!api || task.archived) return;
		const images = files.filter(file => file.type.startsWith("image/"));
		if (images.length < files.length) setError("Use Attach files to add files other than images.");
		if (!images.length) return;
		setUploading(true);
		try { for (const file of images) attachmentChips([await api.pasteImage(task.id, file.name, new Uint8Array(await file.arrayBuffer()))]); }
		catch (reason) { setError(errorText(reason)); } finally { setUploading(false); }
	}
	/** Settings changes send explicit values; an empty effort or speed returns to the model's default. */
	async function changeSettings(next: ModelSelection) {
		await command({ type: "update-task", id: task.id,
			...(task.harness === "codex" || task.harness === "grok" ? { reasoningEffort: next.reasoningEffort ?? "" } : {}),
			...(task.harness === "codex" ? { serviceTier: next.serviceTier ?? "" } : {}),
			...(optionHarnesses.includes(task.harness) ? { modelOptions: next.options ?? {} } : {}),
		});
	}

	async function changeModel(next: ModelSelection) {
		if (next.harness === task.harness && (next.accountId ?? "") === (task.accountId ?? "")) { await command({ type: "update-task", id: task.id, model: next.model, ...selectionSettings(next) }); return; }
		const known = new Set(overview.tasks.map(value => value.id));
		const state = await command({ type: "handoff", id: task.id, harness: next.harness, model: next.model, mode: task.mode, ...(task.projectId ? { projectId: task.projectId } : {}), ...(next.accountId ? { accountId: next.accountId } : {}), ...(task.permissionMode ? { permissionMode: task.permissionMode } : {}), ...selectionSettings(next) });
		const id = state?.tasks.find(value => !known.has(value.id))?.id;
		if (id) select(id);
	}

	return <div className="mx-auto w-full max-w-[760px] px-6 pb-4">
		{task.queue.length > 0 && <div className="mb-2 rounded-xl border border-border bg-card/60 px-3 py-2">
			<p className="mb-1 text-[11px] font-medium text-muted-foreground">Queued · sends when the current turn finishes</p>
			{task.queue.map(message => <div key={message.id} className="flex items-center gap-2 py-0.5 text-[13px]"><span className="min-w-0 flex-1 truncate">{mentionPlainText(message.text)}</span><button type="button" aria-label="Remove queued message" onClick={() => void command({ type: "queue-remove", id: task.id, messageId: message.id })} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button></div>)}
		</div>}
		<Composer editor={editor} onSubmit={() => void send()} canSend={canSend} disabled={task.archived}
			running={running} onStop={() => void command({ type: "cancel", id: task.id })}
			menu={task.archived ? undefined : menu}
			tools={<>
				<ToolButton label="Attach files" disabled={uploading || task.archived} onClick={() => void attach()}><Paperclip /></ToolButton>
				{code && <PlanToggle value={task.mode} onChange={mode => void command({ type: "update-task", id: task.id, mode })} />}
				{code && <PermissionMenu value={task.permissionMode} onChange={permissionMode => void command({ type: "update-task", id: task.id, permissionMode })} />}
			</>}
			model={<><ModelPicker selections={[selection]} onChange={values => void changeModel(values[0])} agents={code} disabled={running || task.archived} /><ModelSettings selection={selection} onChange={next => void changeSettings(next)} disabled={running || task.archived} /></>} />
	</div>;
}

export function ChatView({ id }: { id: string }) {
	const { api, overview, command, select } = useWorkspace();
	const snapshot = overview.tasks.find(task => task.id === id);
	const detail = useSelectedTask(api?.task, id, snapshot ? JSON.stringify([snapshot.revision, snapshot.updatedAt]) : undefined);
	const task = detail.task;
	const [preview, setPreview] = useState<string>();
	if (!task) return <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
		<p role="status">{detail.error ? `Could not load this chat: ${detail.error}` : "Loading chat…"}</p>
		{detail.error && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={detail.retry}>Retry</Button><Button variant="ghost" size="sm" onClick={() => select(undefined)}>New chat</Button></div>}
	</div>;
	const branch = async (messageId: string) => { const known = new Set(overview.tasks.map(value => value.id)); const state = await command({ type: "fork", id: task.id, messageId }); const next = state?.tasks.find(value => !known.has(value.id))?.id; if (next) select(next); };
	const removed = overview.projects.find(project => project.id === task.projectId)?.worktree?.removedAt;
	return <div className="flex h-full min-w-0 flex-col">
		<ChatHeader task={task} />
		<Conversation key={task.id} task={task} onAttachment={setPreview} onBranch={messageId => void branch(messageId)}>
			{task.error && <div role="alert" className={cn("flex items-center gap-2 text-[13px]", task.status === "interrupted" ? "text-muted-foreground" : "text-destructive")}>
				<span className="min-w-0">{task.error}</span>
				<Button size="sm" variant="ghost" className="text-foreground" onClick={() => void command({ type: "resume", id: task.id })}><RotateCcw />Resume</Button>
			</div>}
			<AgentThreads taskId={task.id} />
			<Requests task={task} />
			{removed && <p className="text-xs text-muted-foreground">This checkout has been removed. Switch model to continue in another project.</p>}
		</Conversation>
		<ChatComposer task={task} />
		{preview && <AttachmentPreview taskId={task.id} id={preview} onClose={() => setPreview(undefined)} />}
	</div>;
}
