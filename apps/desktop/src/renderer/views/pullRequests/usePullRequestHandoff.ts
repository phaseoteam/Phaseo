import { useState } from "react";
import type { PullRequestView } from "../../../shared/pullRequestView";
import { useWorkspace } from "../../app/workspace";
import { handNewChatDraft } from "../../lib/newChatDraft";
import { showToast } from "../../components/ui/toast";
import { attachToComposer } from "../BrowserSurface";
import type { Mention } from "../../lib/mentions";
import { errorMessage } from "./presentation";
import { askPullRequestPrompt, explainPullRequestPrompt, findingKey, fixFindingPrompt, fixFindingsPrompt, handoffLabels, resolveConflictsPrompt, type PullRequestFinding } from "./pullRequestLogic";

export type HandoffKind = "checkout" | "checkout-here" | "ask" | "explain" | "fix" | "resolve-conflicts";
/** Hands a pull request chip to the open composer; false when no composer took it. */
export function attachPullRequest(view: Pick<PullRequestView, "number" | "title" | "url">) {
	const detail: { mentions: Mention[]; handled?: boolean } = { mentions: [{ kind: "pull-request", ref: view.url, label: `#${view.number} ${view.title}` }] };
	window.dispatchEvent(new CustomEvent("phaseo:composer-attach", { detail }));
	return Boolean(detail.handled);
}

/**
 * Pull request hand-offs. Each opens a new Code chat with its task in the composer for the person to read over and
 * send, rather than sending it for them: "Ask a question" and "Explain this PR" in the pull request's
 * project, "Check out", "Fix findings" and "Resolve conflicts" in a new worktree at the pull request's head, and
 * "Check out in this repository" on the project's own checkout, switched to the pull request's branch. One finding
 * goes to the open chat's composer when there is one ("Fix in this chat"), and to a new chat in a worktree otherwise.
 */
export function usePullRequestHandoff(projectId: string) {
	const { api, setOverview, setNewChatProjectId, setMode, select, selectedId } = useWorkspace();
	const [pending, setPending] = useState<HandoffKind>(), [pendingFinding, setPendingFinding] = useState<string>();
	const inThisChat = Boolean(selectedId);
	const openDraft = (target: string, text: string) => {
		setNewChatProjectId(target); setMode("code"); select(undefined);
		handNewChatDraft(text);
	};
	const worktree = async (view: PullRequestView, text: string) => {
		const result = await api!.pullRequestWorktree(projectId, view.number);
		setOverview(result.workspace);
		openDraft(result.projectId, text);
	};
	const run = async (kind: HandoffKind, view: PullRequestView) => {
		if (pending || pendingFinding || !api) return;
		setPending(kind);
		try {
			// With a chat open, "Ask a question" puts the pull request in its composer as a chip instead of starting a chat.
			if (kind === "ask") { if (!selectedId || !attachPullRequest(view)) openDraft(projectId, askPullRequestPrompt(view)); }
			else if (kind === "explain") openDraft(projectId, explainPullRequestPrompt(view));
			else if (kind === "checkout-here") {
				const result = await api.pullRequestCheckoutHere(projectId, view.number);
				setOverview(result.workspace);
				openDraft(result.projectId, "");
			}
			else await worktree(view, kind === "fix" ? fixFindingsPrompt(view) : kind === "resolve-conflicts" ? resolveConflictsPrompt(view) : "");
		} catch (reason) { showToast("error", kind.startsWith("checkout") ? "Could not check out this pull request" : "Could not open a chat for this pull request", errorMessage(reason)); }
		finally { setPending(undefined); }
	};
	/** Free text for the agent, such as marked lines and a request about them: the open chat takes it, or a new one. */
	const ask = (text: string) => {
		if (inThisChat && attachToComposer({ text })) { showToast("success", "Added to the chat"); return; }
		openDraft(projectId, text);
	};
	const fix = async (view: PullRequestView, finding: PullRequestFinding) => {
		if (pending || pendingFinding || !api) return;
		const prompt = fixFindingPrompt(view, finding);
		if (inThisChat && attachToComposer({ text: prompt })) { showToast("success", "Added to the chat"); return; }
		setPendingFinding(findingKey(finding));
		try { await worktree(view, prompt); }
		catch (reason) { showToast("error", "Could not open a chat for this finding", errorMessage(reason)); }
		finally { setPendingFinding(undefined); }
	};
	return { run, ask, fix, pending, pendingFinding, labels: handoffLabels(inThisChat) };
}
export type PullRequestHandoff = ReturnType<typeof usePullRequestHandoff>;
