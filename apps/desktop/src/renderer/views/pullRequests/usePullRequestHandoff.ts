import { useState } from "react";
import type { PullRequestView } from "../../../shared/pullRequestView";
import { useWorkspace } from "../../app/workspace";
import { handNewChatDraft } from "../../lib/newChatDraft";
import { errorMessage } from "./presentation";
import { askPullRequestPrompt, explainPullRequestPrompt, fixFindingsPrompt } from "./pullRequestLogic";

export type HandoffKind = "checkout" | "checkout-here" | "ask" | "explain" | "fix";

/**
 * T3's pull request hand-offs. Each opens a new Code chat with its task in the composer for the person to read over and
 * send, as T3 does, rather than sending it for them: "Ask a question" and "Explain this PR" in the pull request's
 * project, "Check out" and "Fix findings" in a new worktree at the pull request's head, and "Check out in this
 * repository" on the project's own checkout, switched to the pull request's branch.
 */
export function usePullRequestHandoff(projectId: string) {
	const { api, setOverview, setNewChatProjectId, setMode, select } = useWorkspace();
	const [pending, setPending] = useState<HandoffKind>(), [error, setError] = useState("");
	const openDraft = (target: string, text: string) => {
		setNewChatProjectId(target); setMode("code"); select(undefined);
		handNewChatDraft(text);
	};
	const run = async (kind: HandoffKind, view: PullRequestView) => {
		if (pending || !api) return;
		setPending(kind); setError("");
		try {
			if (kind === "ask") openDraft(projectId, askPullRequestPrompt(view));
			else if (kind === "explain") openDraft(projectId, explainPullRequestPrompt(view));
			else if (kind === "checkout-here") {
				const result = await api.pullRequestCheckoutHere(projectId, view.number);
				setOverview(result.workspace);
				openDraft(result.projectId, "");
			}
			else {
				const result = await api.pullRequestWorktree(projectId, view.number);
				setOverview(result.workspace);
				openDraft(result.projectId, kind === "fix" ? fixFindingsPrompt(view) : "");
			}
		} catch (reason) { setError(errorMessage(reason)); }
		finally { setPending(undefined); }
	};
	return { run, pending, error, clearError: () => setError("") };
}
