import { useEffect, useState } from "react";
import { ArrowRight, Bot, FolderOpen, MessageSquare, Plus, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Workspace } from "../../shared/workspace";
import { emptyWorkspace } from "../../shared/workspace";

export function WorkspaceHome({ onNavigate }: { onNavigate: (page: string, taskId?: string) => void }) {
	const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
	const [error, setError] = useState("");
	const api = window.phaseoDesktop?.workspace;
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.get().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onChange(setWorkspace);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	const tasks = workspace.tasks.filter(task => !task.archived);
	const waiting = tasks.filter(task => task.status === "waiting");
	const running = tasks.filter(task => task.status === "running");
	return <div className="page workspace-home">
		<section className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1>Your AI workspace</h1><p>Write, research, analyse, and build with your choice of harness.</p></div><button className="primary-button" type="button" onClick={() => onNavigate("tasks")}><Plus size={16} /> New task</button></section>
		{error && <p className="task-error" role="alert">{error}</p>}
		<section className="metric-grid" aria-label="Workspace summary"><MetricCard icon={ShieldCheck} label="Awaiting approval" value={waiting.length} /><MetricCard icon={Bot} label="Running tasks" value={running.length} /><MetricCard icon={MessageSquare} label="Tasks" value={tasks.length} /><MetricCard icon={FolderOpen} label="Projects" value={workspace.projects.filter(project => !project.worktree?.removedAt).length} /></section>
		<div className="workspace-grid">
			<section className="panel attention-panel"><div className="panel-heading"><h2>{waiting.length ? "Needs your attention" : "Get started"}</h2></div><div className="attention-list">
				{waiting.length ? waiting.map(task => <article className="attention-item" key={task.id}><div className="attention-icon"><ShieldCheck size={18} /></div><div><h3>{task.title}</h3><p>{task.questions?.length ? "Answer needed" : task.approvals?.[0]?.method}</p></div><button className="secondary-button" type="button" onClick={() => onNavigate("tasks", task.id)}>Review <ArrowRight size={14} /></button></article>) : <>
					<article className="attention-item"><div className="attention-icon"><Bot size={18} /></div><div><h3>Connect your accounts</h3><p>Use native subscriptions or an API account.</p></div><button className="secondary-button" type="button" onClick={() => onNavigate("accounts")}>Accounts <ArrowRight size={14} /></button></article>
					<article className="attention-item"><div className="attention-icon"><FolderOpen size={18} /></div><div><h3>Open a project</h3><p>Give agents access to a local folder.</p></div><button className="secondary-button" type="button" onClick={() => onNavigate("projects")}>Projects <ArrowRight size={14} /></button></article>
				</>}
			</div></section>
			<section className="panel activity-panel"><div className="panel-heading"><h2>Running</h2><span className="count-pill">{running.length}</span></div>{running.length ? running.map(task => <button className="home-task-row" key={task.id} type="button" onClick={() => onNavigate("tasks", task.id)}><strong>{task.title}</strong><small>{task.harness}</small><ArrowRight size={14} /></button>) : <div className="empty-state compact-empty"><Bot size={22} /><h3>No tasks running</h3></div>}</section>
			<section className="panel recent-panel"><div className="panel-heading"><h2>Recent work</h2></div>{tasks.length ? tasks.slice(0, 8).map(task => <button className="home-task-row" key={task.id} type="button" onClick={() => onNavigate("tasks", task.id)}><strong>{task.title}</strong><small>{task.harness} · {task.status}</small><ArrowRight size={14} /></button>) : <div className="empty-state compact-empty"><MessageSquare size={22} /><h3>Start your first task</h3><button className="secondary-button" type="button" onClick={() => onNavigate("tasks")}>New task <Plus size={14} /></button></div>}</section>
		</div>
	</div>;
}
function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
	return <article className="metric-card"><div className="metric-icon"><Icon size={16} /></div><span>{label}</span><strong>{value}</strong></article>;
}
