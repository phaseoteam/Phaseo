import { lazy, Suspense, useEffect, useState } from "react";
import { Archive, ArrowDown, ArrowRightLeft, ArrowUp, FolderOpen, GitFork, Paperclip, Pin, Plus, Search, Send, Settings2, Square, X } from "lucide-react";
import type { Attachment, Harness, ModelOption, Task, Workspace, WorkspaceCommand } from "../../shared/workspace";
import { emptyWorkspace } from "../../shared/workspace";
import { usePersistedState } from "../lib/persistedState";
import { useTaskHistory } from "../lib/useTaskHistory";
import { MessageContent } from "../components/MessageContent";
import { QuestionForm } from "../components/QuestionForm";
import { AttachmentPreview } from "../components/AttachmentPreview";
import { AgentForm } from "../components/AgentForm";
import { TaskSettings } from "../components/TaskSettings";
const AuthTerminal = lazy(() => import("./Terminals").then(module => ({ default: module.AuthTerminal })));

export function TaskWorkspace() {
	const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
	const [selectedId, setSelectedId] = usePersistedState<string | undefined>("phaseo.desktop.selectedTask", undefined);
	const [query, setQuery] = useState("");
	const [showArchived, setShowArchived] = useState(false);
	const [editingQueue, setEditingQueue] = useState<string>();
	const [settingsId, setSettingsId] = useState<string>();
	const [queueText, setQueueText] = useState("");
	const [drafts, setDrafts] = usePersistedState<Record<string, string>>("phaseo.desktop.messageDrafts", {});
	const text = selectedId ? drafts[selectedId] ?? "" : "";
	const setText = (value: string) => { if (selectedId) setDrafts(current => { const next = { ...current }; if (value) next[selectedId] = value; else delete next[selectedId]; return next; }); };
	const [projectId, setProjectId] = useState("");
	const [mode, setMode] = useState<Task["mode"]>("chat");
	const [model, setModel] = useState("default");
	const [models, setModels] = useState<ModelOption[]>([]);
	const [modelError, setModelError] = useState("");
	const [modelsLoading, setModelsLoading] = useState(false);
	const [harness, setHarness] = useState<Harness>("codex");
	const [accountId, setAccountId] = useState("");
	const [agentId, setAgentId] = useState("");
	const [handoffId, setHandoffId] = useState<string>();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [attachmentPreview, setAttachmentPreview] = useState<{ taskId: string; id: string }>();
	const [attachmentDrafts, setAttachmentDrafts] = usePersistedState<Record<string, Attachment[]>>("phaseo.desktop.attachmentDrafts", {});
	const pendingAttachments = selectedId ? attachmentDrafts[selectedId] ?? [] : [];
	const api = window.phaseoDesktop?.workspace;
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.get().then(state => { if (active) setWorkspace(state); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onChange(setWorkspace);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	useEffect(() => {
		setModels([]); setModelError("");
		if (!api || !["codex", "phaseo", "opencode", "pi", "cursor", "grok"].includes(harness) || (["phaseo", "cursor"].includes(harness) && !accountId)) { setModelsLoading(false); return; }
		let active = true; setModelsLoading(true);
		void api.models(harness, accountId || undefined, projectId || undefined).then(result => { if (active) setModels(result); }, reason => { if (active) setModelError(reason instanceof Error ? reason.message : String(reason)); }).finally(() => { if (active) setModelsLoading(false); });
		return () => { active = false; };
	}, [api, harness, accountId, projectId]);
	const selected = workspace.tasks.find(task => task.id === selectedId);
	const historyRevision = JSON.stringify(workspace.tasks.map(task => [task.id, task.title, task.pinned, task.archived, task.status, task.status === "running" || task.status === "waiting" ? undefined : task.updatedAt]));
	const history = useTaskHistory(api?.taskHistory, query, showArchived, historyRevision);
	const tasks = history.tasks;
	async function command(value: WorkspaceCommand) {
		if (!api) { setError("Open the desktop application to use your local workspace."); return; }
		setError("");
		try { const state = await api.command(value); setWorkspace(state); return state; }
		catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
	}
	async function create() {
		const state = await command({ ...(handoffId ? { type: "handoff" as const, id: handoffId } : { type: "create-task" as const }), harness, model, mode, ...(projectId ? { projectId } : {}), ...(accountId ? { accountId } : {}), ...(agentId ? { agentId } : {}) });
		if (state) { setSelectedId(state.tasks.find(task => !workspace.tasks.some(existing => existing.id === task.id))?.id); setHandoffId(undefined); }
	}
	async function importConversation() {
		if (!api || busy) return; setBusy(true); setError("");
		try {
			const result = await api.importTask({ type: "create-task", harness, model, mode, ...(projectId ? { projectId } : {}), ...(accountId ? { accountId } : {}), ...(agentId ? { agentId } : {}) });
			if (result) { setWorkspace(result.workspace); setSelectedId(result.taskId); setHandoffId(undefined); }
		} catch (reason) { setError(String(reason)); } finally { setBusy(false); }
	}
	async function send(delivery: "send" | "steer" = "send") {
		if (!selected || (!text.trim() && !pendingAttachments.length) || busy || uploading) return;
		setBusy(true);
		try { if (await command({ type: delivery, id: selected.id, text: text.trim() ? text : "Please review the attached files.", attachments: pendingAttachments.map(attachment => attachment.id) })) { setText(""); setAttachmentDrafts(current => { const next = { ...current }; delete next[selected.id]; return next; }); } }
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
		<aside className="task-list" aria-label="Tasks" aria-busy={history.loading}>
			<div className="task-list-heading"><strong>Tasks</strong><button type="button" aria-label="New task" onClick={() => { setSelectedId(undefined); setHandoffId(undefined); }}><Plus size={16} /></button></div>
			<label className="task-search"><Search size={14} /><input aria-label="Search tasks" placeholder="Search tasks" maxLength={512} value={query} onChange={event => setQuery(event.target.value)} /></label>
			<button type="button" className="task-archive-filter" onClick={() => { setShowArchived(value => !value); setSelectedId(undefined); }}>{showArchived ? "Active tasks" : "Archived tasks"}</button>
			{tasks.map(task => <button type="button" className={`task-row ${task.id === selectedId ? "selected" : ""}`} key={task.id} onClick={() => setSelectedId(task.id)}><span>{task.pinned ? "● " : ""}{task.title}</span><small>{task.harness} · {task.status}</small></button>)}
			{history.loading && <p className="task-muted" role="status">Loading tasks…</p>}
			{history.error && <div className="task-muted" role="alert"><p>{history.error}</p><button type="button" onClick={history.retry}>Retry</button></div>}
			{!history.loading && !history.error && !tasks.length && <p className="task-muted">{query ? "No matching tasks." : showArchived ? "No archived tasks." : "Your tasks will appear here."}</p>}
			{history.hasMore && <button type="button" disabled={history.loading} onClick={history.loadMore}>Load more tasks</button>}
		</aside>
		<section className="task-detail" aria-label="Task workspace">
			{error && <div className="task-error" role="alert">{error}</div>}
			{!selected ? <div className="task-start">
				<span className="task-eyebrow">PHASEO WORKSPACE</span><h1>What would you like to do?</h1><p>Write, research, plan, or work on a project.</p>
				<div className="task-setup">
					<label>Project<select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Personal task</option>{workspace.projects.filter(project => !project.worktree?.removedAt).map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
					<button type="button" onClick={() => { if (api) void api.chooseProject().then(setWorkspace, reason => setError(String(reason))); }}><FolderOpen size={16} /> Open folder</button>
					<label>Mode<select value={mode} onChange={event => setMode(event.target.value as Task["mode"])}>{harness !== "grok" && <option value="chat">Chat</option>}<option value="code">Code</option><option value="plan">Plan</option></select></label>
					<label>Harness<select value={harness} onChange={event => { setHarness(event.target.value as Harness); if (event.target.value === "grok" && mode === "chat") setMode("plan"); setAccountId(""); setAgentId(""); setModel("default"); }}><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="opencode">OpenCode 2</option><option value="pi">Pi</option><option value="cursor">Cursor</option><option value="grok">Grok</option><option value="phaseo">Phaseo</option><option value="acp">ACP agent</option></select></label>
					{harness === "acp" && <label>Agent<select value={agentId} onChange={event => setAgentId(event.target.value)}><option value="">Choose a connected agent</option>{workspace.agents.filter(agent => !agent.archived).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>}
					{harness !== "acp" && harness !== "pi" && <label>Account<select value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">{harness === "phaseo" ? "Choose an API account" : harness === "cursor" ? "Choose a Cursor account" : "Existing local login"}</option>{workspace.accounts.filter(account => account.harness === harness && !account.archived).map(account => <option key={account.id} value={account.id} disabled={!account.configured}>{account.name}{account.configured ? "" : " — sign-in required"}</option>)}</select></label>}
					<label>Model<input list="workspace-models" value={model} onChange={event => setModel(event.target.value)} aria-label="Model" /><datalist id="workspace-models">{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist>{modelsLoading && <small>Loading models…</small>}{modelError && <small>{modelError}</small>}</label>
				</div>
				{handoffId && <p className="task-muted">Continue “{workspace.tasks.find(task => task.id === handoffId)?.title}” with the selected harness. Conversation messages carry over; native tool state stays with the original task.</p>}
				<div className="task-controls">
				<button className="task-primary" type="button" onClick={() => void create()} disabled={!model.trim() || (harness === "phaseo" && (!accountId || model === "default")) || (harness === "cursor" && !accountId) || (harness === "acp" && !agentId)}>{handoffId ? "Create handoff" : "Create task"} <Plus size={16} /></button>
				{!handoffId && <button type="button" disabled={busy || !model.trim() || (harness === "phaseo" && (!accountId || model === "default")) || (harness === "cursor" && !accountId) || (harness === "acp" && !agentId)} onClick={() => void importConversation()}>Import conversation</button>}
				</div>
				<small className="task-muted">{harness === "phaseo" ? "Code and Plan require a Responses-compatible API account. File changes require approval." : harness === "cursor" ? "Uses your selected Cursor account. Code mode requires approval for native tools for each turn." : harness === "pi" ? "Uses Pi’s native account, extensions and tool policies. Models use provider/model names." : harness === "acp" ? "Uses the connected agent’s native account and settings." : harness === "opencode" ? "Uses your local OpenCode 2 service and its connected accounts." : `Uses ${accountId ? "your selected" : "your existing local"} ${harness === "claude" ? "Claude Code" : "Codex"} account.`}</small>
			</div> : <>
				<header className="task-toolbar"><div><input className="task-title" aria-label="Task title" key={selected.id + selected.title} defaultValue={selected.title} maxLength={200} onBlur={event => { const title = event.target.value.trim(); if (title && title !== selected.title) void command({ type: "update-task", id: selected.id, title }); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /><small>{selected.harness} · {selected.mode} · {selected.status}</small></div>
					<select aria-label="Export conversation" value="" disabled={busy} onChange={event => { const format = event.target.value; if (!api || (format !== "markdown" && format !== "json")) return; setBusy(true); setError(""); void api.exportTask(selected.id, format).catch(reason => setError(String(reason))).finally(() => setBusy(false)); }}><option value="">Export…</option><option value="markdown">Markdown (.md)</option><option value="json">JSON with files (.json)</option></select>
					<button type="button" aria-label={selected.archived ? "Restore task" : "Archive task"} disabled={selected.status === "running" || selected.status === "waiting"} onClick={() => { void command({ type: "update-task", id: selected.id, archived: !selected.archived }).then(state => { if (state) setSelectedId(undefined); }); }}><Archive size={16} /></button>
					<button type="button" aria-label={selected.pinned ? "Unpin task" : "Pin task"} onClick={() => void command({ type: "update-task", id: selected.id, pinned: !selected.pinned })}><Pin size={16} /></button>
					<button type="button" aria-label="Fork task history" onClick={() => { void command({ type: "fork", id: selected.id }).then(state => { if (state) setSelectedId(state.tasks.find(task => !workspace.tasks.some(existing => existing.id === task.id))?.id); }); }}><GitFork size={16} /></button>
					<button type="button" aria-label="Handoff" title="Handoff" disabled={selected.status === "running" || selected.status === "waiting"} onClick={() => { setHandoffId(selected.id); setProjectId(workspace.projects.some(project => project.id === selected.projectId && !project.worktree?.removedAt) ? selected.projectId! : ""); setMode(selected.mode); setHarness(selected.harness); setAccountId(""); setAgentId(""); setModel("default"); setSelectedId(undefined); }}><ArrowRightLeft size={16} /></button>
				<button type="button" aria-label="Task settings" title="Task settings" aria-expanded={settingsId === selected.id} disabled={selected.archived || selected.status === "running" || selected.status === "waiting"} onClick={() => setSettingsId(value => value === selected.id ? undefined : selected.id)}><Settings2 size={16} /></button>
				</header>
				{settingsId === selected.id && !selected.archived && selected.status !== "running" && selected.status !== "waiting" && <TaskSettings key={selected.id} task={selected} close={() => setSettingsId(undefined)} save={async (model, mode, reasoningEffort, nativeMode) => Boolean(await command({ type: "update-task", id: selected.id, model, mode, ...(["codex", "acp", "grok"].includes(selected.harness) ? { reasoningEffort } : {}), ...(selected.harness === "acp" ? { nativeMode } : {}) }))} />}
				<div className="task-messages" aria-live="polite">{selected.messages.length ? selected.messages.map(message => <article className={`task-message task-message-${message.role}`} key={message.id}><small>{message.role === "user" ? "You" : message.role === "assistant" ? selected.harness : message.role}</small>{message.role === "assistant" ? <MessageContent text={message.text} /> : <div>{message.text}</div>}{message.attachments?.map(attachment => <button type="button" className="attachment-chip" key={attachment.id} onClick={() => setAttachmentPreview({ taskId: selected.id, id: attachment.id })}><Paperclip size={12} />{attachment.name}</button>)}</article>) : <p className="task-muted">Send a message to start.</p>}
					{selected.activities?.map(activity => <details className="task-activity" key={activity.id}><summary>{activity.title}{activity.status ? ` · ${activity.status}` : ""}</summary><pre>{activity.text}</pre></details>)}
					{selected.error && <div className="task-error" role="alert">{selected.error}<button type="button" onClick={() => void command({ type: "resume", id: selected.id })}>Resume</button></div>}
					{selected.approvals?.map(approval => <div className="task-approval" key={approval.id}><strong>Approval needed</strong><pre>{approval.description}</pre>{(["decline", "accept"] as const).map(decision => <button type="button" key={decision} onClick={() => void command({ type: "approval", id: selected.id, approvalId: approval.id, decision })}>{decision === "accept" ? "Allow" : "Deny"}</button>)}</div>)}
					{selected.questions?.map(request => <QuestionForm key={request.id} questions={request.questions} onAnswer={async answers => Boolean(await command({ type: "answer", id: selected.id, requestId: request.id, answers }))} />)}
					{selected.forms?.map(request => <AgentForm key={request.id} form={request.form} onAnswer={async answer => Boolean(await command({ type: "form-answer", id: selected.id, requestId: request.id, answer }))} />)}
				{selected.authTerminalId && <Suspense fallback={<p>Opening native sign-in…</p>}><AuthTerminal id={selected.authTerminalId} /></Suspense>}
					{workspace.projects.find(project => project.id === selected.projectId)?.worktree?.removedAt && <p className="task-muted">This checkout has been removed. Use Handoff to continue in another project.</p>}
				</div>
				{selected.steering?.map(message => <div className="task-approval" key={message.id}><strong>{message.status === "sending" ? "Sending steering instruction…" : message.status === "rejected" ? "Instruction not sent" : "Delivery unconfirmed"}</strong><p>{message.text}</p>{message.attachments?.map(attachment => <button type="button" key={attachment.id} onClick={() => setAttachmentPreview({ taskId: selected.id, id: attachment.id })}>{attachment.name}</button>)}{message.error && <p>{message.error}</p>}{message.status === "unconfirmed" && <p>Queueing this instruction may send it twice.</p>}<button type="button" disabled={message.status === "sending" || selected.archived} onClick={() => void command({ type: "steer-queue", id: selected.id, messageId: message.id })}>Queue instead</button><button type="button" disabled={message.status === "sending"} onClick={() => void command({ type: "steer-discard", id: selected.id, messageId: message.id })}>Discard</button></div>)}
				{selected.queue.length > 0 && <div className="task-queue"><strong>Queued messages</strong>{selected.queue.map(message => <div key={message.id}>{editingQueue === message.id ? <><textarea aria-label="Queued message" value={queueText} onChange={event => setQueueText(event.target.value)} /><button type="button" disabled={!queueText.trim()} onClick={() => { void command({ type: "queue-edit", id: selected.id, messageId: message.id, text: queueText }).then(state => { if (state) setEditingQueue(undefined); }); }}>Save</button><button type="button" onClick={() => setEditingQueue(undefined)}>Cancel</button></> : <><span>{message.text}</span><button type="button" onClick={() => { setEditingQueue(message.id); setQueueText(message.text); }}>Edit</button></>}<button type="button" aria-label="Move message up" onClick={() => void command({ type: "queue-move", id: selected.id, messageId: message.id, direction: "up" })}><ArrowUp size={14} /></button><button type="button" aria-label="Move message down" onClick={() => void command({ type: "queue-move", id: selected.id, messageId: message.id, direction: "down" })}><ArrowDown size={14} /></button><button type="button" onClick={() => void command({ type: "queue-remove", id: selected.id, messageId: message.id })}>Remove</button></div>)}</div>}
				<form className="task-composer" onSubmit={event => { event.preventDefault(); void send(); }}><textarea aria-label="Message" maxLength={100000} placeholder="Describe your task…" value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void send(); } }} />
					{pendingAttachments.length > 0 && <div className="attachment-drafts">{pendingAttachments.map(attachment => <span className="attachment-chip" key={attachment.id}><button type="button" aria-label={`Preview ${attachment.name}`} onClick={() => setAttachmentPreview({ taskId: selected.id, id: attachment.id })}>{attachment.name}</button><button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => setAttachmentDrafts(current => ({ ...current, [selected.id]: (current[selected.id] ?? []).filter(value => value.id !== attachment.id) }))}><X size={12} /></button></span>)}</div>}
					{["codex", "opencode", "pi", "cursor"].includes(selected.harness) && (selected.status === "running" || selected.status === "waiting") && <button type="button" disabled={(!text.trim() && !pendingAttachments.length) || busy || uploading || selected.archived || selected.steering?.some(message => message.status === "sending")} onClick={() => void send("steer")}>Steer current turn</button>}
					<div><button type="button" disabled={uploading || busy || selected.archived || pendingAttachments.length >= 10} onClick={() => void attach()}><Paperclip size={14} />{uploading ? "Adding…" : "Attach files"}</button><small>Ctrl/⌘ Enter to send</small>{selected.status === "running" || selected.status === "waiting" ? <button type="button" onClick={() => void command({ type: "cancel", id: selected.id })}><Square size={14} /> Stop</button> : null}<button className="task-primary" disabled={(!text.trim() && !pendingAttachments.length) || busy || uploading || selected.archived} type="submit"><Send size={14} />{selected.status === "running" || selected.status === "waiting" ? "Queue" : "Send"}</button></div>
				</form>
			</>}
		</section>
		{attachmentPreview && <AttachmentPreview {...attachmentPreview} onClose={() => setAttachmentPreview(undefined)} />}
	</div>;
}
