import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { PullRequestDetails } from "../../../shared/pullRequests";
import { useWorkspace } from "../../app/workspace";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { GitHubMark } from "../../components/GitHubMark";
import { handNewChatDraft } from "../../lib/newChatDraft";
import { cn } from "../../lib/utils";
import { parseCheckoutReference } from "./linkLogic";
import { errorMessage, pullRequestStatePresentation } from "./presentation";
import { useProjectRepository } from "./useProjectRepository";

/**
 * The pull request checkout dialog, opened from the branch menu: paste a pull request URL, a `gh pr checkout` command or a
 * number, see which pull request it is, then start a chat on it in this checkout (Local) or a new worktree.
 */
export function CheckoutPullRequestDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
	const { api, setOverview, setNewChatProjectId, setMode, select } = useWorkspace();
	const repository = useProjectRepository(projectId);
	const input = useRef<HTMLInputElement>(null);
	const [reference, setReference] = useState(""), [dirty, setDirty] = useState(false);
	const [debounced, setDebounced] = useState("");
	const [resolved, setResolved] = useState<{ number: number; details?: PullRequestDetails; error?: string }>();
	const [preparing, setPreparing] = useState<"local" | "worktree">(), [prepareError, setPrepareError] = useState("");
	useEffect(() => { if (!open) return; setReference(""); setDirty(false); setResolved(undefined); setPrepareError(""); const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); }); return () => cancelAnimationFrame(frame); }, [open]);
	useEffect(() => { const timer = setTimeout(() => setDebounced(reference), 450); return () => clearTimeout(timer); }, [reference]);
	const parsed = useMemo(() => parseCheckoutReference(reference, repository), [reference, repository]);
	const settled = useMemo(() => parseCheckoutReference(debounced, repository), [debounced, repository]);
	const number = settled && "number" in settled ? settled.number : undefined;
	useEffect(() => {
		if (!open || !api || number === undefined) return;
		let active = true;
		setResolved(current => current?.number === number ? current : { number });
		void api.pullRequest(projectId, number).then(details => { if (active) setResolved({ number, details }); }, reason => { if (active) setResolved({ number, error: errorMessage(reason) }); });
		return () => { active = false; };
	}, [open, api, projectId, number]);
	const current = parsed && "number" in parsed && resolved?.number === parsed.number ? resolved : undefined;
	const details = current?.details;
	const resolving = Boolean(parsed && "number" in parsed && !details && !current?.error);
	const validation = !dirty ? null : !reference.trim() ? "Paste a pull request URL, checkout command, or enter 123 / #123." : !parsed ? "Use a pull request URL, checkout command, 123, or #123." : "error" in parsed ? parsed.error : null;
	const error = validation ?? (prepareError || current?.error || null);
	const confirm = async (mode: "local" | "worktree") => {
		setDirty(true);
		if (!api || !details || preparing) return;
		setPreparing(mode); setPrepareError("");
		try {
			const result = mode === "local" ? await api.pullRequestCheckoutHere(projectId, details.number) : await api.pullRequestWorktree(projectId, details.number);
			setOverview(result.workspace); setNewChatProjectId(result.projectId); setMode("code"); select(undefined); handNewChatDraft("");
			onOpenChange(false);
		} catch (reason) { setPrepareError(errorMessage(reason)); }
		finally { setPreparing(undefined); }
	};
	const state = details ? pullRequestStatePresentation(details.state, details.draft) : undefined;
	return <Dialog open={open} onOpenChange={next => { if (!preparing) onOpenChange(next); }}>
		<DialogContent className="max-w-xl gap-4 p-5">
			<DialogHeader>
				<DialogTitle className="flex items-center"><span className="me-2 inline-flex"><GitHubMark /></span>Check out pull request</DialogTitle>
				<DialogDescription className="text-xs">Find a GitHub pull request, then start a chat on it in this checkout or in a dedicated worktree.</DialogDescription>
			</DialogHeader>
			<div className="flex flex-col gap-3">
				<label className="grid gap-1.5"><span className="text-xs font-medium text-foreground">Pull request</span>
					<Input ref={input} value={reference} placeholder="PR URL, checkout command, or #42" aria-label="Pull request URL, checkout command or number" className="text-sm"
						onChange={event => { setDirty(true); setReference(event.target.value); }}
						onKeyDown={event => { if (event.key !== "Enter" || event.nativeEvent.isComposing) return; event.preventDefault(); if (!resolving) void confirm("worktree"); }} />
				</label>
				{details && state && <div className="flex items-start justify-between gap-3 border-l-2 border-border/70 py-0.5 pl-3" data-checkout-preview="">
					<div className="min-w-0"><p className="truncate text-sm font-medium">{details.title}</p><p className="truncate text-xs text-muted-foreground">#{details.number} · {details.head} to {details.base}</p></div>
					<span className={cn("inline-flex shrink-0 items-center gap-1 text-xs", state.toneClassName)}><state.Icon aria-hidden className="size-3.5" />{state.label}</span>
				</div>}
				{resolving && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Finding pull request…</p>}
				{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
			</div>
			<DialogFooter>
				<Button type="button" size="sm" variant="outline" disabled={Boolean(preparing)} onClick={() => onOpenChange(false)}>Cancel</Button>
				<Button type="button" size="sm" variant="outline" disabled={!details || resolving || Boolean(preparing) || details.state !== "OPEN"} onClick={() => void confirm("local")}>{preparing === "local" ? "Preparing local…" : "Local"}</Button>
				<Button type="button" size="sm" disabled={!details || resolving || Boolean(preparing) || details.state !== "OPEN"} onClick={() => void confirm("worktree")}>{preparing === "worktree" ? "Preparing worktree…" : "Worktree"}</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>;
}
