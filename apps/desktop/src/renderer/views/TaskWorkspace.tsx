import { ChatRowPreview } from "../components/ChatRowPreview";
import { ModelLogo } from "../components/ModelLogo";
import type { McpPromptPreview } from "../../shared/mcpPrompts";
import { nativeActionText, updateNativeActionText, type NativeAction } from "../../shared/nativeActions";
import { PromptCommandPicker } from "../components/PromptCommandPicker";

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, FolderOpen, Pin, SquarePen, Plus, Search, ChevronDown, Square, X } from "lucide-react";
import type { Attachment, Harness, Task, WorkspaceCommand } from "../../shared/workspace";
import { useModels } from "../lib/useModels";
import { preferredModel, rememberModel, useModelPreferences } from "../lib/modelPreferences";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { usePersistedState } from "../lib/persistedState";
import { useTaskHistory } from "../lib/useTaskHistory";
import { useSelectedTask } from "../lib/useSelectedTask";
import { ScrollArea } from "../components/ScrollArea";
import { ThreadReferences, ThreadReferenceMenu } from "../components/ThreadReferences";
import { ConversationHistory } from "../components/ConversationHistory";
import { ApprovalRequest } from "../components/ApprovalRequest";
import { QuestionForm } from "../components/QuestionForm";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { AgentForm } from "../components/AgentForm";
import { SessionPicker } from "../components/SessionPicker";
import { ChatSessionPicker } from "../components/ChatSessionPicker";
import { PhaseoSignIn } from "../components/PhaseoSignIn";
import { ApiAccountConnect } from "../components/ApiAccountConnect";
import { Select } from "../components/Select";
import { ModelDiscoveryFeedback } from "../components/ModelDiscoveryFeedback";
import { TaskActions } from "../components/TaskActions";
const AuthTerminal = lazy(() => import("./Terminals").then(module => ({ default: module.AuthTerminal })));

export function TaskWorkspace({ onContextChange, onOverlayChange, footer, sidebarCollapsed = false }: { sidebarCollapsed?: boolean; onOverlayChange?: (open: boolean) => void; onContextChange?: (context: { id?: string; projectId?: string }) => void; footer?: ReactNode }) {
	const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview);
	const [selectedId, setSelectedId] = usePersistedState<string | undefined>("phaseo.desktop.selectedTask", undefined);
	const [promptCommandsId, setPromptCommandsId] = useState<string>();
	const [inlineCommands, setInlineCommands] = useState(false);
	const [newCommands, setNewCommands] = useState(false);
	useEffect(() => { setPromptCommandsId(undefined); }, [selectedId]);
	const [query, setQuery] = useState("");
	const [chatScope, setChatScope] = useState("all");
	const [closedGroups, setClosedGroups] = usePersistedState<Record<string, boolean>>("phaseo.desktop.chatGroups.closed", {});
	const [permissionMode, setPermissionMode] = usePersistedState<"supervised" | "full-access">("phaseo.desktop.draftPermissions", "supervised");
	const [pinnedOrder, setPinnedOrder] = usePersistedState<string[]>("phaseo.desktop.pinnedOrder", []);
	const draggedChat = useRef<string | undefined>(undefined);
	const [showArchived, setShowArchived] = useState(false);
	const [editingQueue, setEditingQueue] = useState<string>();
	const compactionPending = useRef(false);
	const composerInput = useRef<HTMLTextAreaElement>(null);
	const newComposerInput = useRef<HTMLTextAreaElement>(null);
	const [newChatDraft, setNewChatDraft] = usePersistedState("phaseo.desktop.newChatDraft", "");
	const focusComposerAfterCommands = useRef(false);
	useEffect(() => {
		if (promptCommandsId === undefined && focusComposerAfterCommands.current) {
			focusComposerAfterCommands.current = false;
			composerInput.current?.focus();
		}
	}, [promptCommandsId]);
	const [queueText, setQueueText] = useState("");
	const [referenceDrafts, setReferenceDrafts] = usePersistedState<Record<string, string[]>>("phaseo.desktop.threadReferences", {});
	const referenceIds = referenceDrafts[selectedId ?? "new"] ?? [];
	const setReferences = (ids: string[]) => setReferenceDrafts(current => ({ ...current, [selectedId ?? "new"]: ids }));
	const [drafts, setDrafts] = usePersistedState<Record<string, string>>("phaseo.desktop.messageDrafts", {});
	const [nativeDrafts, setNativeDrafts] = usePersistedState<Record<string, NativeAction>>("phaseo.desktop.nativeActionDrafts", {});
	const nativeDraft = selectedId ? nativeDrafts[selectedId] : undefined;
	const text = selectedId ? drafts[selectedId] ?? "" : "";
	const setText = (value: string) => { if (selectedId) setNativeDrafts(current => { const next = { ...current }; const action = current[selectedId]; if (action) { const updated = updateNativeActionText(action, value); if (updated) next[selectedId] = updated; else delete next[selectedId]; } return next; }); if (selectedId) setDrafts(current => { const next = { ...current }; if (value) next[selectedId] = value; else delete next[selectedId]; return next; }); };
	const [projectId, setProjectId] = useState("");
	const modelPreferences = useModelPreferences();
	const newChatSelection = modelPreferences.defaultSelection ?? modelPreferences.recentSelection;
	const mode: Task["mode"] = "code";
	const [model, setModel] = useState(newChatSelection?.model ?? "");
	const [reasoningEffort, setReasoningEffort] = useState(newChatSelection?.reasoningEffort ?? "");
	const [serviceTier, setServiceTier] = useState(newChatSelection?.serviceTier ?? "");
	const [harness, setHarness] = useState<Harness>(newChatSelection?.harness ?? "codex");
	const [accountId, setAccountId] = useState(newChatSelection?.accountId ?? "");
	const [connectingApi, setConnectingApi] = useState(false);
	const phaseoAccounts = workspace.accounts.filter(account => account.harness === "phaseo" && account.configured && !account.archived && (!account.oauthExpiresAt || Date.parse(account.oauthExpiresAt) > Date.now()));
	const [agentId, setAgentId] = useState("");
	const [handoffId, setHandoffId] = useState<string>();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const setupPending = useRef(false);
	const [, setSetupAction] = useState<"create" | "import">();
	const [uploading, setUploading] = useState(false);
	const [pastedDraftImages, setPastedDraftImages] = useState<File[]>([]);
	const [attachmentPreview, setAttachmentPreview] = useState<{ taskId: string; id: string }>();
	const [attachmentDrafts, setAttachmentDrafts] = usePersistedState<Record<string, Attachment[]>>("phaseo.desktop.attachmentDrafts", {});
	const pendingAttachments = selectedId ? attachmentDrafts[selectedId] ?? [] : [];
	const api = window.phaseoDesktop?.workspace;
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.overview().then(state => { if (active) setWorkspace(state); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onOverviewChange(setWorkspace);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	const { models, loading: modelsLoading, error: modelError } = useModels(harness, accountId || undefined, projectId || undefined, undefined, !selectedId);
	useEffect(() => {
		if (selectedId || handoffId || !newChatSelection) return;
		setHarness(newChatSelection.harness); setAccountId(newChatSelection.accountId ?? ""); setModel(newChatSelection.model); setReasoningEffort(newChatSelection.reasoningEffort ?? ""); setServiceTier(newChatSelection.serviceTier ?? "");
	}, [selectedId, handoffId, newChatSelection]);
	useEffect(() => {
		if (selectedId || model || modelsLoading) return;
		const remembered = preferredModel(modelPreferences, harness, accountId || undefined, models);
		if (!remembered) return;
		const option = models.find(value => value.id === remembered.model)!;
		setModel(remembered.model);
		setReasoningEffort(option.reasoningEfforts?.some(value => value.id === remembered.reasoningEffort) ? remembered.reasoningEffort! : option.defaultReasoningEffort ?? "");
		setServiceTier(option.serviceTiers?.some(value => value.id === remembered.serviceTier) ? remembered.serviceTier! : option.defaultServiceTier ?? "");
	}, [selectedId, model, modelsLoading, modelPreferences, harness, accountId, models]);
	useEffect(() => {
		if (harness !== "phaseo" || accountId) return;
		const eligible = workspace.accounts.filter(value => value.harness === "phaseo" && value.configured && !value.archived && (!value.oauthExpiresAt || Date.parse(value.oauthExpiresAt) > Date.now()));
		const remembered = [modelPreferences.defaultSelection, ...modelPreferences.recent].find(value => value?.harness === "phaseo" && eligible.some(account => account.id === value.accountId));
		const account = eligible.find(value => value.id === remembered?.accountId) ?? eligible[0];
		if (account) setAccountId(account.id);
	}, [harness, accountId, workspace.accounts, modelPreferences]);
	const setupModelAvailable = !modelsLoading && models.some(value => value.id === model);
	const selectedSnapshot = workspace.tasks.find(task => task.id === selectedId);
	const selectedDetail = useSelectedTask(api?.task, selectedId, selectedSnapshot ? JSON.stringify([selectedSnapshot.revision, selectedSnapshot.updatedAt]) : undefined);
	const selected = selectedDetail.task;
	useLayoutEffect(() => { const input = composerInput.current; if (input) { input.style.height = "0px"; input.style.height = `${Math.min(208, Math.max(72, input.scrollHeight))}px`; } }, [text, selected?.id]);
	useLayoutEffect(() => { const input = newComposerInput.current; if (input) { input.style.height = "0px"; input.style.height = `${Math.min(208, Math.max(88, input.scrollHeight))}px`; } }, [newChatDraft, selectedId]);
	useEffect(() => { onOverlayChange?.(!!selected && promptCommandsId === selected.id); return () => onOverlayChange?.(false); }, [selected?.id, promptCommandsId, onOverlayChange]);
	useEffect(() => { onContextChange?.({ id: selectedId, projectId: selected?.projectId ?? selectedSnapshot?.projectId ?? (!selectedId ? projectId || undefined : undefined) }); }, [selectedId, selected?.projectId, selectedSnapshot?.projectId, projectId, onContextChange]);
	const historyRevision = JSON.stringify(workspace.tasks.map(task => [task.id, task.title, task.pinned, task.archived, task.status, task.status === "running" || task.status === "waiting" ? undefined : task.updatedAt]));
	const history = useTaskHistory(api?.taskHistory, query, showArchived, historyRevision, chatScope === "all" ? undefined : chatScope === "personal" ? null : chatScope);
	const tasks = history.tasks;
	const pinnedTasks = tasks.filter(task => task.pinned).sort((a, b) => { const ai = pinnedOrder.indexOf(a.id), bi = pinnedOrder.indexOf(b.id); return (ai < 0 ? 100000 : ai) - (bi < 0 ? 100000 : bi); });
	const unpinnedTasks = tasks.filter(task => !task.pinned);
	async function command(value: WorkspaceCommand) {
		if (!api) { setError("Open the desktop application to use your local workspace."); return; }
		setError("");
		try { const state = await api.command(value); setWorkspace(state); return state; }
		catch (reason) {
			const message = (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
			if (["approval", "answer", "form-answer"].includes(value.type)) throw new Error(message, { cause: reason });
			setError(message);
		}
	}
	function referenceChat(id: string) {
		if (id === selectedId || !workspace.tasks.some(task => task.id === id) || referenceIds.length >= 10) return;
		setReferences([...new Set([...referenceIds, id])]);
		if (selectedId) setText(text.replace(/(?:^|\s)@[^@\n]*$/, " ")); else setNewChatDraft(newChatDraft.replace(/(?:^|\s)@[^@\n]*$/, " "));
		(selectedId ? composerInput : newComposerInput).current?.focus();
	}
	async function compact() {
		if (compactionPending.current || busy || !selected || !["opencode", "codex", "claude", "pi"].includes(selected.harness) || !selected.nativeSessionId || selected.archived || selected.status === "running" || selected.status === "waiting") return;
		compactionPending.current = true; setBusy(true);
		try { await command({ type: "send", id: selected.id, text: "/compact" }); }
		finally { compactionPending.current = false; setBusy(false); }
	}
	async function create(firstMessage?: string) {
		const initialDraft = firstMessage ?? newChatDraft;
		if (setupPending.current || busy || !setupModelAvailable) return;
		setupPending.current = true; setSetupAction("create"); setBusy(true);
		try {
			const state = await command({ ...(handoffId ? { type: "handoff" as const, id: handoffId } : { type: "create-task" as const }), harness, model, mode, permissionMode, ...(projectId ? { projectId } : {}), ...(accountId ? { accountId } : {}), ...(agentId ? { agentId } : {}), ...(["codex", "grok"].includes(harness) && reasoningEffort ? { reasoningEffort } : {}), ...(harness === "codex" && serviceTier ? { serviceTier } : {}) });
			if (state) {
				const id = state.tasks.find(task => !workspace.tasks.some(existing => existing.id === task.id))?.id;
				if (!id) { setError("The new chat could not be found. Reload before trying again."); return; }
				if (referenceIds.length) setReferenceDrafts(current => ({ ...current, [id]: referenceIds, new: [] }));
				if (initialDraft) { setDrafts(current => ({ ...current, [id]: initialDraft })); setNewChatDraft(""); }
				const images: Attachment[] = [];
				try { for (const file of pastedDraftImages) { const image = await api!.pasteImage(id, file.name, new Uint8Array(await file.arrayBuffer())); images.push(image); setAttachmentDrafts(current => ({ ...current, [id]: [...current[id] ?? [], image] })); } setPastedDraftImages([]); }
				catch (reason) { setSelectedId(id); setError(String(reason)); return; }
				setSelectedId(id); setHandoffId(undefined);
				rememberModel({ harness, accountId: accountId || undefined, model, reasoningEffort, serviceTier });
				if (firstMessage && await command({ type: "send", id, text: firstMessage, attachments: images.map(image => image.id), threadReferences: referenceIds })) { setAttachmentDrafts(current => { const next = { ...current }; delete next[id]; return next; }); setDrafts(current => { const next = { ...current }; if (next[id] === firstMessage) delete next[id]; return next; }); }
			}
		} finally { setupPending.current = false; setSetupAction(undefined); setBusy(false); }
	}
	async function importConversation() {
		if (!api || setupPending.current || busy) return;
		setupPending.current = true; setSetupAction("import"); setBusy(true); setError("");
		try {
			const result = await api.importTask({ type: "create-task", harness, model, mode, permissionMode, ...(projectId ? { projectId } : {}), ...(accountId ? { accountId } : {}), ...(agentId ? { agentId } : {}), ...(["codex", "grok"].includes(harness) && reasoningEffort ? { reasoningEffort } : {}) });
			if (result) { setWorkspace(result.workspace); setSelectedId(result.taskId); setHandoffId(undefined); }
		} catch (reason) { setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); } finally { setupPending.current = false; setSetupAction(undefined); setBusy(false); }
	}
	async function send(delivery: "send" | "steer" = "send") {
		if (!selected || (delivery === "steer" && nativeDraft) || (!text.trim() && !pendingAttachments.length) || busy || uploading) return;
		if (delivery === "steer" && referenceIds.length) { setError("Send chat references as a queued message."); return; }
		setBusy(true);
		try { if (selected.mode !== "code" && !["running", "waiting"].includes(selected.status) && !await command({ type: "update-task", id: selected.id, mode: "code" })) return; if (await command({ type: delivery, id: selected.id, text: nativeDraft ? nativeActionText(nativeDraft) : text.trim() ? text : "Please review the attached files.", ...(delivery === "send" && nativeDraft ? { nativeAction: nativeDraft } : {}), attachments: pendingAttachments.map(attachment => attachment.id), ...(delivery === "send" ? { threadReferences: referenceIds } : {}) })) { rememberModel({ harness: selected.harness, accountId: selected.accountId, model: selected.model, reasoningEffort: selected.reasoningEffort, serviceTier: selected.serviceTier }); setText(""); setReferences([]); setAttachmentDrafts(current => { const next = { ...current }; delete next[selected.id]; return next; }); } }
		finally { setBusy(false); }
	}
	function insertCommand(value: string, action?: NativeAction, prompt?: McpPromptPreview) {
		if (!selected) throw new Error("Choose a chat before inserting a prompt.");
		const draft = inlineCommands && /^\/[^\s]*$/.test(text) ? "" : text;
		if (prompt) {
			const next = draft ? `${draft}\n\n${value}` : value;
			if (next.length > 100000) throw new Error("The draft exceeds the message limit.");
			if (pendingAttachments.length + (prompt.imageCount ?? 0) > 10) throw new Error("Only 10 files can be attached to one message.");
			if (!api || uploading) throw new Error("Wait for attachments to finish loading.");
			return api.mcpPromptAttachments(selected.id, prompt.messages).then(result => {
				if (result.text !== value) throw new Error("The prompt changed before insertion. Reload it.");
				setText(next);
				setAttachmentDrafts(current => ({ ...current, [selected.id]: [...current[selected.id] ?? [], ...result.attachments] }));
				focusComposerAfterCommands.current = true;
			});
		}
		const nextAction = action ? { ...action, arguments: [action.arguments, draft].filter(Boolean).join("\n\n") } : undefined;
		const next = nextAction ? nativeActionText(nextAction) : draft ? `${draft}\n\n${value}` : value;
		if (next.length > 100000) throw new Error("The draft exceeds the message limit.");
		setText(next);
		if (nextAction) setNativeDrafts(current => ({ ...current, [selected.id]: nextAction }));
		focusComposerAfterCommands.current = true;
	}
	function pasteImages(event: React.ClipboardEvent<HTMLTextAreaElement>) {
		const files = Array.from(event.clipboardData.items).filter(item => item.kind === "file" && item.type.startsWith("image/")).map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
		if (!files.length) return;
		event.preventDefault();
		if (busy || uploading || selected?.archived) return;
		if (files.some(file => file.size > 10 * 1024 * 1024) || files.length + (selected ? pendingAttachments.length : pastedDraftImages.length) > 10) { setError("Attach up to 10 images, each under 10 MB."); return; }
		if (!selected) { setPastedDraftImages(current => [...current, ...files]); return; }
		const id = selected.id;
		setUploading(true); setError("");
		void (async () => { for (const file of files) { const attachment = await api!.pasteImage(id, file.name, new Uint8Array(await file.arrayBuffer())); setAttachmentDrafts(current => ({ ...current, [id]: [...current[id] ?? [], attachment] })); } })().catch(reason => setError(String(reason))).finally(() => setUploading(false));
	}
	useEffect(() => {
		const typing = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || busy || selected?.archived || selected?.delegation) return;
			const target = event.target instanceof HTMLElement ? event.target : undefined;
			if (target?.closest('input, textarea, select, [contenteditable], [role="textbox"], [role="dialog"], [role="menu"], [role="listbox"], .xterm, .chat-tools') || document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
			const input = (selectedId ? composerInput : newComposerInput).current;
			if (!input || input.disabled || input.closest('[inert]')) return;
			event.preventDefault(); input.focus();
			const next = input.value + event.key;
			if (selectedId) setText(next); else setNewChatDraft(next);
			requestAnimationFrame(() => input.setSelectionRange(next.length, next.length));
		};
		window.addEventListener("keydown", typing); return () => window.removeEventListener("keydown", typing);
	}, [busy, selectedId, selected?.archived, selected?.delegation]);
	async function attach() {
		if (!api || !selected || uploading) return;
		setUploading(true); setError("");
		try {
			const result = await api.chooseAttachments(selected.id);
			setAttachmentDrafts(current => ({ ...current, [selected.id]: [...current[selected.id] ?? [], ...result.attachments].slice(0, 10) }));
			if (result.errors.length || pendingAttachments.length + result.attachments.length > 10) setError([...result.errors, ...(pendingAttachments.length + result.attachments.length > 10 ? ["Only 10 files can be attached to one message."] : [])].join("\n"));
		} catch (reason) { setError(String(reason)); } finally { setUploading(false); }
	}
	return <div className={`task-workspace${sidebarCollapsed ? " chat-sidebar-hidden" : ""}`}>
		<aside className="task-list" aria-label="Chats" aria-busy={history.loading}>
			<div className="chat-sidebar-controls"><label className="task-search"><Search size={14} /><input aria-label="Search chats" placeholder="Search" maxLength={512} value={query} onChange={event => setQuery(event.target.value)} /></label><div className="chat-scope-picker"><Select label="Chat project scope" value={chatScope} onValueChange={setChatScope} options={[{ value: "all", label: "All chats", icon: <FolderOpen size={16} /> }, { value: "personal", label: "Personal", icon: <FolderOpen size={16} /> }, ...workspace.projects.map(project => ({ value: project.id, label: project.name, icon: <FolderOpen size={16} /> }))]} /></div><button type="button" aria-label="New chat" title="New chat" onClick={() => { setSelectedId(undefined); setHandoffId(undefined); }}><SquarePen size={16} /></button></div>
			<button type="button" className="task-archive-filter" onClick={() => { setShowArchived(value => !value); }}>{showArchived ? "Active chats" : "Archived chats"}</button>
			<ScrollArea className="chat-history-scroll" viewportClassName="task-history-list"><div className="chat-group pinned-chat-group" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const id = draggedChat.current; if (id) void command({ type: "update-task", id, pinned: true }); draggedChat.current = undefined; }}><h2><button type="button" aria-expanded={!closedGroups.pinned} onClick={() => setClosedGroups(current => ({ ...current, pinned: !current.pinned }))}><ChevronDown size={12} className={closedGroups.pinned ? "group-closed" : undefined} /><Pin size={14} /><span>Pinned</span></button></h2>{!closedGroups.pinned && pinnedTasks.map(task => <ChatRowPreview key={task.id} task={{ ...task, model: workspace.tasks.find(value => value.id === task.id)?.model ?? task.model }} project={task.projectId ? workspace.projects.find(value => value.id === task.projectId)?.name ?? "Unavailable project" : "Personal"}><button type="button" className={`task-row ${task.id === selectedId ? "selected" : ""}`} key={task.id} draggable onDragStart={event => { draggedChat.current = task.id; event.dataTransfer?.setData("application/x-phaseo-chat", task.id); }} onDragEnd={() => { draggedChat.current = undefined; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); event.stopPropagation(); const id = draggedChat.current; if (!id || id === task.id) return; const order = pinnedTasks.map(value => value.id).filter(value => value !== id); order.splice(order.indexOf(task.id), 0, id); setPinnedOrder(order); void command({ type: "update-task", id, pinned: true }); draggedChat.current = undefined; }} aria-pressed={task.id === selectedId} onClick={() => setSelectedId(task.id)}><ModelLogo model={{ id: workspace.tasks.find(value => value.id === task.id)?.model ?? task.model ?? "", name: task.model ?? "" }} /><span>{task.title}</span></button></ChatRowPreview>)}</div>{[undefined, ...workspace.projects.filter(project => tasks.some(task => task.projectId === project.id)).map(project => project.id), ...Array.from(new Set(tasks.map(task => task.projectId).filter(id => id && !workspace.projects.some(project => project.id === id))))].filter(group => unpinnedTasks.some(task => task.projectId === group)).map(group => { const key = group ?? "personal"; return <div className="chat-group" key={key}><h2><button type="button" aria-expanded={!closedGroups[key]} onClick={() => setClosedGroups(current => ({ ...current, [key]: !current[key] }))}><ChevronDown size={12} className={closedGroups[key] ? "group-closed" : undefined} />{group ? <FolderOpen size={14} /> : null}<span>{group ? workspace.projects.find(project => project.id === group)?.name ?? "Unavailable project" : "Personal"}</span></button></h2>{!closedGroups[key] && unpinnedTasks.filter(task => task.projectId === group).map(task => <ChatRowPreview key={task.id} task={{ ...task, model: workspace.tasks.find(value => value.id === task.id)?.model ?? task.model }} project={task.projectId ? workspace.projects.find(value => value.id === task.projectId)?.name ?? "Unavailable project" : "Personal"}><button type="button" aria-label={task.title + " · " + task.harness + " · " + task.status} aria-pressed={task.id === selectedId} className={`task-row ${task.id === selectedId ? "selected" : ""}`} key={task.id} draggable onDragStart={event => { draggedChat.current = task.id; event.dataTransfer?.setData("application/x-phaseo-chat", task.id); }} onDragEnd={() => { draggedChat.current = undefined; }} onClick={() => setSelectedId(task.id)}><ModelLogo model={{ id: workspace.tasks.find(value => value.id === task.id)?.model ?? task.model ?? "", name: task.model ?? "" }} /><span>{task.title}</span>{task.status === "running" || task.status === "waiting" || task.status === "failed" ? <i className={`chat-status chat-status-${task.status}`} aria-label={task.status} /> : <time dateTime={task.updatedAt} title={new Date(task.updatedAt).toLocaleString()}>{new Date(task.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>}</button></ChatRowPreview>)}</div>; })}
			{history.loading && <p className="task-muted" role="status">Loading chats…</p>}
			{history.error && <div className="task-muted" role="alert"><p>{history.error}</p><button type="button" onClick={history.retry}>Retry</button></div>}
			{!history.loading && !history.error && !tasks.length && <p className="task-muted">{query ? "No matching chats." : showArchived ? "No archived chats." : "Your chats will appear here."}</p>}
			{history.hasMore && <button type="button" disabled={history.loading} onClick={history.loadMore}>Load more chats</button>}</ScrollArea>
			{footer && <div className="chat-sidebar-footer">{footer}</div>}
		</aside>
		<section className="task-detail" aria-label="Task workspace">
			{error && <div className="task-error" role="alert">{error}</div>}
			{selectedDetail.error && <div className="task-error" role="alert">{selectedDetail.error} <button type="button" onClick={selectedDetail.retry}>Retry</button></div>}
			{selectedId && !selected ? <div className="task-start"><p role="status">{selectedDetail.error ? "Could not load this chat." : "Loading chat…"}</p><button type="button" onClick={() => { setSelectedId(undefined); setHandoffId(undefined); }}>New chat</button></div> : !selected ? <><header className="task-toolbar new-chat-title"><div><FolderOpen size={15} /><Select label="Chat project" value={projectId} onValueChange={value => { if (value === "__open_folder") { if (api) void api.chooseProject().then(state => { setWorkspace(state); const added = state.projects.find(project => !workspace.projects.some(existing => existing.id === project.id)); if (added) setProjectId(added.id); }, reason => setError(String(reason))); } else setProjectId(value); }} disabled={busy} options={[{ value: "", label: "Personal chat" }, ...workspace.projects.filter(project => !project.worktree?.removedAt).map(project => ({ value: project.id, label: project.name })), { value: "__open_folder", label: "Add project…" }]} /></div></header><div className="task-start new-chat-landing">
				<h1>{handoffId ? "Continue your conversation" : "What would you like to do?"}</h1>
				<div className="chat-composer-dock new-chat-dock"><form className="task-composer new-chat-composer" onDragOver={event => { if (event.dataTransfer.types.includes("application/x-phaseo-chat")) event.preventDefault(); }} onDrop={event => { const id = event.dataTransfer.getData("application/x-phaseo-chat"); if (id) { event.preventDefault(); referenceChat(id); } }} aria-label="New chat composer" onSubmit={event => { event.preventDefault(); if (newChatDraft.trim() || pastedDraftImages.length) void create(newChatDraft || "Please review the attached images."); }}>
					<textarea onPaste={pasteImages} ref={newComposerInput} aria-label="New chat message" disabled={busy} placeholder="Ask anything, or describe what you want to build…" maxLength={100000} value={newChatDraft} onChange={event => { setNewChatDraft(event.target.value); setNewCommands(/^\/[^\s]*$/.test(event.target.value)); }} aria-keyshortcuts="Enter" onKeyDown={event => { if (!event.defaultPrevented && !event.nativeEvent.isComposing && !event.repeat && !event.shiftKey && !event.altKey && event.key === "Enter") { event.preventDefault(); if (newChatDraft.trim() || pastedDraftImages.length) void create(newChatDraft || "Please review the attached images."); } }} />
					{pastedDraftImages.length > 0 && <div className="attachment-drafts">{pastedDraftImages.map((file, index) => <button key={index} type="button" className="attachment-chip" onClick={() => setPastedDraftImages(current => current.filter((_, position) => position !== index))}>{file.name} <X size={12} /></button>)}</div>}<div className="composer-actions new-chat-actions"><button type="button" aria-label="Add to chat" title="Add to chat" aria-expanded={newCommands} disabled={busy} onClick={() => setNewCommands(value => !value)}><Plus size={16} /></button><Select label="Permissions" value={permissionMode} onValueChange={value => setPermissionMode(value as "supervised" | "full-access")} options={[{ value: "supervised", label: "Supervised" }, { value: "full-access", label: "Full access" }]} /><SessionPicker harness={harness} model={model} models={models} loading={modelsLoading} disabled={busy} reasoningEffort={reasoningEffort} serviceTier={serviceTier} onHarnessChange={value => { setHarness(value); setAccountId(""); setAgentId(""); setModel(""); setReasoningEffort(""); setServiceTier(""); }} onModelChange={value => { const selectedModel = models.find(item => item.id === value); setModel(value); setReasoningEffort(selectedModel?.defaultReasoningEffort ?? ""); setServiceTier(selectedModel?.defaultServiceTier ?? ""); }} onReasoningChange={setReasoningEffort} onSpeedChange={setServiceTier} connection={harness === "phaseo" ? <>{!phaseoAccounts.length && <PhaseoSignIn disabled={busy} onConnected={(state, id) => { setWorkspace(state); setAccountId(id); setModel(""); setConnectingApi(false); }} />}{phaseoAccounts.length > 1 && <Select label="Phaseo account" value={accountId} onValueChange={value => { setAccountId(value); setModel(""); setReasoningEffort(""); setServiceTier(""); }} disabled={busy} options={phaseoAccounts.map(account => ({ value: account.id, label: account.name }))} />}</> : harness === "acp" ? <Select label="Agent" value={agentId} onValueChange={setAgentId} disabled={busy} options={[{ value: "", label: "Choose a connected agent" }, ...workspace.agents.filter(agent => !agent.archived).map(agent => ({ value: agent.id, label: agent.name }))]} /> : harness !== "pi" ? <Select label="Account" value={accountId} onValueChange={value => { setAccountId(value); setModel(""); setReasoningEffort(""); setServiceTier(""); }} disabled={busy} options={[{ value: "", label: ["phaseo", "cursor"].includes(harness) ? "Choose an account" : "Existing local login" }, ...workspace.accounts.filter(account => account.harness === harness && !account.archived).map(account => ({ value: account.id, label: account.name, disabled: !account.configured }))]} /> : undefined} feedback={<ModelDiscoveryFeedback loading={modelsLoading} error={modelError} />} /><button className="task-primary" type="submit" aria-label="Send first message" title="Send (Enter)" disabled={busy || !newChatDraft.trim() || !setupModelAvailable || (harness === "phaseo" && (!accountId || model === "default")) || (harness === "cursor" && !accountId) || (harness === "acp" && !agentId)}><ArrowUp size={18} /><span className="composer-control-label">Send</span></button></div>
					<ThreadReferences ids={referenceIds} tasks={workspace.tasks} onRemove={id => setReferences(referenceIds.filter(value => value !== id))} />{/(?:^|\s)@[^@\n]*$/.test(newChatDraft) && <ThreadReferenceMenu input={newComposerInput} tasks={workspace.tasks} query={newChatDraft.match(/@([^@\n]*)$/)?.[1] ?? ""} onChoose={referenceChat} />}
				</form>{newCommands && <PromptCommandPicker inline composerDriven composerQuery={/^\/[^\s]*$/.test(newChatDraft) ? newChatDraft.slice(1) : ""} projectId={projectId || undefined} taskId="" onImport={!handoffId && setupModelAvailable ? () => void importConversation() : undefined} onCreate={setupModelAvailable ? () => void create() : undefined} onClose={() => setNewCommands(false)} onInsert={value => { setNewChatDraft(value); setNewCommands(false); newComposerInput.current?.focus(); }} />}</div>
				{harness === "phaseo" && !phaseoAccounts.length && <details className="new-chat-more" open><summary>Connect Phaseo</summary>
				{harness === "phaseo" && <section aria-label="Phaseo account connection">
					<PhaseoSignIn disabled={busy} onConnected={(state, id) => { setWorkspace(state); setAccountId(id); setModel(""); setConnectingApi(false); }} />
					{!accountId && <p className="task-muted">Sign in to load your available models.</p>}
					{accountId && <button type="button" disabled={busy} onClick={() => setConnectingApi(value => !value)}>{connectingApi ? "Cancel connection" : "Connect another account"}</button>}
					{(!accountId || connectingApi) && <details className="manual-api-connection"><summary>Use an API key</summary><ApiAccountConnect disabled={busy} connect={async value => { const state = await command({ type: "add-account", harness: "phaseo", kind: "api", ...value }); if (!state) return false; const added = state.accounts.find(account => !workspace.accounts.some(existing => existing.id === account.id)); if (added) { setAccountId(added.id); setModel(""); setConnectingApi(false); } return true; }} /></details>}
				</section>}
				</details>}
			</div></> : <>
				<header className="task-toolbar"><div className="chat-title-context"><span className="chat-title-project"><FolderOpen size={14} />{workspace.projects.find(project => project.id === selected.projectId)?.name ?? "Personal chat"}</span><input className="task-title" aria-label="Task title" key={selected.id + selected.title} defaultValue={selected.title} maxLength={200} onBlur={event => { const title = event.target.value.trim(); if (title && title !== selected.title) void command({ type: "update-task", id: selected.id, title }); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div>
					<TaskActions key={selected.id} task={selected} busy={busy}
						onCompact={() => void compact()}
						onArchive={() => { void command({ type: "update-task", id: selected.id, archived: !selected.archived }); }}
						onPin={() => void command({ type: "update-task", id: selected.id, pinned: !selected.pinned })}
						onFork={() => { void command({ type: "fork", id: selected.id }).then(state => { if (state) setSelectedId(state.tasks.find(task => !workspace.tasks.some(existing => existing.id === task.id))?.id); }); }}
						onHandoff={() => { setHandoffId(selected.id); setProjectId(workspace.projects.some(project => project.id === selected.projectId && !project.worktree?.removedAt) ? selected.projectId! : ""); setHarness(selected.harness); setAccountId(""); setAgentId(""); setModel(""); setReasoningEffort(""); setSelectedId(undefined); }}
						onExport={format => { if (!api) return; setBusy(true); setError(""); void api.exportTask(selected.id, format).catch(reason => setError(String(reason))).finally(() => setBusy(false)); }} />
				</header>
				<ConversationHistory onBranch={messageId => { void command({ type: "fork", id: selected.id, messageId }).then(state => { if (state) setSelectedId(state.tasks.find(task => !workspace.tasks.some(existing => existing.id === task.id))?.id); }); }} key={`history:${selected.id}`} task={selected} onAttachment={id => setAttachmentPreview({ taskId: selected.id, id })}>
					{selected.error && <div className="task-error" role="alert">{selected.error}<button type="button" onClick={() => void command({ type: "resume", id: selected.id })}>Resume</button></div>}
					{selected.approvals?.map(approval => <ApprovalRequest key={approval.id} description={approval.description} onDecision={async decision => Boolean(await command({ type: "approval", id: selected.id, approvalId: approval.id, decision }))} />)}
					{selected.questions?.map(request => <QuestionForm key={request.id} questions={request.questions} onAnswer={async answers => Boolean(await command({ type: "answer", id: selected.id, requestId: request.id, answers }))} />)}
					{selected.forms?.map(request => <AgentForm key={request.id} form={request.form} onAnswer={async answer => Boolean(await command({ type: "form-answer", id: selected.id, requestId: request.id, answer }))} />)}
				{selected.authTerminalId && <Suspense fallback={<p>Opening native sign-in…</p>}><AuthTerminal id={selected.authTerminalId} /></Suspense>}
					{workspace.projects.find(project => project.id === selected.projectId)?.worktree?.removedAt && <p className="task-muted">This checkout has been removed. Use Handoff to continue in another project.</p>}
				</ConversationHistory>
				{selected.steering?.map(message => <div className="task-approval" key={message.id}><strong>{message.status === "sending" ? "Sending steering instruction…" : message.status === "rejected" ? "Instruction not sent" : "Delivery unconfirmed"}</strong><p>{message.text}</p>{message.attachments?.map(attachment => <button type="button" key={attachment.id} onClick={() => setAttachmentPreview({ taskId: selected.id, id: attachment.id })}>{attachment.name}</button>)}{message.error && <p>{message.error}</p>}{message.status === "unconfirmed" && <p>Queueing this instruction may send it twice.</p>}<button type="button" disabled={message.status === "sending" || selected.archived} onClick={() => void command({ type: "steer-queue", id: selected.id, messageId: message.id })}>Queue instead</button><button type="button" disabled={message.status === "sending"} onClick={() => void command({ type: "steer-discard", id: selected.id, messageId: message.id })}>Discard</button></div>)}
				{selected.queue.length > 0 && <details open className="task-queue" key={selected.id} aria-label="Queued messages"><summary>Queued messages ({selected.queue.length})</summary><div className="task-queue-items">{selected.queue.map(message => <div key={message.id}>{editingQueue === message.id ? <><textarea aria-label="Queued message" value={queueText} onChange={event => setQueueText(event.target.value)} /><button type="button" disabled={!queueText.trim()} onClick={() => { void command({ type: "queue-edit", id: selected.id, messageId: message.id, text: queueText }).then(state => { if (state) setEditingQueue(undefined); }); }}>Save</button><button type="button" onClick={() => setEditingQueue(undefined)}>Cancel</button></> : <><span>{message.text}</span><button type="button" onClick={() => { setEditingQueue(message.id); setQueueText(message.text); }}>Edit</button></>}<button type="button" aria-label="Move message up" onClick={() => void command({ type: "queue-move", id: selected.id, messageId: message.id, direction: "up" })}><ArrowUp size={14} /></button><button type="button" aria-label="Move message down" onClick={() => void command({ type: "queue-move", id: selected.id, messageId: message.id, direction: "down" })}><ArrowDown size={14} /></button><button type="button" onClick={() => void command({ type: "queue-remove", id: selected.id, messageId: message.id })}>Remove</button></div>)}</div></details>}
				{selected.delegation ? <div className="chat-composer-dock child-chat-controls"><span>Agent chat</span><button type="button" onClick={() => setSelectedId(selected.delegation!.parentTaskId)}>Return to parent chat</button>{["running", "waiting"].includes(selected.status) && <button type="button" onClick={() => void command({ type: "cancel", id: selected.id })}><Square size={14} />Stop agent</button>}</div> : <div className="chat-composer-dock"><form className="task-composer" onDragOver={event => { if (event.dataTransfer.types.includes("application/x-phaseo-chat")) event.preventDefault(); }} onDrop={event => { const id = event.dataTransfer.getData("application/x-phaseo-chat"); if (id) { event.preventDefault(); referenceChat(id); } }} onSubmit={event => { event.preventDefault(); void send(); }}><textarea onPaste={pasteImages} ref={composerInput} aria-label="Message" role="combobox" aria-autocomplete="list" aria-haspopup="dialog" aria-expanded={inlineCommands && promptCommandsId === selected.id} aria-controls={inlineCommands && promptCommandsId === selected.id ? "chat-command-results" : undefined} aria-keyshortcuts="Enter" maxLength={100000} rows={1} placeholder="Message, or / for commands…" value={text} onChange={event => { const value = event.target.value; setText(value); if (/^\/[^\s]*$/.test(value)) { setInlineCommands(true); setPromptCommandsId(selected.id); } else if (inlineCommands) setPromptCommandsId(undefined); }} onKeyDown={event => { if (!event.defaultPrevented && !event.nativeEvent.isComposing && !event.repeat && !event.shiftKey && !event.altKey && event.key === "Enter") { event.preventDefault(); void send(); } }} />
					<ThreadReferences ids={referenceIds} tasks={workspace.tasks} onRemove={id => setReferences(referenceIds.filter(value => value !== id))} />{/(?:^|\s)@[^@\n]*$/.test(text) && <ThreadReferenceMenu input={composerInput} tasks={workspace.tasks.filter(task => task.id !== selected.id)} query={text.match(/@([^@\n]*)$/)?.[1] ?? ""} onChoose={referenceChat} />}
					{nativeDraft && <div className="attachment-drafts"><span className="attachment-chip">{selected.harness === "pi" ? "Pi" : selected.harness === "claude" ? "Claude" : selected.harness === "codex" ? "OpenAI" : selected.harness === "phaseo" ? "Phaseo" : "OpenCode"} {nativeDraft.kind} · {nativeDraft.name}<button type="button" aria-label="Use as plain text" onClick={() => setNativeDrafts(current => { const next = { ...current }; delete next[selected.id]; return next; })}><X size={12} /></button></span></div>}
					{pendingAttachments.length > 0 && <div className="attachment-drafts">{pendingAttachments.map(attachment => <span className="attachment-chip" key={attachment.id}><button type="button" aria-label={`Preview ${attachment.name}`} onClick={() => setAttachmentPreview({ taskId: selected.id, id: attachment.id })}>{attachment.name}</button><button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => setAttachmentDrafts(current => ({ ...current, [selected.id]: (current[selected.id] ?? []).filter(value => value.id !== attachment.id) }))}><X size={12} /></button></span>)}</div>}
					{["codex", "opencode", "pi", "cursor"].includes(selected.harness) && (selected.status === "running" || selected.status === "waiting") && <button type="button" disabled={!!nativeDraft || (!text.trim() && !pendingAttachments.length) || busy || uploading || selected.archived || selected.steering?.some(message => message.status === "sending")} onClick={() => void send("steer")}>Steer current turn</button>}
					<div className="composer-actions"><button type="button" disabled={uploading || busy || selected.archived} title="Add to chat" aria-label="Add to chat" aria-expanded={promptCommandsId === selected.id} onClick={() => { setInlineCommands(true); setPromptCommandsId(current => current === selected.id ? undefined : selected.id); }}><Plus size={16} /></button><Select label="Permissions" value={selected.permissionMode ?? "supervised"} disabled={busy || selected.archived || selected.status === "running" || selected.status === "waiting"} onValueChange={value => { void command({ type: "update-task", id: selected.id, permissionMode: value as "supervised" | "full-access" }); }} options={[{ value: "supervised", label: "Supervised" }, { value: "full-access", label: "Full access" }]} /><ChatSessionPicker key={selected.id} task={selected} save={async (model, effort, speed) => Boolean(await command({ type: "update-task", id: selected.id, model, ...(["codex", "acp", "grok"].includes(selected.harness) ? { reasoningEffort: effort } : {}), ...(selected.harness === "codex" ? { serviceTier: speed } : {}) }))} onHarnessChange={value => { setHandoffId(selected.id); setProjectId(selected.projectId ?? ""); setHarness(value); setAccountId(""); setAgentId(""); setModel(""); setReasoningEffort(""); setServiceTier(""); setNewChatDraft(text); setSelectedId(undefined); }} />{selected.status === "running" || selected.status === "waiting" ? <button type="button" aria-label="Stop response" title="Stop response" onClick={() => void command({ type: "cancel", id: selected.id })}><Square size={14} /><span className="composer-control-label">Stop</span></button> : null}<button className="task-primary" disabled={(!text.trim() && !pendingAttachments.length) || busy || uploading || selected.archived} type="submit" title={`${selected.status === "running" || selected.status === "waiting" ? "Queue" : "Send"} (Enter)`} aria-label={selected.status === "running" || selected.status === "waiting" ? "Queue" : "Send"}><ArrowUp size={18} /><span className="composer-control-label">{selected.status === "running" || selected.status === "waiting" ? "Queue" : "Send"}</span></button></div>
				</form>{inlineCommands && promptCommandsId === selected.id && <PromptCommandPicker inline composerDriven composerQuery={/^\/[^\s]*$/.test(text) ? text.slice(1) : ""} onAttach={pendingAttachments.length < 10 ? () => void attach() : undefined} key={selected.id} taskId={selected.id} native={["opencode", "pi", "claude", "codex", "phaseo"].includes(selected.harness) ? selected.harness as "opencode" | "pi" | "claude" | "codex" | "phaseo" : undefined} projectId={selected.projectId} onClose={() => setPromptCommandsId(undefined)} onInsert={insertCommand} />}</div>}
			</>}
		</section>
		{attachmentPreview && <AttachmentPreview {...attachmentPreview} onClose={() => setAttachmentPreview(undefined)} />}
	</div>;
}
