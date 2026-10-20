import { useEffect, useState, type ReactNode } from "react";
import { TerminalDrawer } from "../views/Terminals";
import { AlarmClockOff, Archive, Box, CircleCheck, Clock, Undo2, CornerLeftUp, Download, Ellipsis, Gauge, GitBranch, Layers, ListChecks, Paperclip, PenLine, Pin, PinOff, Plug, RotateCcw, Settings, ShieldCheck, SquarePen, UserRound, X } from "lucide-react";
import { ProjectIcon } from "../components/ProjectIcon";
import { QuestionPanel } from "./QuestionPanel";
import { useQuestionAnswerer } from "./questionComposer";
import { shortcut, useCommand } from "../lib/keybindings";
import { CustomSnoozeDialog, SnoozeItems, useThreadActions } from "../shell/threadActions";
import { hasWoken, isSettled, isSnoozed, settleBlocker, shortDuration } from "../../shared/threadLifecycle";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { TagEditor } from "../components/Tags";
import type { AccountStatus, Attachment, Task } from "../../shared/workspace";
import { errorText, useWorkspace } from "../app/workspace";
import { useSelectedTask } from "../lib/useSelectedTask";
import { usePersistedState } from "../lib/persistedState";
import { rememberModel, type ModelSelection } from "../lib/modelPreferences";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { StatusDot } from "../shell/Sidebar";
import { Composer, ToolButton } from "./Composer";
import { useComposerMenu } from "./ComposerMenu";
import { useComposerEditor } from "./composerEditor";
import { composeMessage, mentionPlainText } from "../lib/mentions";
import { UsageMeters } from "../settings/UsageMeters";
import { Conversation } from "./Conversation";
import { ModelPicker } from "./ModelPicker";
import { ModelSettings } from "./ModelSettings";
import { PermissionMenu, PlanIndicator } from "./NewChat";
import { openModelPickerEvent, renameChatEvent, useModelSettingActions, type ComposerAction } from "./composerActions";
import { Requests } from "./Requests";
import { AgentThreads } from "./AgentThreads";
import { ChatSpend } from "./ChatSpend";
import { optionHarnesses, selectionSettings } from "./startChat";
import { ProjectScriptsControl } from "../components/ProjectScripts";
import { PullRequestBadge } from "../views/pullRequests/PullRequestBadge";

function ChatHeader({ task, onOpenTerminal }: { task: Task; onOpenTerminal: () => void }) {
	const { overview, command, select, api, setError, openProjectSettings } = useWorkspace();
	const project = overview.projects.find(value => value.id === task.projectId);
	const snapshot = overview.tasks.find(value => value.id === task.id);
	const [renaming, setRenaming] = useState(false);
	const [customSnooze, setCustomSnooze] = useState(false);
	const threadActions = useThreadActions();
	useEffect(() => { setRenaming(false); }, [task.id]);
	useEffect(() => { const rename = () => setRenaming(true); window.addEventListener(renameChatEvent, rename); return () => window.removeEventListener(renameChatEvent, rename); }, []);
	const fork = async () => { const known = new Set(overview.tasks.map(value => value.id)); const state = await command({ type: "fork", id: task.id }); const id = state?.tasks.find(value => !known.has(value.id))?.id; if (id) select(id); };
	const canCompact = ["opencode", "codex", "claude", "pi", "phaseo"].includes(task.harness) && !!task.nativeSessionId && !task.archived && !["running", "waiting"].includes(task.status);
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
		{!renaming && <TagEditor task={snapshot ?? task} />}
		{project && <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11.5px] text-muted-foreground"><ProjectIcon project={project} className="size-3.5" />{project.name}{project.worktree && <span className="font-mono">⎇ {project.worktree.branch}</span>}</span>}
		<div className="ml-auto flex items-center gap-1.5">
			{project && !project.worktree?.removedAt && <ProjectScriptsControl project={project} taskId={task.id} onRun={onOpenTerminal} />}
			{snapshot && (snapshot.status !== "completed" && snapshot.status !== "idle" || snapshot.approvalsCount > 0) && <span className="flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11.5px] text-muted-foreground"><StatusDot task={snapshot} />{snapshot.approvalsCount || snapshot.answersCount ? "Needs your input" : snapshot.status === "running" ? "Working" : snapshot.status === "waiting" ? "Waiting" : snapshot.status === "limited" ? "Usage limit reached" : snapshot.status === "interrupted" ? "Interrupted" : snapshot.status === "failed" ? "Failed" : ""}</span>}
			<DropdownMenu>
				<DropdownMenuTrigger render={<button type="button" aria-label="Chat actions" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" />}><Ellipsis className="size-4" /></DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onClick={() => void command({ type: "update-task", id: task.id, pinned: !task.pinned })}>{task.pinned ? <PinOff /> : <Pin />}{task.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
					{snapshot?.projectId && (isSettled(snapshot)
						? <DropdownMenuItem onClick={() => void threadActions.unsettle(snapshot)}><Undo2 />Un-settle chat</DropdownMenuItem>
						: <DropdownMenuItem disabled={Boolean(settleBlocker(snapshot))} onClick={() => void threadActions.settle(snapshot)}><CircleCheck />Settle chat<DropdownMenuShortcut>{shortcut("thread.settle")}</DropdownMenuShortcut></DropdownMenuItem>)}
					{snapshot?.projectId && !isSettled(snapshot) && (isSnoozed(snapshot)
						? <DropdownMenuItem onClick={() => void threadActions.wake(snapshot)}><AlarmClockOff />Wake chat</DropdownMenuItem>
						: <DropdownMenuSub><DropdownMenuSubTrigger><Clock />Snooze</DropdownMenuSubTrigger><DropdownMenuSubContent className="w-56"><SnoozeItems onSnooze={until => void threadActions.snooze(snapshot, until)} onCustom={() => setCustomSnooze(true)} /></DropdownMenuSubContent></DropdownMenuSub>)}
					<DropdownMenuItem disabled={["running", "waiting"].includes(task.status)} onClick={() => void fork()}><GitBranch />Branch chat</DropdownMenuItem>
					{canCompact && <DropdownMenuItem onClick={() => void command({ type: "send", id: task.id, text: "/compact" })}><Layers />Compact context</DropdownMenuItem>}
					<DropdownMenuSeparator />
					{project && <DropdownMenuItem onClick={() => openProjectSettings(project.id)}><Settings />Project settings</DropdownMenuItem>}
					<DropdownMenuItem onClick={() => void api?.exportTask(task.id, "markdown").catch(reason => setError(errorText(reason)))}><Download />Export as Markdown</DropdownMenuItem>
					<DropdownMenuItem onClick={() => void api?.exportTask(task.id, "json").catch(reason => setError(errorText(reason)))}><Download />Export as JSON</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => void command({ type: "update-task", id: task.id, archived: !task.archived })}><Archive />{task.archived ? "Unarchive" : "Archive"}</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
		{snapshot && <CustomSnoozeDialog open={customSnooze} onOpenChange={setCustomSnooze} onSnooze={until => void threadActions.snooze(snapshot, until)} />}
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
	const { api, command, overview, select, setError, openSettings } = useWorkspace();
	const draft = useTaskDraft(task.id);
	const [busy, setBusy] = useState(false);
	const [uploading, setUploading] = useState(false);
	// /usage shows this agent's plan limits above the composer until dismissed.
	const [limits, setLimits] = useState<AccountStatus | { error: string } | "loading">();
	useEffect(() => { setLimits(undefined); }, [task.id]);
	const limitHarness = (["codex", "claude", "cursor", "grok"] as const).find(value => value === task.harness);
	const showLimits = async () => {
		if (!api || !limitHarness) { openSettings("usage"); return; }
		setLimits("loading");
		try { setLimits(await api.accountStatus(limitHarness, task.accountId)); } catch (reason) { setLimits({ error: errorText(reason) }); }
	};
	const running = ["running", "waiting"].includes(task.status);
	const code = task.mode !== "chat";
	// While the agent waits on a question, the composer is its own-answer field, as in T3 Code.
	const answerer = useQuestionAnswerer(task.id);
	const editor = useComposerEditor({ value: draft.text, onChange: draft.setText, disabled: task.archived, onFiles: files => void upload(files),
		placeholder: task.archived ? "This chat is archived" : answerer ? "Type your own answer, or leave this blank to use the selected option" : running ? "Queue a follow-up…" : code ? "Ask for a change, or reply to the agent…" : "Reply…" });
	const selection: ModelSelection = { harness: task.harness, model: task.model, accountId: task.accountId, reasoningEffort: task.reasoningEffort, serviceTier: task.serviceTier, options: task.modelOptions };
	const settingActions = useModelSettingActions(task.archived || running ? undefined : selection, next => void changeSettings(next));
	const canCompact = ["opencode", "codex", "claude", "pi", "phaseo"].includes(task.harness) && !!task.nativeSessionId && !task.archived && !running;
	const fork = async () => { const known = new Set(overview.tasks.map(value => value.id)); const state = await command({ type: "fork", id: task.id }); const id = state?.tasks.find(value => !known.has(value.id))?.id; if (id) select(id); };
	const plan = task.mode === "plan", full = task.permissionMode === "full-access", edits = task.permissionMode === "accept-edits";
	const actions: ComposerAction[] = [
		{ id: "archive", label: "Archive", description: "Archive this chat", icon: <Archive />, run: () => void command({ type: "update-task", id: task.id, archived: true }) },
		...canCompact ? [{ id: "compact", label: "Compact", description: "Summarise earlier messages to free up context", icon: <Layers />, run: () => void command({ type: "send", id: task.id, text: "/compact" }) }] : [],
		...running ? [] : [{ id: "fork", label: "Fork chat", description: "Continue in a copy of this chat", icon: <GitBranch />, run: () => void fork() }],
		{ id: "export", label: "Export", description: "Save this chat as a file", icon: <Download />, options: (["markdown", "json"] as const).map(format => ({ id: `export:${format}`, label: format === "markdown" ? "Markdown" : "JSON", icon: null, run: () => void api?.exportTask(task.id, format).catch(reason => setError(errorText(reason))) })) },
		{ id: "attach", label: "Attach files", description: "Add files or images to this message", icon: <Paperclip />, run: () => void attach() },
		{ id: "mcp", label: "MCP", description: "Manage MCP servers", icon: <Plug />, run: () => openSettings("mcp") },
		{ id: "model", label: "Model", description: "Switch this chat's model", icon: <Box />, run: () => window.dispatchEvent(new Event(openModelPickerEvent)) },
		{ id: "new", label: "New chat", description: "Start a new chat", icon: <SquarePen />, run: () => select(undefined) },
		{ id: "pin", label: task.pinned ? "Unpin chat" : "Pin chat", description: task.pinned ? "Remove this chat from Pinned" : "Keep this chat at the top of the sidebar", icon: task.pinned ? <PinOff /> : <Pin />, run: () => void command({ type: "update-task", id: task.id, pinned: !task.pinned }) },
		...code && !running ? [
			{ id: "plan", label: "Plan mode", description: plan ? "Turn plan mode off" : "Turn plan mode on: the agent proposes a plan before changing anything", icon: <ListChecks />, checked: plan, run: () => void command({ type: "update-task", id: task.id, mode: plan ? "code" as const : "plan" as const }) },
			{ id: "permissions", label: "Permissions", hint: full ? "Full access" : edits ? "Accept edits" : "Ask first", icon: <ShieldCheck />, options: [
				{ id: "permissions:supervised", label: "Ask first", description: "Approve commands and file changes before they run", icon: null, checked: !full && !edits, run: () => void command({ type: "update-task", id: task.id, permissionMode: "supervised" }) },
				{ id: "permissions:accept-edits", label: "Accept edits", description: "File changes apply without asking; commands still ask first", icon: null, checked: edits, run: () => void command({ type: "update-task", id: task.id, permissionMode: "accept-edits" }) },
				{ id: "permissions:full-access", label: "Full access", description: "The agent runs commands and edits files without asking", icon: null, checked: full, run: () => void command({ type: "update-task", id: task.id, permissionMode: "full-access" }) },
			] },
		] : [],
		{ id: "usage", label: "Usage", description: limitHarness ? "Show this agent's plan limits" : "Open usage and limits", icon: <Gauge />, run: () => void showLimits() },
		{ id: "rename", label: "Rename", description: "Rename this chat", icon: <PenLine />, run: () => window.dispatchEvent(new Event(renameChatEvent)) },
		{ id: "accounts", label: "Accounts", description: "Manage accounts and usage", icon: <UserRound />, run: () => openSettings("accounts") },
		...settingActions,
	];
	const menu = useComposerMenu({ editor, taskId: task.id, harness: task.harness, accountId: task.accountId, projectId: task.projectId, actions });
	useEffect(() => { editor.focus(); }, [task.id, editor.editor]);
	const message = composeMessage(draft.text);
	const canSend = !busy && !uploading && !task.archived && (!!answerer || !!message.text || message.attachments.length > 0);

	async function send() {
		if (!canSend) return;
		if (answerer) {
			if (message.attachments.length) { setError("Answers cannot carry attachments. Remove them, or dismiss the question first."); return; }
			if (answerer.answer(mentionPlainText(message.text))) draft.clear();
			return;
		}
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
		{/* Pull request updates the app queued for the agent are not the person's to edit, as in T3. */}
		{task.queue.some(message => !message.notice) && <div className="mb-2 rounded-xl border border-border bg-card/60 px-3 py-2">
			<p className="mb-1 text-[11px] font-medium text-muted-foreground">Queued · sends when the current turn finishes</p>
			{task.queue.filter(message => !message.notice).map(message => <div key={message.id} className="flex items-center gap-2 py-0.5 text-[13px]"><span className="min-w-0 flex-1 truncate">{mentionPlainText(message.text)}</span><button type="button" aria-label="Remove queued message" onClick={() => void command({ type: "queue-remove", id: task.id, messageId: message.id })} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button></div>)}
		</div>}
		{limits && <div className="mb-2 flex flex-col gap-2 rounded-xl border border-border bg-card/60 px-4 py-3">
			<div className="flex items-center gap-2 text-[13px] font-semibold"><Gauge className="size-4 text-muted-foreground" />Usage limits<button type="button" aria-label="Hide usage limits" onClick={() => setLimits(undefined)} className="ml-auto grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button></div>
			{limits === "loading" ? <p className="text-xs text-muted-foreground">Checking…</p> : "error" in limits ? <p className="text-xs text-destructive">{limits.error}</p> : <UsageMeters status={limits} />}
		</div>}
		<Composer editor={editor} onSubmit={() => void send()} canSend={canSend} disabled={task.archived}
			running={running} onStop={() => void command({ type: "cancel", id: task.id })}
			menu={task.archived ? undefined : menu}
			footer={<ChatSpend taskId={task.id} />}
			model={task.projectId && <PullRequestBadge taskId={task.id} projectId={task.projectId} links={overview.tasks.find(value => value.id === task.id)?.pullRequests} branch className="mr-1 h-7 px-1.5 hover:bg-accent/60" />}
			tools={<>
				<ToolButton label="Attach files" disabled={uploading || task.archived} onClick={() => void attach()}><Paperclip /></ToolButton>
				<ModelPicker selections={[selection]} onChange={values => void changeModel(values[0])} agents={code} disabled={running || task.archived} openEvent={openModelPickerEvent} />
				<ModelSettings selection={selection} onChange={next => void changeSettings(next)} disabled={running || task.archived} />
				{code && <PermissionMenu value={task.permissionMode} onChange={permissionMode => void command({ type: "update-task", id: task.id, permissionMode })} />}
				{plan && <PlanIndicator onClear={running ? undefined : () => void command({ type: "update-task", id: task.id, mode: "code" })} />}
			</>} />
	</div>;
}

/** T3's quiet line after the last message: settled, snoozed or woke, with the way back. */
function ThreadStatusLine({ task }: { task: TaskOverview }) {
	const actions = useThreadActions();
	const now = Date.now();
	const line = (text: string, action: string, run: () => void) => <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">{text}<span aria-hidden>·</span><button type="button" onClick={run} className="font-medium text-foreground hover:underline">{action}</button></p>;
	if (!task.projectId) return null;
	if (isSnoozed(task, now)) return line(`Snoozed, wakes in ${shortDuration(Date.parse(task.snoozedUntil!) - now)}`, "Wake now", () => void actions.wake(task));
	if (isSettled(task)) return line(`Settled ${shortDuration(now - Date.parse(task.settledAt ?? task.updatedAt))} ago`.replace("Settled now ago", "Settled just now"), "Un-settle", () => void actions.unsettle(task));
	if (hasWoken(task, now)) return line("Woke from snooze", "Dismiss", () => void actions.wake(task));
	return null;
}

/** Most chats load in a few milliseconds; a notice that flashes for those is noise, so it waits a moment. */
function DelayedStatus({ children }: { children: ReactNode }) {
	const [shown, setShown] = useState(false);
	useEffect(() => { const timer = setTimeout(() => setShown(true), 400); return () => clearTimeout(timer); }, []);
	return <div role="status" aria-busy className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">{shown && children}</div>;
}

export function ChatView({ id }: { id: string }) {
	const { api, overview, command, select, setOverview } = useWorkspace();
	const snapshot = overview.tasks.find(task => task.id === id);
	// T3: Ctrl+J opens a terminal drawer under the chat, remembered per chat.
	const [drawers, setDrawers] = usePersistedState<Record<string, boolean>>("phaseo.desktop.terminalDrawers", {});
	useCommand("terminal.toggle", () => setDrawers(current => ({ ...current, [id]: !current[id] })));
	// Having the chat open marks its finished turns read, as T3's visit does. It bypasses command() so it never clears an error on screen.
	useEffect(() => {
		if (api && snapshot && (!snapshot.lastVisitedAt || (snapshot.lastCompletedAt && Date.parse(snapshot.lastCompletedAt) > Date.parse(snapshot.lastVisitedAt)))) void api.command({ type: "visit", id, at: new Date().toISOString() }).then(setOverview, () => undefined);
	}, [id, snapshot?.lastCompletedAt, snapshot?.lastVisitedAt]);
	const detail = useSelectedTask(api?.task, id, snapshot ? JSON.stringify([snapshot.revision, snapshot.updatedAt]) : undefined);
	const loaded = detail.task?.id === id ? detail.task : undefined;
	const [preview, setPreview] = useState<string>();
	useEffect(() => { setPreview(undefined); }, [id]);
	// Until a chat's details load, its header and composer render from the sidebar's copy so they stay in place.
	const task = loaded ?? (snapshot ? { ...snapshot, messages: [], queue: [] } as unknown as Task : undefined);
	if (!task || (!loaded && detail.error)) return <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
		<p role="status">{detail.error ? `Could not load this chat: ${detail.error}` : "Loading chat…"}</p>
		{detail.error && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={detail.retry}>Retry</Button><Button variant="ghost" size="sm" onClick={() => select(undefined)}>New chat</Button></div>}
	</div>;
	const branch = async (messageId: string) => { const known = new Set(overview.tasks.map(value => value.id)); const state = await command({ type: "fork", id: task.id, messageId }); const next = state?.tasks.find(value => !known.has(value.id))?.id; if (next) select(next); };
	const removed = overview.projects.find(project => project.id === task.projectId)?.worktree?.removedAt;
	return <div className="flex h-full min-w-0 flex-col">
		<ChatHeader task={task} onOpenTerminal={() => setDrawers(current => ({ ...current, [task.id]: true }))} />
		{!loaded ? <DelayedStatus>Loading chat…</DelayedStatus> : <Conversation key={task.id} task={task} onAttachment={setPreview} onBranch={messageId => void branch(messageId)}>
			{snapshot && <ThreadStatusLine task={snapshot} />}
			{task.error && <div role="alert" className={cn("flex items-center gap-2 text-[13px]", task.status === "interrupted" ? "text-muted-foreground" : "text-destructive")}>
				<span className="min-w-0">{task.error}</span>
				<Button size="sm" variant="ghost" className="text-foreground" onClick={() => void command({ type: "resume", id: task.id })}><RotateCcw />Resume</Button>
			</div>}
			<AgentThreads taskId={task.id} />
			<Requests task={task} />
			{removed && <p className="text-xs text-muted-foreground">This checkout has been removed. Switch model to continue in another project.</p>}
		</Conversation>}
		<QuestionPanel task={task} />
		<ChatComposer task={task} />
		{drawers[task.id] && <TerminalDrawer projectId={task.projectId} taskId={task.id} />}
		{preview && <AttachmentPreview taskId={task.id} id={preview} onClose={() => setPreview(undefined)} />}
	</div>;
}
