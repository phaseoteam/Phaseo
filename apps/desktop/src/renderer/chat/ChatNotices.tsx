import type { Task } from "../../shared/workspace";
import { UsageLimitNotice } from "./UsageLimitNotice";
import { WorktreeSetupNotice } from "./WorktreeSetupNotice";

/** Notices at the end of a chat that come from the app rather than the agent: worktree setup and usage limits. */
export function ChatNotices({ task }: { task: Task }) {
	return <>
		<WorktreeSetupNotice task={task} />
		<UsageLimitNotice task={task} />
	</>;
}
