import { Check, Copy } from "lucide-react";
import type { AgentActivity } from "../../shared/workspace";
import { useTextCopy } from "./useTextCopy";

const labels = { tool: "Tool result", reasoning: "Reasoning", plan: "Plan", usage: "Usage" };
export function ActivityResult({ activity }: { activity: AgentActivity }) {
	const { status, copying, copy } = useTextCopy(activity.text);
	return <details className="task-activity"><summary>{activity.title}{activity.status ? ` · ${activity.status}` : ""}</summary><div className="activity-result"><div className="message-code-actions"><span aria-live="polite">{status === "failed" ? "Copy failed" : labels[activity.type]}</span><button type="button" disabled={copying || !activity.text} onClick={() => void copy()} aria-label={status === "copied" ? "Result copied" : "Copy result"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy result"}</button></div><pre>{activity.text}</pre></div></details>;
}
