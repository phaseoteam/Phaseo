import { useRef, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import type { ApprovalDecision, ApprovalRequest, Task } from "../../shared/workspace";
import { Textarea } from "../components/ui/textarea";
import { ProposedPlan } from "./ProposedPlan";
import { useWorkspace } from "../app/workspace";
import { Button } from "../components/ui/button";
import { QuestionPanel } from "./QuestionPanel";
import { AgentForm } from "../components/AgentForm";
import { threadToolLabels } from "../../shared/orchestration";

/** Reads the JSON arguments an approval describes, so they can be listed as fields rather than raw JSON. */
function approvalFields(description: string): [string, string][] | undefined {
	const json = description.slice(description.indexOf("{"));
	try {
		const value = JSON.parse(json) as unknown;
		if (!value || typeof value !== "object" || Array.isArray(value)) return;
		const label = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, letter => letter.toUpperCase());
		return Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "requestId").map(([key, field]) => [label(key), typeof field === "string" ? field : JSON.stringify(field)]);
	} catch { return; }
}

type Decide = (decision: ApprovalDecision, feedback?: string) => Promise<boolean>;
function useDecision(onDecision: Decide) {
	const inFlight = useRef(false);
	const [pending, setPending] = useState<ApprovalDecision>();
	const [error, setError] = useState("");
	async function decide(decision: ApprovalDecision, feedback?: string) {
		if (inFlight.current) return;
		inFlight.current = true; setPending(decision); setError("");
		try { if (!await onDecision(decision, feedback)) setError("The decision could not be sent. Try again."); }
		catch (reason) { setError(reason instanceof Error ? reason.message : "The decision could not be sent."); }
		finally { inFlight.current = false; setPending(undefined); }
	}
	return { pending, error, decide };
}

/** A proposed plan waiting for the person: Implement lets the agent go ahead; Revise sends what should change. */
function PlanCard({ approval, projectId, onDecision }: { approval: ApprovalRequest; projectId?: string; onDecision: Decide }) {
	const { pending, error, decide } = useDecision(onDecision);
	const [revising, setRevising] = useState(false);
	const [feedback, setFeedback] = useState("");
	return <ProposedPlan markdown={approval.description} projectId={projectId}>
		{error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
		{revising ? <div className="mt-2.5 flex flex-col gap-2">
			<Textarea aria-label="What should change in the plan" autoFocus placeholder="What should change?" value={feedback} disabled={!!pending} maxLength={20000} onChange={event => setFeedback(event.target.value)}
				onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && feedback.trim()) { event.preventDefault(); void decide("decline", feedback.trim()); } }} className="max-h-60 text-[13px]" />
			<div className="flex gap-2">
				<Button size="sm" disabled={!!pending || !feedback.trim()} onClick={() => void decide("decline", feedback.trim())}>{pending ? "Sending…" : "Send revision"}</Button>
				<Button variant="ghost" size="sm" disabled={!!pending} onClick={() => setRevising(false)}>Back</Button>
			</div>
		</div> : <div className="mt-2.5 flex gap-2">
			<Button size="sm" disabled={!!pending} onClick={() => void decide("accept")}>{pending === "accept" ? "Implementing…" : "Implement"}</Button>
			<Button variant="ghost" size="sm" disabled={!!pending} onClick={() => setRevising(true)}>Revise</Button>
		</div>}
	</ProposedPlan>;
}

function ApprovalCard({ title, description, always, never, onDecision }: { title?: string; description: string; always?: string; never?: string; onDecision: Decide }) {
	const { pending, error, decide } = useDecision(onDecision);
	const fields = approvalFields(description);
	// Text before the arguments, such as a warning that an interrupted action may already have run, stays visible.
	const preface = fields ? description.slice(0, description.indexOf("{")).trim() : "";
	const tool = title?.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");
	const heading = !title ? "Allow this action?" : /\s/.test(title) ? title : threadToolLabels[tool!] ?? `Allow ${tool}?`;
	return <section aria-label="Approval needed" aria-busy={!!pending} className="border-l-2 border-warning py-1 pl-3.5">
		<div className="flex items-center gap-2 text-[13px] font-semibold"><ShieldQuestion className="size-4 shrink-0 text-warning" />{heading}</div>
		{preface && <p data-selectable className="mt-1.5 text-[13px] whitespace-pre-wrap text-foreground/85">{preface}</p>}
		{fields
			? <dl data-selectable className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">{fields.map(([key, value]) => <div key={key} className="contents"><dt className="text-muted-foreground">{key}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}</dl>
			: <ScrollArea className="mt-1.5 max-h-48" viewportClassName="max-h-48"><pre data-selectable className="font-mono text-[11.5px] whitespace-pre-wrap text-foreground/85">{description}</pre></ScrollArea>}
		{error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
		<div className="mt-2.5 flex gap-2">
			<Button size="sm" disabled={!!pending} onClick={() => void decide("accept")}>{pending === "accept" ? "Allowing…" : "Allow"}</Button>
			{/* Lasting choices only where the agent offers them; its own wording is the tooltip. */}
			{always && <Button variant="outline" size="sm" title={always} disabled={!!pending} onClick={() => void decide("always")}>{pending === "always" ? "Allowing…" : "Always allow"}</Button>}
			<Button variant="ghost" size="sm" disabled={!!pending} onClick={() => void decide("decline")}>{pending === "decline" ? "Denying…" : "Deny"}</Button>
			{never && <Button variant="ghost" size="sm" title={never} disabled={!!pending} onClick={() => void decide("never")}>{pending === "never" ? "Denying…" : "Always deny"}</Button>}
		</div>
	</section>;
}

/** Pending approvals, questions and forms the agent is waiting on. */
export function Requests({ task, inlineQuestions = false }: { task: Task; inlineQuestions?: boolean }) {
	const { command } = useWorkspace();
	if (!task.approvals?.length && !(inlineQuestions && task.questions?.length) && !task.forms?.length) return null;
	return <div className="flex flex-col gap-3">
		{task.approvals?.map(approval => {
			const onDecision: Decide = async (decision, feedback) => !!await command({ type: "approval", id: task.id, approvalId: approval.id, decision, ...(feedback ? { feedback } : {}) });
			return approval.kind === "plan" ? <PlanCard key={approval.id} approval={approval} projectId={task.projectId} onDecision={onDecision} />
				: <ApprovalCard key={approval.id} title={approval.method} description={approval.description} always={approval.always} never={approval.never} onDecision={onDecision} />;
		})}
		{/* Questions sit above the composer (QuestionPanel); compare panes, which have no composer, show them here. */}
		{inlineQuestions && <QuestionPanel task={task} />}
		{task.forms?.map(request => <div key={request.id} className="legacy-request rounded-xl border border-border bg-card p-3"><AgentForm form={request.form} onAnswer={async (answer, declined) => !!await command({ type: "form-answer", id: task.id, requestId: request.id, answer, ...(declined ? { declined: true } : {}) })} /></div>)}
	</div>;
}
