import { useRef, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { useWorkspace } from "../app/workspace";
import { Button } from "../components/ui/button";
import { QuestionForm } from "../components/QuestionForm";
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

function ApprovalCard({ title, description, onDecision }: { title?: string; description: string; onDecision: (decision: "accept" | "decline") => Promise<boolean> }) {
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
	const fields = approvalFields(description);
	const tool = title?.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");
	const heading = !title ? "Allow this action?" : /\s/.test(title) ? title : threadToolLabels[tool!] ?? `Allow ${tool}?`;
	return <section aria-label="Approval needed" aria-busy={!!pending} className="border-l-2 border-warning py-1 pl-3.5">
		<div className="flex items-center gap-2 text-[13px] font-semibold"><ShieldQuestion className="size-4 shrink-0 text-warning" />{heading}</div>
		{fields
			? <dl data-selectable className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">{fields.map(([key, value]) => <div key={key} className="contents"><dt className="text-muted-foreground">{key}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}</dl>
			: <pre data-selectable className="mt-1.5 max-h-48 overflow-auto font-mono text-[11.5px] whitespace-pre-wrap text-foreground/85">{description}</pre>}
		{error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
		<div className="mt-2.5 flex gap-2">
			<Button size="sm" disabled={!!pending} onClick={() => void decide("accept")}>{pending === "accept" ? "Allowing…" : "Allow"}</Button>
			<Button variant="ghost" size="sm" disabled={!!pending} onClick={() => void decide("decline")}>{pending === "decline" ? "Denying…" : "Deny"}</Button>
		</div>
	</section>;
}

/** Pending approvals, questions and forms the agent is waiting on. */
export function Requests({ task }: { task: Task }) {
	const { command } = useWorkspace();
	if (!task.approvals?.length && !task.questions?.length && !task.forms?.length) return null;
	return <div className="flex flex-col gap-3">
		{task.approvals?.map(approval => <ApprovalCard key={approval.id} title={approval.method} description={approval.description} onDecision={async decision => !!await command({ type: "approval", id: task.id, approvalId: approval.id, decision })} />)}
		{task.questions?.map(request => <div key={request.id} className="legacy-request rounded-xl border border-border bg-card p-3"><QuestionForm questions={request.questions} onAnswer={async answers => !!await command({ type: "answer", id: task.id, requestId: request.id, answers })} /></div>)}
		{task.forms?.map(request => <div key={request.id} className="legacy-request rounded-xl border border-border bg-card p-3"><AgentForm form={request.form} onAnswer={async answer => !!await command({ type: "form-answer", id: task.id, requestId: request.id, answer })} /></div>)}
	</div>;
}
