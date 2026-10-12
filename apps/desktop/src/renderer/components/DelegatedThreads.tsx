import { ChevronRight, GitBranch, LoaderCircle } from "lucide-react";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { HarnessLogo } from "./HarnessLogo";

export function DelegatedThreads({ tasks, onOpen }: { tasks: TaskOverview[]; onOpen: (id: string) => void }) {
	if (!tasks.length) return null;
	return <div className="delegated-threads" aria-label="Delegated agents"><div className="delegated-threads-heading"><GitBranch size={14} /><span>Agents</span><span>{tasks.length}</span></div>{tasks.map(task => <button type="button" key={task.id} className="delegated-thread" onClick={() => onOpen(task.id)}><HarnessLogo harness={task.harness} /><span className="delegated-thread-title">{task.title}<small>{task.model}</small></span><span className="delegated-thread-status">{["running", "waiting"].includes(task.status) && <LoaderCircle size={12} className="spinning" />}{task.status === "completed" ? "Completed" : task.status === "running" ? "Working" : task.status === "waiting" ? "Needs input" : task.status === "interrupted" ? "Interrupted" : task.status === "failed" ? "Failed" : "Queued"}</span><ChevronRight size={14} /></button>)}</div>;
}
