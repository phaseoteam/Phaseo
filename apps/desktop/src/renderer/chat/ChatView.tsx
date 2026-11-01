import { useEffect, useRef, useState, type ReactNode } from "react";
import { TerminalDrawer } from "../views/Terminals";
import { AlarmClockOff, Archive, Box, CircleCheck, Clock, Undo2, CornerLeftUp, Download, Ellipsis, Gauge, GitBranch, Layers, ListChecks, MessagesSquare, Paperclip, Pencil, PenLine, Pin, PinOff, Plug, RotateCcw, Settings, ShieldCheck, SquarePen, UserRound } from "lucide-react";
import { ProjectIcon } from "../components/ProjectIcon";
import { QuestionPanel } from "./QuestionPanel";
import { IssueDraftPanel } from "./IssueDraftPanel";
import { useQuestionAnswerer } from "./questionComposer";
import { shortcut, useCommand } from "../lib/keybindings";
import { CustomSnoozeDialog, SnoozeItems, useThreadActions } from "../shell/threadActions";
import { hasWoken, isSettled, isSnoozed, isUnread, settleBlocker, shortDuration } from "../../shared/threadLifecycle";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { TagEditor } from "../components/Tags";
import type { AccountStatus, Attachment, Message, Task } from "../../shared/workspace";
import { errorText, useWorkspace } from "../app/workspace";
import { useSelectedTask } from "../lib/useSelectedTask";
import { usePersistedState } from "../lib/persistedState";
import { rememberModel, type ModelSelection } from "../lib/modelPreferences";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Button } from "../components/ui/button";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { StatusDot } from "../shell/Sidebar";
import { Composer } from "./Composer";
import { ComposerNotice } from "./ComposerBanner";
import { ComposerOverflowMenu, ModeBlock, PermissionMenu, PermissionsFooterMenu, PlanIndicator, type PermissionMode } from "./ComposerControls";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";
import { StashBadge, StashDrawer } from "./ComposerStash";
import { useTypingGuard } from "./composerTypingGuard";
import { useComposerMenu } from "./ComposerMenu";
import { ComposerTaskContext, useComposerEditor } from "./composerEditor";
import { composeMessage, mentionPlainText } from "../lib/mentions";
import { UsageMeters } from "../settings/UsageMeters";
import { Conversation } from "./Conversation";
import { harnessNames } from "./ModelPicker";
import { ModelControl } from "./ModelSettings";
import { silenceLabel, silentFor } from "../../shared/inbox";
import { useNow } from "../lib/useNow";
import { openModelPickerEvent, renameChatEvent, useModelSettingActions, type ComposerAction } from "./composerActions";
import { Requests } from "./Requests";
import { AgentThreads } from "./AgentThreads";
import { ChatSpend } from "./ChatSpend";
import { AutopilotControl } from "./Autopilot";
import { useWorkspacePreferences } from "../lib/workspacePreferences";
import { optionHarnesses, selectionSettings } from "./startChat";
import { ProjectScriptsControl } from "../components/ProjectScripts";
import { PullRequestBadge } from "../views/pullRequests/PullRequestBadge";
import { IssueBadge } from "../views/issues/IssueBadge";
import { FactoryThreadChip } from "../factory/FactoryPage";
import { RewindDialog } from "./RewindDialog";
import { ContextMeter } from "./ContextMeter";
import { restoreDraft, restoreDraftEvent, rewoundDraft } from "./rewind";
import { QueuePanel, ownQueue, steerBlocker } from "./QueuePanel";
import { usePromptHistory, usePromptStash } from "./composerHistory";
import { recordPrompt } from "./promptHistory";
import { showToast } from "../components/ui/toast";
import { ChatNotices } from "./ChatNotices";
import { BackgroundWork } from "./BackgroundWork";
import { useSendKey } from "./sendKey";
import { addPendingSend, dropDeliveredSends, PendingSends } from "./pendingSends";
import { attachmentsOnlyText } from "./MessageAttachments";
import { settingsProject } from "../../shared/projectSettings";
import { isSideChat, parseSideChatCommand } from "../../shared/sideChats";
import { openSideChat } from "../panels/events";

function ChatHeader({ task, onOpenTerminal }: { task: Task; onOpenTerminal: () => void }) {
	const { overview, command, select, api, setError, openProjectSettings } = useWorkspace();
	const project = overview.projects.find(value => value.id === task.projectId);
	const snapshot = overview.tasks.find(value => value.id === task.id);
	const now = useNow();
	const silent = snapshot ? silentFor(snapshot, now) : undefined;
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
		<FactoryThreadChip taskId={task.id} />
		{project && <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11.5px] text-muted-foreground"><ProjectIcon project={project} className="size-3.5" />{project.name}{project.worktree && <span className="font-mono">⎇ {project.worktree.branch}</span>}</span>}
		<div className="ml-auto flex items-center gap-1.5">
			{project && !project.worktree?.removedAt && <ProjectScriptsControl project={project} taskId={task.id} onRun={onOpenTerminal} />}
			{snapshot && (snapshot.status !== "completed" && snapshot.status !== "idle" || snapshot.approvalsCount > 0) && <span className="flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11.5px] text-muted-foreground"><StatusDot task={snapshot} />{snapshot.approvalsCount || snapshot.answersCount ? "Needs your input" : snapshot.status === "running" ? (silent !== undefined ? `No response from ${harnessNames[snapshot.harness]} · ${silenceLabel(silent)}` : "Working") : snapshot.status === "waiting" ? "Waiting" : snapshot.status === "limited" ? "Usage limit reached" : snapshot.status === "interrupted" ? "Interrupted" : snapshot.status === "failed" ? "Failed" : ""}</span>}
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
	const { api, command, overview, select, setError, openSettings, openUsage } = useWorkspace();
	const draft = useTaskDraft(task.id);
	const [busy, setBusy] = useState(false);
	const [uploading, setUploading] = useState(false);
	// /usage shows this agent's plan limits above the composer until dismissed.
	const [limits, setLimits] = useState<AccountStatus | { error: string } | "loading">();
	useEffect(() => { setLimits(undefined); }, [task.id]);
	const limitHarness = (["codex", "claude", "cursor", "grok"] as const).find(value => value === task.harness);
	const showLimits = async () => {
		if (!api || !limitHarness) { openUsage("limits"); return; }
		setLimits("loading");
		try { setLimits(await api.accountStatus(limitHarness, task.accountId)); } catch (reason) { setLimits({ error: errorText(reason) }); }
	};
	const running = ["running", "waiting"].includes(task.status);
	const code = task.mode !== "chat";
	const preferences = useWorkspacePreferences();
	// Questions and approvals that arrive mid-sentence wait until the person pauses, so Enter never answers one unseen.
	const guard = useTypingGuard(task.id, [...(task.questions ?? []).map(request => request.id), ...(task.approvals ?? []).map(approval => approval.id)]);
	// While the agent waits on a question, the composer is its own-answer field.
	const answerer = useQuestionAnswerer(task.id);
	// A proposed plan waits: a blank send implements it, text asks for changes. Other approvals are declined by a message, which redirects the agent.
	const plan = !answerer ? task.approvals?.find(approval => approval.kind === "plan" && !guard.held.has(approval.id)) : undefined;
	const redirect = (task.approvals ?? []).filter(approval => approval.kind !== "plan" && !guard.held.has(approval.id));
	const editor = useComposerEditor({ value: draft.text, onChange: value => { draft.setText(value); guard.typed(); }, disabled: task.archived, onFiles: files => void upload(files),
		placeholder: task.archived ? "This chat is archived" : answerer ? (answerer.choiceOnly ? "Choose an option above" : "Type your own answer, or leave this blank to use the selected option") : plan ? "Add feedback to refine the plan, or leave this blank to implement it" : redirect.length ? "Send a message to decline and redirect the agent" : running ? "Queue a follow-up…" : code ? "Ask for a change, or reply to the agent…" : "Reply…" });
	useEffect(() => {
		const instance = editor.editor;
		if (!instance) return;
		instance.on("focus", guard.focus); instance.on("blur", guard.blur);
		return () => { instance.off("focus", guard.focus); instance.off("blur", guard.blur); };
	}, [editor.editor, guard.focus, guard.blur]);
	const selection: ModelSelection = { harness: task.harness, model: task.model, accountId: task.accountId, reasoningEffort: task.reasoningEffort, serviceTier: task.serviceTier, options: task.modelOptions };
	const settingActions = useModelSettingActions(task.archived || running ? undefined : selection, next => void changeSettings(next));
	const canCompact = ["opencode", "codex", "claude", "pi", "phaseo"].includes(task.harness) && !!task.nativeSessionId && !task.archived && !running;
	const fork = async () => { const known = new Set(overview.tasks.map(value => value.id)); const state = await command({ type: "fork", id: task.id }); const id = state?.tasks.find(value => !known.has(value.id))?.id; if (id) select(id); };
	const planMode = task.mode === "plan", full = task.permissionMode === "full-access", edits = task.permissionMode === "accept-edits";
	const sideChats = !isSideChat(task) && !task.archived;
	const setPermission = (permissionMode: PermissionMode) => void command({ type: "update-task", id: task.id, permissionMode });
	const setPlanMode = (on: boolean) => void command({ type: "update-task", id: task.id, mode: on ? "plan" : "code" });
	/** /side and /btw: a side chat beside this one, shown in the right pane, that leaves this chat's turn alone. */
	async function startSideChat(text: string) {
		const known = new Set(overview.tasks.map(value => value.id));
		const state = await command({ type: "side-chat", id: task.id, text });
		const id = state?.tasks.find(value => !known.has(value.id))?.id;
		if (id) openSideChat({ parentId: task.id, id });
		return Boolean(state);
	}
	const actions: ComposerAction[] = [
		{ id: "archive", label: "Archive", description: "Archive this chat", icon: <Archive />, run: () => void command({ type: "update-task", id: task.id, archived: true }) },
		...canCompact ? [{ id: "compact", label: "Compact", description: "Summarise earlier messages to free up context", icon: <Layers />, run: () => void command({ type: "send", id: task.id, text: "/compact" }) }] : [],
		...running ? [] : [{ id: "fork", label: "Fork chat", description: "Continue in a copy of this chat", icon: <GitBranch />, run: () => void fork() }],
		...sideChats ? [
			{ id: "side", label: "Side chat", hint: "/side", description: "Ask something beside this chat without interrupting it", icon: <MessagesSquare />, insert: "/side " },
			{ id: "btw", label: "Btw", hint: "/btw", description: "Same as Side chat", icon: <MessagesSquare />, insert: "/btw " },
		] : [],
		{ id: "export", label: "Export", description: "Save this chat as a file", icon: <Download />, options: (["markdown", "json"] as const).map(format => ({ id: `export:${format}`, label: format === "markdown" ? "Markdown" : "JSON", icon: null, run: () => void api?.exportTask(task.id, format).catch(reason => setError(errorText(reason))) })) },
		{ id: "attach", label: "Attach files", description: "Add files or images to this message", icon: <Paperclip />, run: () => void attach() },
		{ id: "mcp", label: "MCP", description: "Manage MCP servers", icon: <Plug />, run: () => openSettings("mcp") },
		{ id: "model", label: "Model", description: "Switch this chat's model", icon: <Box />, run: () => window.dispatchEvent(new Event(openModelPickerEvent)) },
		{ id: "new", label: "New chat", description: "Start a new chat", icon: <SquarePen />, run: () => select(undefined) },
		{ id: "pin", label: task.pinned ? "Unpin chat" : "Pin chat", description: task.pinned ? "Remove this chat from Pinned" : "Keep this chat at the top of the sidebar", icon: task.pinned ? <PinOff /> : <Pin />, run: () => void command({ type: "update-task", id: task.id, pinned: !task.pinned }) },
		...code && !running ? [
			{ id: "plan", label: "Plan mode", description: planMode ? "Turn plan mode off" : "Turn plan mode on: the agent proposes a plan before changing anything", icon: <ListChecks />, checked: planMode, run: () => setPlanMode(!planMode) },
			{ id: "permissions", label: "Permissions", hint: full ? "Full access" : edits ? "Accept edits" : "Ask first", icon: <ShieldCheck />, options: [
				{ id: "permissions:supervised", label: "Ask first", description: "Approve commands and file changes before they run", icon: null, checked: !full && !edits, run: () => setPermission("supervised") },
				{ id: "permissions:accept-edits", label: "Accept edits", description: "File changes apply without asking; commands still ask first", icon: null, checked: edits, run: () => setPermission("accept-edits") },
				{ id: "permissions:full-access", label: "Full access", description: "The agent runs commands and edits files without asking", icon: null, checked: full, run: () => setPermission("full-access") },
			] },
		] : [],
		{ id: "usage", label: "Usage", description: limitHarness ? "Show this agent's plan limits" : "Open usage and limits", icon: <Gauge />, run: () => void showLimits() },
		{ id: "rename", label: "Rename", description: "Rename this chat", icon: <PenLine />, run: () => window.dispatchEvent(new Event(renameChatEvent)) },
		{ id: "accounts", label: "Accounts", description: "Manage accounts and usage", icon: <UserRound />, run: () => openSettings("accounts") },
		...settingActions,
	];
	const menu = useComposerMenu({ editor, taskId: task.id, harness: task.harness, accountId: task.accountId, projectId: task.projectId, actions });
	useEffect(() => { editor.focus(); }, [task.id, editor.editor]);
	// Edit from here hands the rewound message back to this chat's composer.
	useEffect(() => {
		const restore = (event: Event) => { const detail = (event as CustomEvent<{ taskId: string; text: string }>).detail; if (detail?.taskId === task.id) { if (draft.text.trim() && draft.text !== detail.text) stash.park(draft.text); setEditing(undefined); draft.setText(detail.text); editor.focus("end"); } };
		window.addEventListener(restoreDraftEvent, restore);
		return () => window.removeEventListener(restoreDraftEvent, restore);
	});
	const message = composeMessage(draft.text);
	const hasContent = !!message.text || message.attachments.length > 0;
	const canSend = !busy && !uploading && !task.archived && (!!answerer || !!plan || hasContent);
	usePromptHistory(task, draft, editor);
	const stash = usePromptStash(task.id, draft);
	const stashKeys = useRef<(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "preventDefault">) => boolean>(undefined);
	// A queued message being edited in the composer, and the draft it set aside ("Editing in the composer").
	const [editing, setEditing] = useState<{ id: string; saved: string }>();
	useEffect(() => { setEditing(undefined); }, [task.id]);
	const editQueued = (id: string) => {
		const queued = task.queue.find(value => value.id === id);
		if (!queued || task.archived) return false;
		setEditing(current => ({ id, saved: current ? current.saved : draft.text })); draft.setText(queued.text); editor.focus("end");
	};
	const stopEditing = (text?: string) => { if (!editing) return; draft.setText(text ?? editing.saved); setEditing(undefined); };
	// Sent while being edited: the edit stays in the box to send on its own.
	useEffect(() => {
		if (editing && !task.queue.some(value => value.id === editing.id)) { setEditing(undefined); showToast("info", "The queued message was sent before you finished", "Your edit is still in the message box."); }
	}, [task.queue, editing]);
	async function saveEdit() {
		if (!editing) return;
		if (message.attachments.length) { setError("A queued message keeps its attachments. Remove the new ones, or send this as its own message."); return; }
		if (!message.text) { await command({ type: "queue-remove", id: task.id, messageId: editing.id }); stopEditing(); return; }
		if (await command({ type: "queue-edit", id: task.id, messageId: editing.id, text: message.text })) stopEditing();
	}
	const steerQueued = (id: string) => { const queued = task.queue.find(value => value.id === id); if (queued) void command({ type: "steer", id: task.id, text: queued.text, queuedId: id }); };
	/** Mod+Shift+Enter: the draft, or else the first queued message, goes into the running turn; with no turn running it simply sends. */
	async function steer() {
		if (!running) { await send(); return; }
		const blocker = steerBlocker(task);
		if (blocker) { showToast("info", "Queued instead", blocker); if (canSend && !editing) await send(); return; }
		if (!message.text && !message.attachments.length) { const first = ownQueue(task)[0]; if (first) steerQueued(first.id); return; }
		if (editing || answerer || busy) return;
		setBusy(true);
		try { if (await command({ type: "steer", id: task.id, text: message.text, ...(message.attachments.length ? { attachments: message.attachments } : {}) })) { recordPrompt(draft.text); draft.clear(); guard.sent(); } }
		finally { setBusy(false); }
	}
	useCommand("composer.steer", () => { void steer(); });
	// While a turn runs, Enter queues; the other send key steers instead. With Mod+Enter as the send key it just sends.
	const sendKey = useSendKey();
	useCommand("composer.sendAlternate", () => { if (!running || sendKey !== "enter") return false; void steer(); });
	useCommand("composer.editQueued", () => { const last = ownQueue(task).at(-1); return last && !editing ? editQueued(last.id) : false; });
	useCommand("composer.sendAndNewChat", () => { if (!canSend || editing || answerer || plan) return false; void send().then(sent => { if (sent) select(undefined); }); });

	/** `alternate` is a Ctrl/⌘-click on the send button while a turn runs: into the turn rather than the queue. */
	async function send(alternate = false): Promise<boolean> {
		if (alternate && running && !editing && !answerer && !plan) { await steer(); return false; }
		if (editing) { await saveEdit(); return false; }
		if (!canSend) return false;
		// /side comes before an open question, which would otherwise take the text as its answer.
		const side = sideChats ? parseSideChatCommand(message.text) : undefined;
		if (side) {
			if (message.attachments.length) { setError("Side chats take text only. Remove the attachments, then send it again."); return false; }
			setBusy(true);
			try { if (await startSideChat(mentionPlainText(side.prompt))) draft.clear(); } finally { setBusy(false); }
			return false;
		}
		if (answerer) {
			if (message.attachments.length) { setError("Answers cannot carry attachments. Remove them, or dismiss the question first."); return false; }
			if (answerer.answer(mentionPlainText(message.text))) { draft.clear(); guard.sent(); }
			return false;
		}
		if (plan) {
			if (message.attachments.length) { setError("A plan revision takes text only. Remove the attachments, or implement the plan first."); return false; }
			const feedback = mentionPlainText(message.text).trim();
			setBusy(true);
			try { if (await command({ type: "approval", id: task.id, approvalId: plan.id, decision: feedback ? "decline" : "accept", ...(feedback ? { feedback } : {}) })) { draft.clear(); guard.sent(); } }
			finally { setBusy(false); }
			return false;
		}
		setBusy(true);
		// Sending over a waiting approval declines it, so the agent reads the message instead of running what it asked for.
		for (const approval of redirect) if (!await command({ type: "approval", id: task.id, approvalId: approval.id, decision: "decline" })) { setBusy(false); return false; }
		// The message shows as sent at once; a refused send puts it back in the box, unless something new was typed there.
		const typed = draft.text, settle = addPendingSend(task.id, message.text || mentionPlainText(typed));
		draft.clear(); guard.sent();
		const restore = () => { if (!draft.text.trim()) draft.setText(typed); };
		let delivered = false;
		try {
			const prepared = await menu.prepare(message.text);
			if (await command({ type: "send", id: task.id, text: prepared.text || attachmentsOnlyText, attachments: message.attachments,
				...(message.threadReferences.length ? { threadReferences: message.threadReferences } : {}), ...(message.githubReferences.length ? { githubReferences: message.githubReferences } : {}), ...(prepared.nativeAction ? { nativeAction: prepared.nativeAction } : {}) })) {
				delivered = true; rememberModel(selection); recordPrompt(typed); return true;
			}
			restore();
		} catch (reason) { restore(); setError(errorText(reason)); } finally { settle(delivered); setBusy(false); }
		return false;
	}
	const attachmentChips = (attachments: Attachment[]) => editor.insert(attachments.map(attachment => ({ kind: "attachment" as const, ref: attachment.id, label: attachment.name })));
	async function attach() {
		if (!api || uploading) return;
		setUploading(true);
		try { const result = await api.chooseAttachments(task.id); attachmentChips(result.attachments); if (result.errors.length) setError(result.errors.join("\n")); }
		catch (reason) { setError(errorText(reason)); } finally { setUploading(false); }
	}
	/** Pasted or dropped files upload straight away and land at the caret: images, PDFs and text, as Attach files takes. */
	async function upload(files: File[]) {
		if (!api || task.archived) return;
		const errors: string[] = [];
		setUploading(true);
		try {
			for (const file of files) {
				// The main process decides by content; the browser's type is often empty for text and code files.
				if (file.size > 10 * 1024 * 1024) { errors.push(`${file.name} is larger than 10 MB.`); continue; }
				try { attachmentChips([await api.pasteFile(task.id, file.name || "Pasted file", new Uint8Array(await file.arrayBuffer()))]); }
				catch (reason) { errors.push(`${file.name || "Pasted file"}: ${errorText(reason)}`); }
			}
		} finally { setUploading(false); }
		if (errors.length) setError(errors.join("\n"));
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

	const links = overview.tasks.find(value => value.id === task.id);
	const blocker = steerBlocker(task);
	const limitsLabel = limits && limits !== "loading" && !("error" in limits) ? harnessNames[task.harness] : undefined;
	return <div className="mx-auto w-full max-w-[760px] px-6 pb-4">
		<ComposerTaskContext value={task.id}><Composer editor={editor} onSubmit={alternate => void send(alternate)} canSend={canSend || Boolean(editing)} disabled={task.archived}
			running={running} onStop={() => void command({ type: "cancel", id: task.id })} placeholder={running ? "Queue a follow-up…" : "Reply…"}
			collapsible={!task.questions?.length && !plan && !editing}
			menu={task.archived ? undefined : menu}
			keys={event => stash.open && !menu.expanded ? stashKeys.current?.(event) ?? false : false}
			attach={{ onClick: () => void attach(), disabled: uploading || task.archived }}
			banners={<>
				<QueuePanel task={task} editingId={editing?.id} onEdit={editQueued} onSteer={steerQueued} />
				{limits && <ComposerNotice icon={<Gauge />} title="Usage limits" description={limitsLabel} dismissLabel="Hide usage limits" onDismiss={() => setLimits(undefined)}>
					{limits === "loading" ? <p className="text-xs text-muted-foreground">Checking…</p> : "error" in limits ? <p className="text-xs text-destructive">{limits.error}</p> : <UsageMeters status={limits} />}
				</ComposerNotice>}
			</>}
			drawer={<>
				<QuestionPanel task={task} held={guard.held} />
				{plan && <ComposerNotice icon={<ListChecks />} title="Plan ready" description={planTitle(plan.description)} />}
				{editing && <ComposerNotice icon={<Pencil />} title="Editing a queued message" description="Enter saves it in its place." actions={<button type="button" onClick={() => stopEditing()} className="h-6 rounded-md px-1.5 text-xs font-medium text-foreground hover:bg-muted">Cancel</button>} />}
			</>}
			aside={!task.archived && <StashBadge count={stash.items.length} open={stash.open} pulse={stash.pulse} onToggle={() => stash.setOpen(!stash.open)} />}
			overlay={stash.open && !task.archived ? <StashDrawer items={stash.items} shortcut={stash.shortcut} keys={stashKeys} onRestore={id => { stash.restore(id); editor.focus("end"); }} onDelete={stash.remove} onClose={() => stash.setOpen(false)} /> : undefined}
			controls={<>
				<ModelControl selections={[selection]} onChange={values => void changeModel(values[0])} onSettings={next => void changeSettings(next)} agents={code} disabled={running || task.archived} openEvent={openModelPickerEvent} hidden={settingsProject(overview.projects, task.projectId)?.settings?.disabledHarnesses}
					footer={code && !task.archived ? <PermissionsFooterMenu value={task.permissionMode} onChange={setPermission} /> : undefined} />
				{code && <ModeBlock menu={!task.archived && <ComposerOverflowMenu plan={planMode} onPlan={running ? undefined : setPlanMode} permission={task.permissionMode} onPermission={setPermission} />}>
					<PermissionMenu always={false} value={task.permissionMode} onChange={setPermission} />
					{planMode && <PlanIndicator onClear={running ? undefined : () => setPlanMode(false)} />}
					{(preferences.autopilot || task.autopilot) && <AutopilotControl value={task.autopilot ? { capNanos: task.autopilot.capNanos } : undefined} disabled={running || task.archived || !preferences.autopilot} disabledReason={preferences.autopilot ? "Stop the chat to turn on Autopilot." : "Allow Autopilot in Settings → Experimental."} onChange={autopilot => void command({ type: "update-task", id: task.id, autopilot })} />}
				</ModeBlock>}
			</>}
			/* Only Phaseo's harness reports its window, and /compact is its own. */
			meter={<ContextMeter task={task} onCompact={canCompact && task.harness === "phaseo" ? () => void command({ type: "send", id: task.id, text: "/compact" }) : undefined} />}
			primary={<ComposerPrimaryActions running={running} hasContent={hasContent} canSend={canSend || Boolean(editing)} busy={busy} onSubmit={alternate => void send(alternate)} onStop={() => void command({ type: "cancel", id: task.id })}
				editing={Boolean(editing)} plan={Boolean(plan)} canSteer={!blocker} steerBlocker={blocker}
				question={answerer ? { step: answerer.step, count: answerer.count, ready: answerer.ready || (!answerer.choiceOnly && Boolean(message.text)), busy: answerer.busy, onPrevious: answerer.previous } : undefined} />}
			context={(task.projectId || links) && <>
				{task.projectId && <PullRequestBadge taskId={task.id} projectId={task.projectId} links={links?.pullRequests} branch className="h-6 px-1.5 hover:bg-accent/60" />}
				{task.projectId && <IssueBadge taskId={task.id} links={links?.issues} className="h-6 px-1.5 hover:bg-accent/60" />}
				<ChatSpend taskId={task.id} />
			</>} /></ComposerTaskContext>
	</div>;
}

/** A proposed plan's title: its first heading, or else its first line. */
function planTitle(markdown: string) {
	const lines = markdown.split("\n").map(line => line.trim()).filter(Boolean);
	return (lines.find(line => line.startsWith("#")) ?? lines[0] ?? "").replace(/^#+\s*/, "").slice(0, 120) || undefined;
}

/** The quiet line after the last message: settled, snoozed or woke, with the way back. */
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
	// Ctrl+J opens a terminal drawer under the chat, remembered per chat.
	const [drawers, setDrawers] = usePersistedState<Record<string, boolean>>("phaseo.desktop.terminalDrawers", {});
	useCommand("terminal.toggle", () => setDrawers(current => ({ ...current, [id]: !current[id] })));
	// Having the chat open marks its finished turns read. It bypasses command() so it never clears an error on screen.
	useEffect(() => {
		if (api && snapshot && (!snapshot.lastVisitedAt || (snapshot.lastCompletedAt && Date.parse(snapshot.lastCompletedAt) > Date.parse(snapshot.lastVisitedAt)))) void api.command({ type: "visit", id, at: new Date().toISOString() }).then(setOverview, () => undefined);
	}, [id, snapshot?.lastCompletedAt, snapshot?.lastVisitedAt]);
	// When you last looked, read as the chat opens (before the visit above moves it on), for "New since your last visit".
	const [arrival, setArrival] = useState<{ id: string; since?: string }>();
	if (snapshot && arrival?.id !== id) setArrival({ id, since: isUnread(snapshot) ? snapshot.lastVisitedAt : undefined });
	const detail = useSelectedTask(api?.task, id, snapshot ? JSON.stringify([snapshot.revision, snapshot.updatedAt]) : undefined);
	const loaded = detail.task?.id === id ? detail.task : undefined;
	useEffect(() => { if (loaded) dropDeliveredSends(loaded.id); }, [loaded]);
	const [preview, setPreview] = useState<string>();
	const [rewinding, setRewinding] = useState<Message>();
	// A rewind can remove the messages the conversation's window starts at, so the window starts over.
	const [epoch, setEpoch] = useState(0);
	useEffect(() => { setPreview(undefined); setRewinding(undefined); }, [id]);
	// Until a chat's details load, its header and composer render from the sidebar's copy so they stay in place.
	const task = loaded ?? (snapshot ? { ...snapshot, messages: [], queue: [] } as unknown as Task : undefined);
	if (!task || (!loaded && detail.error)) return <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
		<p role="status">{detail.error ? `Could not load this chat: ${detail.error}` : "Loading chat…"}</p>
		{detail.error && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={detail.retry}>Retry</Button><Button variant="ghost" size="sm" onClick={() => select(undefined)}>New chat</Button></div>}
	</div>;
	const branch = async (messageId: string) => { const known = new Set(overview.tasks.map(value => value.id)); const state = await command({ type: "fork", id: task.id, messageId }); const next = state?.tasks.find(value => !known.has(value.id))?.id; if (next) select(next); };
	const removed = overview.projects.find(project => project.id === task.projectId)?.worktree?.removedAt;
	const rewind = async (message: Message, restoreFiles: boolean) => {
		if (await command({ type: "rewind", id: task.id, messageId: message.id, ...(restoreFiles ? { restoreFiles } : {}) })) { restoreDraft(task.id, rewoundDraft(message)); setEpoch(value => value + 1); }
		setRewinding(undefined);
	};
	return <div className="flex h-full min-w-0 flex-col">
		<ChatHeader task={task} onOpenTerminal={() => setDrawers(current => ({ ...current, [task.id]: true }))} />
		{!loaded ? <DelayedStatus>Loading chat…</DelayedStatus> : <Conversation key={`${task.id}:${epoch}`} task={task} unreadSince={arrival?.id === task.id ? arrival.since : undefined} onAttachment={setPreview} onBranch={messageId => void branch(messageId)} onRewind={setRewinding}
				onRegenerate={task.mode === "chat" ? message => void command({ type: "rewind", id: task.id, messageId: message.id, resend: true }).then(state => { if (state) setEpoch(value => value + 1); }) : undefined}>
			<PendingSends taskId={task.id} projectId={task.projectId} />
			{snapshot && <ThreadStatusLine task={snapshot} />}
			<ChatNotices task={task} />
			{task.error && <div role="alert" className={cn("flex items-center gap-2 text-[13px]", task.status === "interrupted" ? "text-muted-foreground" : "text-destructive")}>
				<span className="min-w-0">{task.error}</span>
				<Button size="sm" variant="ghost" className="text-foreground" onClick={() => void command({ type: "resume", id: task.id })}><RotateCcw />Resume</Button>
			</div>}
			<AgentThreads taskId={task.id} />
			<BackgroundWork taskId={task.id} />
			<Requests task={task} />
			{removed && <p className="text-xs text-muted-foreground">This checkout has been removed. Switch model to continue in another project.</p>}
		</Conversation>}
		<IssueDraftPanel task={task} />
		<ChatComposer task={task} />
		{drawers[task.id] && <TerminalDrawer projectId={task.projectId} taskId={task.id} />}
		{preview && <AttachmentPreview taskId={task.id} id={preview} onClose={() => setPreview(undefined)} />}
		<RewindDialog task={task} message={rewinding} onClose={() => setRewinding(undefined)} onConfirm={restoreFiles => rewind(rewinding!, restoreFiles)} />
	</div>;
}
