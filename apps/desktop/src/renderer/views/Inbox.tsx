import { useEffect, useState } from "react";
import { ArrowRight, Bell } from "lucide-react";
import { emptyWorkspace } from "../../shared/workspace";
import { inboxReason, needsAttention } from "../../shared/inbox";

export function Inbox({ onOpenTask }: { onOpenTask: (id: string) => void }) {
	const [workspace, setWorkspace] = useState(emptyWorkspace);
	const [filter, setFilter] = useState("attention");
	const [error, setError] = useState("");
	const api = window.phaseoDesktop?.workspace;
	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.get().then(value => { if (active) setWorkspace(value); }, reason => { if (active) setError(String(reason)); });
		const unsubscribe = api.onChange(setWorkspace);
		return () => { active = false; unsubscribe(); };
	}, [api]);
	const tasks = workspace.tasks.filter(task => inboxReason(task) && (filter === "all" || (filter === "attention" ? needsAttention(task) : task.inboxReadAt !== task.updatedAt))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	return <div className="page workspace-home"><section className="page-heading"><h1>Inbox</h1><select aria-label="Inbox filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="attention">Needs attention</option><option value="unread">Unread</option><option value="all">All activity</option></select></section>
		{error && <p className="task-error" role="alert">{error}</p>}
		<section className="panel attention-panel"><div className="attention-list">{tasks.length ? tasks.map(task => <article className="attention-item" key={task.id}><div className="attention-icon"><Bell size={18} /></div><div><h3>{task.title}</h3><p>{inboxReason(task)} · {task.harness}{task.inboxReadAt !== task.updatedAt ? " · Unread" : ""}</p></div><button className="secondary-button" type="button" onClick={() => {
			void api?.command({ type: "inbox-read", id: task.id, revision: task.updatedAt }).catch(reason => setError(String(reason)));
			onOpenTask(task.id);
		}}>Review <ArrowRight size={14} /></button></article>) : <div className="empty-state compact-empty"><Bell size={22} /><h3>{filter === "attention" ? "No tasks need attention" : "No activity here"}</h3></div>}</div></section>
	</div>;
}
