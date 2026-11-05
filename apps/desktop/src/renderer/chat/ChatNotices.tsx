import type { Task } from "../../shared/workspace";
import { SecretRequestNotice } from "./SecretRequestNotice";
import { UsageLimitNotice } from "./UsageLimitNotice";
import { WorktreeSetupNotice } from "./WorktreeSetupNotice";
import { BranchChangedNotice } from "./BranchChangedNotice";
import { OperatorNotice } from "./OperatorNotice";
import { ProviderStatusNotice } from "./ProviderStatusNotice";

/** Notices at the end of a chat that come from the app rather than the agent: worktree setup, a changed branch, secret requests, usage limits and the operator's state. */
export function ChatNotices({ task }: { task: Task }) {
	return <>
		<WorktreeSetupNotice task={task} />
		<BranchChangedNotice task={task} />
		<SecretRequestNotice task={task} />
		<ProviderStatusNotice task={task} />
		<UsageLimitNotice task={task} />
		<OperatorNotice task={task} />
	</>;
}
