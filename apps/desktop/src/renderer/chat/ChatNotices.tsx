import type { Task } from "../../shared/workspace";
import { WorktreeSetupNotice } from "./WorktreeSetupNotice";

/** Notices at the end of a chat that come from the app rather than the agent: worktree setup. */
export function ChatNotices({ task }: { task: Task }) {
	return <WorktreeSetupNotice task={task} />;
}
