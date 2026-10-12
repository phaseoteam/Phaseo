import { useRef, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { useWorkspace } from "../app/workspace";
import { Button } from "../components/ui/button";
import { QuestionForm } from "../components/QuestionForm";
import { AgentForm } from "../components/AgentForm";

function ApprovalCard({ description, onDecision }: { description: string; onDecision: (decision: "accept" | "decline") => Promise<boolean> }) {
	const inFlight = useRef(false);
	const [pending, setPending] = useState<"accept" | "decline">();
	const [error, setError] = useState("");
	async function decide(decision: "accept" | "decline") {
		if (inFlight.current) return;
		inFlight.current = true; setPending(decision); setError("");
		try { if (!await onDecision(decision)) setError("The decision could not be sent. Try again."); }
		catch (reason) { setError(reason instanceof Error ? reason.message : "The decision could not be sent."); }
		finally { inFlight.current = false; setPending(undefined); }
	}
	return <section aria-label="Approval needed" aria-busy={!!pending} className="rounded-xl border border-warning/40 bg-warning/8 p-3.5">
		<div className="flex items-start gap-3">
			<ShieldQuestion className="mt-0.5 size-4.5 shrink-0 text-warning" />
			<div className="min-w-0 flex-1">
				<p className="text-[13px] font-semibold">Allow this action?</p>
				<pre data-selectable className="mt-1.5 max-h-48 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[11.5px] whitespace-pre-wrap text-foreground/85">{description}</pre>
				{error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
			</div>
		</div>
		<div className="mt-3 flex justify-end gap-2">
			<Button variant="outline" size="sm" disabled={!!pending} onClick={() => void decide("decline")}>{pending === "decline" ? "Denying…" : "Deny"}</Button>
			<Button size="sm" disabled={!!pending} onClick={() => void decide("accept")}>{pending === "accept" ? "Allowing…" : "Allow"}</Button>
		</div>
	</section>;
}

/** Pending approvals, questions and forms the agent is waiting on. */
export function Requests({ task }: { task: Task }) {
	const { command } = useWorkspace();
	if (!task.approvals?.length && !task.questions?.length && !task.forms?.length) return null;
	return <div className="flex flex-col gap-3">
		{task.approvals?.map(approval => <ApprovalCard key={approval.id} description={approval.description} onDecision={async decision => !!await command({ type: "approval", id: task.id, approvalId: approval.id, decision })} />)}
		{task.questions?.map(request => <div key={request.id} className="legacy-request rounded-xl border border-border bg-card p-3"><QuestionForm questions={request.questions} onAnswer={async answers => !!await command({ type: "answer", id: task.id, requestId: request.id, answers })} /></div>)}
		{task.forms?.map(request => <div key={request.id} className="legacy-request rounded-xl border border-border bg-card p-3"><AgentForm form={request.form} onAnswer={async answer => !!await command({ type: "form-answer", id: task.id, requestId: request.id, answer })} /></div>)}
	</div>;
}
