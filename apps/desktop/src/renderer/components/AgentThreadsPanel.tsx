import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { emptyOverview } from "../../shared/workspaceOverview";
import { useSelectedTask } from "../lib/useSelectedTask";
import { DelegatedThreads } from "./DelegatedThreads";

export function AgentThreadsPanel({ id, onOpen }: { id?: string; onOpen: (id: string) => void }) {
	const api = window.phaseoDesktop?.workspace;
	const [workspace, setWorkspace] = useState(emptyOverview);
	useEffect(() => { if (!api) return; let active = true; void api.overview().then(value => { if (active) setWorkspace(value); }); const unsubscribe = api.onOverviewChange(setWorkspace); return () => { active = false; unsubscribe(); }; }, [api]);
	const metadata = workspace.tasks.find(task => task.id === id);
	const detail = useSelectedTask(api?.task, id, String(metadata?.revision ?? ""));
	const children = workspace.tasks.filter(task => task.delegation?.parentTaskId === id);
	const native = detail.task?.activities?.filter(activity => activity.nativeAgent) ?? [];
	return <section aria-label="Agents" className="agent-threads-panel"><DelegatedThreads tasks={children} onOpen={onOpen} />{native.map(activity => <details key={activity.id} className="native-agent-row"><summary><ChevronRight size={14} /><span>{activity.title}</span><small>{activity.nativeAgent!.status}</small></summary>{activity.nativeAgent!.model && <small>{activity.nativeAgent!.model}</small>}<p>{activity.text}</p><small>Controlled by the parent harness</small></details>)}{!children.length && !native.length && <p className="task-muted">No agents in this chat.</p>}{detail.error && <p role="alert">{detail.error}</p>}</section>;
}
