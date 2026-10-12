import { ChevronRight, Terminal, LoaderCircle } from "lucide-react";
import type { AgentActivity } from "../../shared/workspace";
import { ActivityResult } from "./ActivityResult";

export function ActivityGroup({ activities }: { activities: AgentActivity[] }) {
	const actions = activities.filter(activity => activity.type !== "usage");
	if (!actions.length) return null;
	if (actions.length === 1) return <ActivityResult activity={actions[0]} />;
	const commands = actions.every(activity => /command/i.test(activity.title));
	const running = actions.some(activity => activity.status === "running");
	return <details className="activity-group" data-conversation-id={`activity:${actions[0].id}`}>
		<summary>{running ? <LoaderCircle size={14} /> : <Terminal size={14} />}<span className={running ? "live-shimmer" : undefined}>{commands ? running ? "Running commands" : "Ran commands" : running ? "Using tools" : "Used tools"}</span>{actions.length > 1 && <small>{actions.length}</small>}<ChevronRight size={13} className="activity-group-chevron" /></summary>
		<div className="activity-group-content">{actions.map(activity => <ActivityResult key={activity.id} activity={activity} />)}</div>
	</details>;
}
