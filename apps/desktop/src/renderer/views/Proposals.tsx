import { useWorkspace } from "../app/workspace";
import { PullRequestListSurface } from "./pullRequests";

/** The pane's pull request surface until each pull request gets its own pane tab: the chat's links and the project's open list. */
export function Proposals({ initialProjectId }: { initialProjectId?: string } = {}) {
	const { overview, selectedId } = useWorkspace();
	const task = selectedId ? overview.tasks.find(value => value.id === selectedId) : undefined;
	return <PullRequestListSurface projectId={initialProjectId ?? ""} taskId={task?.id} />;
}
