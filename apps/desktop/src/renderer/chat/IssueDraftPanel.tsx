import { useEffect, useState } from "react";
import { CircleCheck, CircleDot, LoaderCircle } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { maximumIssueBody, maximumIssueTitle } from "../../shared/triage";
import { errorText } from "../app/workspace";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { MessageContent } from "../components/MessageContent";
import { ScrollArea } from "../components/ui/scroll-area";
import { showToast } from "../components/ui/toast";
import { settingsInput } from "../settings/SettingsLayout";
import { cn } from "../lib/utils";

/**
 * A triage chat's drafted issue, above the composer. Filing is always the person's click, never the agent's: it works the
 * same under Full access and Autopilot, which answer the agent's approvals but cannot press this button.
 */
export function IssueDraftPanel({ task }: { task: Task }) {
	const draft = task.issueDraft;
	const [reviewing, setReviewing] = useState(false);
	const [busy, setBusy] = useState(false);
	if (!draft || draft.status === "discarded") return null;
	if (draft.status === "filed") return <section aria-label="Filed issue" className="mx-auto flex w-full max-w-[760px] items-center gap-2 border-t border-border px-6 py-2.5 text-[13px]">
		<CircleCheck className="size-4 shrink-0 text-success" />
		<span className="min-w-0 truncate">Filed <button type="button" className="font-semibold text-primary hover:underline" onClick={() => void window.phaseoDesktop?.openExternal(draft.url!)}>{draft.repository}#{draft.number}</button>: {draft.title}</span>
	</section>;
	const discard = async () => {
		setBusy(true);
		try { await window.phaseoDesktop?.workspace.issueDraft(task.id, "discard"); } catch (reason) { showToast("error", "Could not discard the draft", errorText(reason)); } finally { setBusy(false); }
	};
	return <section aria-label="Issue draft" className="mx-auto w-full max-w-[760px] border-t border-border px-6 pt-3 pb-2">
		<div className="flex items-start gap-2.5">
			<CircleDot className="mt-0.5 size-4 shrink-0 text-success" />
			<div className="min-w-0 flex-1">
				<p className="text-xs text-muted-foreground">Issue draft for {draft.repository}. Nothing is filed until you choose to.</p>
				<p className="mt-0.5 truncate text-[13px] font-semibold">{draft.title}</p>
				<p className="mt-0.5 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{draft.body}</p>
			</div>
			<div className="flex shrink-0 gap-1.5">
				<Button variant="ghost" size="sm" disabled={busy} onClick={() => void discard()}>Discard</Button>
				<Button size="sm" disabled={busy} onClick={() => setReviewing(true)}>Review and file…</Button>
			</div>
		</div>
		<IssueDraftDialog key={draft.draftedAt} task={task} open={reviewing} onClose={() => setReviewing(false)} />
	</section>;
}

function IssueDraftDialog({ task, open, onClose }: { task: Task; open: boolean; onClose: () => void }) {
	const draft = task.issueDraft!;
	const [title, setTitle] = useState(draft.title);
	const [body, setBody] = useState(draft.body);
	const [preview, setPreview] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => { if (open) setError(""); }, [open]);
	const file = async () => {
		setBusy(true); setError("");
		try { await window.phaseoDesktop?.workspace.issueDraft(task.id, "file", { title, body }); onClose(); showToast("success", "Issue filed", draft.repository); }
		catch (reason) { setError(errorText(reason)); }
		finally { setBusy(false); }
	};
	const valid = title.trim().length > 0 && title.length <= maximumIssueTitle && body.trim().length > 0 && body.length <= maximumIssueBody;
	return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
		<DialogContent className="sm:max-w-2xl">
			<DialogHeader>
				<DialogTitle>File an issue on {draft.repository}</DialogTitle>
				<DialogDescription>The agent drafted this. Check it holds nothing private and edit what you like. It is filed under your GitHub account.</DialogDescription>
			</DialogHeader>
			<form onSubmit={event => { event.preventDefault(); if (valid) void file(); }} className="flex min-w-0 flex-col gap-2">
				<input value={title} disabled={busy} maxLength={maximumIssueTitle} onChange={event => setTitle(event.target.value)} aria-label="Issue title" className={cn(settingsInput, "h-9 rounded-md text-[13px] font-semibold")} />
				<div className="flex gap-1">
					<Button type="button" size="sm" variant={preview ? "secondary" : "ghost"} onClick={() => setPreview(true)}>Preview</Button>
					<Button type="button" size="sm" variant={preview ? "ghost" : "secondary"} onClick={() => setPreview(false)}>Edit</Button>
				</div>
				{preview
					? <ScrollArea className="h-[340px] rounded-md border border-border" viewportClassName="h-[340px]"><div data-selectable className="px-3 py-2 text-[13px]"><MessageContent text={body} /></div></ScrollArea>
					: <textarea value={body} disabled={busy} maxLength={maximumIssueBody} onChange={event => setBody(event.target.value)} aria-label="Issue body" className={cn(settingsInput, "h-[340px] resize-none rounded-md py-2 font-mono text-[12px] leading-relaxed")} />}
				{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
				<DialogFooter className="mt-2">
					<Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
					<Button type="submit" disabled={busy || !valid}>{busy && <LoaderCircle className="animate-spin" />}File issue</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	</Dialog>;
}
