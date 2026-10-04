import { nativeActionText, updateNativeActionText, type NativeAction } from "../../shared/nativeActions";
import { PromptCommandPicker } from "../components/PromptCommandPicker";
import { shortcutLabel, shortcutKeys } from "../lib/shortcuts";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, FolderOpen, Paperclip, Plus, Search, Send, Settings2, Square, X } from "lucide-react";
import type { Attachment, Harness, ModelOption, Task, WorkspaceCommand } from "../../shared/workspace";
import { emptyOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { usePersistedState } from "../lib/persistedState";
import { useTaskHistory } from "../lib/useTaskHistory";
import { useSelectedTask } from "../lib/useSelectedTask";
import { ConversationHistory } from "../components/ConversationHistory";
import { ApprovalRequest } from "../components/ApprovalRequest";
import { QuestionForm } from "../components/QuestionForm";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { AgentForm } from "../components/AgentForm";
import { ModelDiscoveryFeedback } from "../components/ModelDiscoveryFeedback";
import { TaskActions } from "../components/TaskActions";
import { TaskSettings } from "../components/TaskSettings";
const AuthTerminal = lazy(() => import("./Terminals").then(module => ({ default: module.AuthTerminal })));

export function TaskWorkspace({ onContextChange, onOverlayChange, footer }: { onOverlayChange?: (open: boolean) => void; onContextChange?: (context: { id?: string; projectId?: string }) => void; footer?: ReactNode }) {
	const [workspace, setWorkspace] = useState<WorkspaceOverview>(emptyOverview);
	const [selectedId, setSelectedId] = usePersistedState<string | undefined>("phaseo.desktop.selectedTask", undefined);
	const [promptCommandsId, setPromptCommandsId] = useState<string>();
	useEffect(() => { setPromptCommandsId(undefined); }, [selectedId]);
	const [query, setQuery] = useState("");
	const [showArchived, setShowArchived] = useState(false);
	const [editingQueue, setEditingQueue] = useState<string>();
	const [settingsId, setSettingsId] = useState<string>();
	const compactionPending = useRef(false);
	const composerInput = useRef<HTMLTextAreaElement>(null);
	const [queueText, setQueueText] = useState("");
	const [drafts, setDrafts] = usePersistedState<Record<string, string>>("phaseo.desktop.messageDrafts", {});
	const [nativeDrafts, setNativeDrafts] = usePersistedState<Record<string, NativeAction>>("phaseo.desktop.nativeActionDrafts", {});
	const nativeDraft = selectedId ? nativeDrafts[selectedId] : undefined;
	const text = selectedId ? drafts[selectedId] ?? "" : "";
	const setText = (value: string) => { if (selectedId) setNativeDrafts(current => { const next = { ...current }; const action = current[selectedId]; if (action) { const updated = updateNativeActionText(action, value); if (updated) next[selectedId] = updated; else delete next[selectedId]; } return next; }); if (selectedId) setDrafts(current => { const next = { ...current }; if (value) next[selectedId] = value; else delete next[selectedId]; return next; }); };
	const [projectId, setProjectId] = useState("");
	const [mode, setMode] = useState<Task["mode"]>("chat");
	const [model, setModel] = useState("default");
	const [reasoningEffort, setReasoningEffort] = useState("");
	const [models, setModels] = useState<ModelOption[]>([]);
	const [modelError, setModelError] = useState("");
	const [modelsAttempt, setModelsAttempt] = useState(0);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [harness, setHarness] = useState<Harness>("codex");
	const [accountId, setAccountId] = useState("");
	const [agentId, setAgentId] = useState("");
	const [handoffId, setHandoffId] = useState<string>();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const setupPending = useRef(false);
	const [setupAction, setSetupAction] = useState<"create" | "import">();
	const [uploading, setUploading] = useState(false);
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
	useEffect(() => {
		setModelError("");
		if (!api || !["codex", "phaseo", "opencode", "pi", "cursor", "grok"].includes(harness) || (["phaseo", "cursor"].includes(harness) && !accountId)) { setModelsLoading(false); return; }
		let active = true; setModelsLoading(true);
		void api.models(harness, accountId || undefined, projectId || undefined).then(result => { if (active) setModels(result); }, reason => { if (active) setModelError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); }).finally(() => { if (active) setModelsLoading(false); });
		return () => { active = false; };
	}, [api, harness, accountId, projectId, modelsAttempt]);
	useEffect(() => { setModels([]); setReasoningEffort(""); }, [harness, accountId, projectId]);
	const setupModel = models.find(value => model === "default" ? value.default : value.id === model);
	const selectedSnapshot = workspace.tasks.find(task => task.id === selectedId);
	const selectedDetail = useSelectedTask(api?.task, selectedId, selectedSnapshot ? JSON.stringify([selectedSnapshot.revision, selectedSnapshot.updatedAt]) : undefined);
	const selected = selectedDetail.task;
	useEffect(() => { onOverlayChange?.(!!selected && promptCommandsId === selected.id); return () => onOverlayChange?.(false); }, [selected?.id, promptCommandsId, onOverlayChange]);
	useEffect(() => { onContextChange?.({ id: selectedId, projectId: selected?.projectId ?? selectedSnapshot?.projectId ?? (!selectedId ? projectId || undefined : undefined) }); }, [selectedId, selected?.projectId, selectedSnapshot?.projectId, projectId, onContextChange]);
	const historyRevision = JSON.stringify(workspace.tasks.map(task => [task.id, task.title, task.pinned, task.archived, task.status, task.status === "running" || task.status === "waiting" ? undefined : task.updatedAt]));
	const history = useTaskHistory(api?.taskHistory, query, showArchived, historyRevision);
	const tasks = history.tasks;
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
	async function compact() {
		if (compactionPending.current || busy || !selected || !["opencode", "codex", "claude", "pi"].includes(selected.harness) || !selected.nativeSessionId || selected.archived || selected.status === "running" || selected.status === "waiting") return;
		compactionPending.current = true; setBusy(true);
		try { await command({ type: "send", id: selected.id, text: "/compact" }); }
		finally { compactionPending.current = false; setBusy(false); }
	}
	async function create() {
		if (setupPending.current || busy) return;
		setupPending.current = true; setSetupAction("create"); setBusy(true);
		try {
			const state = await command({ ...(handoffId ? { type: "handoff" as const, id: handoffId } : { type: "create-task" as const }), harness, model, mode, ...(projectId ? { projectId } : {}), ...(accountId ? { accountId } : {}), ...(agentId ? { agentId } : {}), ...(["codex", "grok"].includes(harness) && reasoningEffort ? { reasoningEffort } : {}) });
			if (state) { setSelectedId(state.tasks.find(task => !workspace.tasks.some(existing => existing.id === task.id))?.id); setHandoffId(undefined); }
		} finally { setupPending.current = false; setSetupAction(undefined); setBusy(false); }
	}
	async function importConversation() {
		if (!api || setupPending.current || busy) return;
		setupPending.current = true; setSetupAction("import"); setBusy(true); setError("");
		try {
			const result = await api.importTask({ type: "create-task", harness, model, mode, ...(projectId ? { projectId } : {}), ...(accountId ? { accountId } : {}), ...(agentId ? { agentId } : {}), ...(["codex", "grok"].includes(harness) && reasoningEffort ? { reasoningEffort } : {}) });
			if (result) { setWorkspace(result.workspace); setSelectedId(result.taskId); setHandoffId(undefined); }
		} catch (reason) { setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); } finally { setupPending.current = false; setSetupAction(undefined); setBusy(false); }
	}
	async function send(delivery: "send" | "steer" = "send") {
		if (!selected || (delivery === "steer" && nativeDraft) || (!text.trim() && !pendingAttachments.length) || busy || uploading) return;
		setBusy(true);
		try { if (await command({ type: delivery, id: selected.id, text: nativeDraft ? nativeActionText(nativeDraft) : text.trim() ? text : "Please review the attached files.", ...(delivery === "send" && nativeDraft ? { nativeAction: nativeDraft } : {}), attachments: pendingAttachments.map(attachment => attachment.id) })) { setText(""); setAttachmentDrafts(current => { const next = { ...current }; delete next[selected.id]; return next; }); } }
		finally { setBusy(false); }
	}
	async function attach() {
		if (!api || !selected || uploading) return;
		setUploading(true); setError("");
		try {
			const result = await api.chooseAttachments(selected.id);
			setAttachmentDrafts(current => ({ ...current, [selected.id]: [...current[selected.id] ?? [], ...result.attachments].slice(0, 10) }));
			if (result.errors.length || pendingAttachments.length + result.attachments.length > 10) setError([...result.errors, ...(pendingAttachments.length + result.attachments.length > 10 ? ["Only 10 files can be attached to one message."] : [])].join("\n"));
		} catch (reason) { setError(String(reason)); } finally { setUploading(false); }
	}
	return <div className="task-workspace">
		<aside className="task-list" aria-label="Chats" aria-busy={history.loading}>
			<div className="task-list-heading"><strong>Chats</strong><button type="button" aria-label="New chat" onClick={() => { setSelectedId(undefined); setHandoffId(undefined); }}><Plus size={16} /></button></div>
			<label className="task-search"><Search size={14} /><input aria-label="Search chats" placeholder="Search chats" maxLength={512} value={query} onChange={event => setQuery(event.target.value)} /></label>
			<button type="button" className="task-archive-filter" onClick={() => { setShowArchived(value => !value); setSelectedId(undefined); }}>{showArchived ? "Active chats" : "Archived chats"}</button>
			<div className="task-history-list">{[undefined, ...workspace.projects.filter(project => tasks.some(task => task.projectId === project.id)).map(project => project.id), ...Array.from(new Set(tasks.map(task => task.projectId).filter(id => id && !workspace.projects.some(project => project.id === id))))].map(group => <div className="chat-group" key={group ?? "personal"}><h2>{group ? workspace.projects.find(project => project.id === group)?.name ?? "Unavailable project" : "Personal"}</h2>{tasks.filter(task => task.projectId === group).map(task => <button type="button" title={task.title} aria-pressed={task.id === selectedId} className={`task-row ${task.id === selectedId ? "selected" : ""}`} key={task.id} onClick={() => setSelectedId(task.id)}><span>{task.pinned ? "● " : ""}{task.title}</span><small>{task.harness} · {task.status}</small></button>)}</div>)}
			{history.loading && <p className="task-muted" role="status">Loading chats…</p>}
			{history.error && <div className="task-muted" role="alert"><p>{history.error}</p><button type="button" onClick={history.retry}>Retry</button></div>}
			{!history.loading && !history.error && !tasks.length && <p className="task-muted">{query ? "No matching chats." : showArchived ? "No archived chats." : "Your chats will appear here."}</p>}
			{history.hasMore && <button type="button" disabled={history.loading} onClick={history.loadMore}>Load more chats</button>}</div>
			{footer && <div className="chat-sidebar-footer">{footer}</div>}
		</aside>
		<section className="task-detail" aria-label="Task workspace">
			{error && <div className="task-error" role="alert">{error}</div>}
			{selectedDetail.error && <div className="task-error" role="alert">{selectedDetail.error} <button type="button" onClick={selectedDetail.retry}>Retry</button></div>}
			{selectedId && !selected ? <div className="task-start"><p role="status">{selectedDetail.error ? "Could not load this task." : "Loading task…"}</p><button type="button" onClick={() => { setSelectedId(undefined); setHandoffId(undefined); }}>New task</button></div> : !selected ? <div className="task-start">
				<span className="task-eyebrow">PHASEO WORKSPACE</span><h1>What would you like to do?</h1><p>Write, research, plan, or work on a project.</p>
				<fieldset className="task-setup task-create-fields" aria-label="Task configuration" disabled={busy}>
					<label>Project<select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Personal chat</option>{workspace.projects.filter(project => !project.worktree?.removedAt).map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
					<button type="button" onClick={() => { if (api) void api.chooseProject().then(setWorkspace, reason => setError(String(reason))); }}><FolderOpen size={16} /> Open folder</button>
					<label>Mode<select value={mode} onChange={event => setMode(event.target.value as Task["mode"])}>{harness !== "grok" && <option value="chat">Chat</option>}<option value="code">Code</option><option value="plan">Plan</option></select></label>
					<label>Harness<select value={harness} onChange={event => { setHarness(event.target.value as Harness); if (event.target.value === "grok" && mode === "chat") setMode("plan"); setAccountId(""); setAgentId(""); setModel("default"); }}><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="opencode">OpenCode 2</option><option value="pi">Pi</option><option value="cursor">Cursor</option><option value="grok">Grok</option><option value="phaseo">Phaseo</option><option value="acp">ACP agent</option></select></label>
					{harness === "acp" && <label>Agent<select value={agentId} onChange={event => setAgentId(event.target.value)}><option value="">Choose a connected agent</option>{workspace.agents.filter(agent => !agent.archived).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>}
					{harness !== "acp" && harness !== "pi" && <label>Account<select value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">{harness === "phaseo" ? "Choose an API account" : harness === "cursor" ? "Choose a Cursor account" : "Existing local login"}</option>{workspace.accounts.filter(account => account.harness === harness && !account.archived).map(account => <option key={account.id} value={account.id} disabled={!account.configured}>{account.name}{account.configured ? "" : " — sign-in required"}</option>)}</select></label>}
					<div className="model-field"><label>Model<input list="workspace-models" value={model} onChange={event => { setModel(event.target.value); setReasoningEffort(""); }} aria-label="Model" /><datalist id="workspace-models">{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist></label><ModelDiscoveryFeedback loading={modelsLoading} error={modelError} retry={() => setModelsAttempt(value => value + 1)} disabled={busy} /></div>
					{["codex", "grok"].includes(harness) && <label>Reasoning effort<select aria-label="Initial reasoning effort" value={reasoningEffort} disabled={modelsLoading} onChange={event => setReasoningEffort(event.target.value)}><option value="">Default{setupModel?.defaultReasoningEffort ? ` (${setupModel.defaultReasoningEffort})` : ""}</option>{reasoningEffort && !setupModel?.reasoningEfforts?.some(value => value.id === reasoningEffort) && <option value={reasoningEffort}>{reasoningEffort} (availability unverified)</option>}{setupModel?.reasoningEfforts?.map(value => <option key={value.id} value={value.id} title={value.description}>{value.id}</option>)}</select></label>}
				</fieldset>
				{handoffId && <p className="task-muted">Continue “{workspace.tasks.find(task => task.id === handoffId)?.title}” with the selected harness. Conversation messages carry over; native tool state stays with the original task.</p>}
				<div className="task-controls">
				<button className="task-primary" type="button" onClick={() => void create()} disabled={busy || !model.trim() || (harness === "phaseo" && (!accountId || model === "default")) || (harness === "cursor" && !accountId) || (harness === "acp" && !agentId)}>{setupAction === "create" ? "Creating…" : handoffId ? "Create handoff" : "Create task"} <Plus size={16} /></button>
				{!handoffId && <button type="button" disabled={busy || !model.trim() || (harness === "phaseo" && (!accountId || model === "default")) || (harness === "cursor" && !accountId) || (harness === "acp" && !agentId)} onClick={() => void importConversation()}>{setupAction === "import" ? "Importing…" : "Import conversation"}</button>}
				</div>
				<small className="task-muted">{harness === "phaseo" ? "Code and Plan require a Responses-compatible API account. File changes require approval." : harness === "cursor" ? "Uses your selected Cursor account. Code mode requires approval for native tools for each turn." : harness === "pi" ? "Uses Pi’s native account, extensions and tool policies. Models use provider/model names." : harness === "acp" ? "Uses the connected agent’s native account and settings." : harness === "opencode" ? "Uses your local OpenCode 2 service and its connected accounts." : harness === "grok" ? `Uses your ${accountId ? "selected" : "existing local"} Grok account and native Code or Plan permissions.` : `Uses ${accountId ? "your selected" : "your existing local"} ${harness === "claude" ? "Claude Code" : "Codex"} account.`}</small>
			</div> : <>
				<header className="task-toolbar"><div><input className="task-title" aria-label="Task title" key={selected.id + selected.title} defaultValue={selected.title} maxLength={200} onBlur={event => { const title = event.target.value.trim(); if (title && title !== selected.title) void command({ type: "update-task", id: selected.id, title }); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>{selected.harness} · {selected.mode} · {selected.status}</small></div>
					<TaskActions key={selected.id} task={selected} busy={busy}
						onCompact={() => void compact()}
						onArchive={() => { void command({ type: "update-task", id: selected.id, archived: !selected.archived }).then(state => { if (state) setSelectedId(undefined); }); }}
						onPin={() => void command({ type: "update-task", id: selected.id, pinned: !selected.pinned })}
						onFork={() => { void command({ type: "fork", id: selected.id }).then(state => { if (state) setSelectedId(state.tasks.find(task => !workspace.tasks.some(existing => existing.id === task.id))?.id); }); }}
						onHandoff={() => { setHandoffId(selected.id); setProjectId(workspace.projects.some(project => project.id === selected.projectId && !project.worktree?.removedAt) ? selected.projectId! : ""); setMode(selected.mode); setHarness(selected.harness); setAccountId(""); setAgentId(""); setModel("default"); setReasoningEffort(""); setSelectedId(undefined); }}
						onExport={format => { if (!api) return; setBusy(true); setError(""); void api.exportTask(selected.id, format).catch(reason => setError(String(reason))).finally(() => setBusy(false)); }} />
				<button type="button" aria-label="Task settings" title="Task settings" aria-expanded={settingsId === selected.id} disabled={busy || selected.archived || selected.status === "running" || selected.status === "waiting"} onClick={() => setSettingsId(value => value === selected.id ? undefined : selected.id)}><Settings2 size={16} /></button>
				</header>
				{settingsId === selected.id && !selected.archived && selected.status !== "running" && selected.status !== "waiting" && <TaskSettings key={selected.id} task={selected} close={() => setSettingsId(undefined)} save={async (model, mode, reasoningEffort, nativeMode) => Boolean(await command({ type: "update-task", id: selected.id, model, mode, ...(["codex", "acp", "grok"].includes(selected.harness) ? { reasoningEffort } : {}), ...(selected.harness === "acp" ? { nativeMode } : {}) }))} />}
				<ConversationHistory key={`history:${selected.id}`} task={selected} onAttachment={id => setAttachmentPreview({ taskId: selected.id, id })}>
					{selected.error && <div className="task-error" role="alert">{selected.error}<button type="button" onClick={() => void command({ type: "resume", id: selected.id })}>Resume</button></div>}
					{selected.approvals?.map(approval => <ApprovalRequest key={approval.id} description={approval.description} onDecision={async decision => Boolean(await command({ type: "approval", id: selected.id, approvalId: approval.id, decision }))} />)}
					{selected.questions?.map(request => <QuestionForm key={request.id} questions={request.questions} onAnswer={async answers => Boolean(await command({ type: "answer", id: selected.id, requestId: request.id, answers }))} />)}
					{selected.forms?.map(request => <AgentForm key={request.id} form={request.form} onAnswer={async answer => Boolean(await command({ type: "form-answer", id: selected.id, requestId: request.id, answer }))} />)}
				{selected.authTerminalId && <Suspense fallback={<p>Opening native sign-in…</p>}><AuthTerminal id={selected.authTerminalId} /></Suspense>}
					{workspace.projects.find(project => project.id === selected.projectId)?.worktree?.removedAt && <p className="task-muted">This checkout has been removed. Use Handoff to continue in another project.</p>}
				</ConversationHistory>
				{selected.steering?.map(message => <div className="task-approval" key={message.id}><strong>{message.status === "sending" ? "Sending steering instruction…" : message.status === "rejected" ? "Instruction not sent" : "Delivery unconfirmed"}</strong><p>{message.text}</p>{message.attachments?.map(attachment => <button type="button" key={attachment.id} onClick={() => setAttachmentPreview({ taskId: selected.id, id: attachment.id })}>{attachment.name}</button>)}{message.error && <p>{message.error}</p>}{message.status === "unconfirmed" && <p>Queueing this instruction may send it twice.</p>}<button type="button" disabled={message.status === "sending" || selected.archived} onClick={() => void command({ type: "steer-queue", id: selected.id, messageId: message.id })}>Queue instead</button><button type="button" disabled={message.status === "sending"} onClick={() => void command({ type: "steer-discard", id: selected.id, messageId: message.id })}>Discard</button></div>)}
				{selected.queue.length > 0 && <section className="task-queue" aria-label="Queued messages"><strong>Queued messages ({selected.queue.length})</strong><div className="task-queue-items">{selected.queue.map(message => <div key={message.id}>{editingQueue === message.id ? <><textarea aria-label="Queued message" value={queueText} onChange={event => setQueueText(event.target.value)} /><button type="button" disabled={!queueText.trim()} onClick={() => { void command({ type: "queue-edit", id: selected.id, messageId: message.id, text: queueText }).then(state => { if (state) setEditingQueue(undefined); }); }}>Save</button><button type="button" onClick={() => setEditingQueue(undefined)}>Cancel</button></> : <><span>{message.text}</span><button type="button" onClick={() => { setEditingQueue(message.id); setQueueText(message.text); }}>Edit</button></>}<button type="button" aria-label="Move message up" onClick={() => void command({ type: "queue-move", id: selected.id, messageId: message.id, direction: "up" })}><ArrowUp size={14} /></button><button type="button" aria-label="Move message down" onClick={() => void command({ type: "queue-move", id: selected.id, messageId: message.id, direction: "down" })}><ArrowDown size={14} /></button><button type="button" onClick={() => void command({ type: "queue-remove", id: selected.id, messageId: message.id })}>Remove</button></div>)}</div></section>}
				<form className="task-composer" onSubmit={event => { event.preventDefault(); void send(); }}><textarea ref={composerInput} aria-label="Message" aria-keyshortcuts={shortcutKeys("Enter")} maxLength={100000} placeholder="Describe your task…" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (!event.nativeEvent.isComposing && !event.repeat && (event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void send(); } }} />
					{nativeDraft && <div className="attachment-drafts"><span className="attachment-chip">{selected.harness === "pi" ? "Pi" : selected.harness === "claude" ? "Claude" : selected.harness === "codex" ? "OpenAI" : selected.harness === "phaseo" ? "Phaseo" : "OpenCode"} {nativeDraft.kind} · {nativeDraft.name}<button type="button" aria-label="Use as plain text" onClick={() => setNativeDrafts(current => { const next = { ...current }; delete next[selected.id]; return next; })}><X size={12} /></button></span></div>}
					{pendingAttachments.length > 0 && <div className="attachment-drafts">{pendingAttachments.map(attachment => <span className="attachment-chip" key={attachment.id}><button type="button" aria-label={`Preview ${attachment.name}`} onClick={() => setAttachmentPreview({ taskId: selected.id, id: attachment.id })}>{attachment.name}</button><button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => setAttachmentDrafts(current => ({ ...current, [selected.id]: (current[selected.id] ?? []).filter(value => value.id !== attachment.id) }))}><X size={12} /></button></span>)}</div>}
					{["codex", "opencode", "pi", "cursor"].includes(selected.harness) && (selected.status === "running" || selected.status === "waiting") && <button type="button" disabled={!!nativeDraft || (!text.trim() && !pendingAttachments.length) || busy || uploading || selected.archived || selected.steering?.some(message => message.status === "sending")} onClick={() => void send("steer")}>Steer current turn</button>}
					<div><button type="button" disabled={uploading || busy || selected.archived || pendingAttachments.length >= 10} onClick={() => void attach()}><Paperclip size={14} />{uploading ? "Adding…" : "Attach files"}</button><button type="button" disabled={busy || selected.archived} onClick={() => setPromptCommandsId(selected.id)}>Commands</button><small>{shortcutLabel("Enter")} to {selected.status === "running" || selected.status === "waiting" ? "queue" : "send"}</small>{selected.status === "running" || selected.status === "waiting" ? <button type="button" onClick={() => void command({ type: "cancel", id: selected.id })}><Square size={14} /> Stop</button> : null}<button className="task-primary" disabled={(!text.trim() && !pendingAttachments.length) || busy || uploading || selected.archived} type="submit"><Send size={14} />{selected.status === "running" || selected.status === "waiting" ? "Queue" : "Send"}</button></div>
				</form>
			</>}
		</section>
		{promptCommandsId === selected?.id && selected && <PromptCommandPicker key={selected.id} taskId={selected.id} native={selected.harness === "opencode" || selected.harness === "pi" || selected.harness === "claude" || selected.harness === "codex" || selected.harness === "phaseo" ? selected.harness : undefined} projectId={selected.projectId} onClose={() => setPromptCommandsId(undefined)} onInsert={(value, action) => { const nextAction = action ? { ...action, arguments: [action.arguments, text].filter(Boolean).join("\n\n") } : undefined; const next = nextAction ? nativeActionText(nextAction) : text ? `${text}\n\n${value}` : value; if (next.length > 100000) throw new Error("The draft exceeds the message limit."); setText(next); if (nextAction) setNativeDrafts(current => ({ ...current, [selected.id]: nextAction })); requestAnimationFrame(() => composerInput.current?.focus()); }} />}
		{attachmentPreview && <AttachmentPreview {...attachmentPreview} onClose={() => setAttachmentPreview(undefined)} />}
	</div>;
}
