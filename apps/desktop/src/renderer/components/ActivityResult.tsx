import { useLayoutEffect, useRef } from "react";
import { MessageContent } from "./MessageContent";
import { Brain, Check, ChevronRight, Circle, CircleDot, CircleSlash, Copy } from "lucide-react";
import type { AgentActivity } from "../../shared/workspace";
import { useTextCopy } from "./useTextCopy";

const labels = { tool: "Tool result", reasoning: "Reasoning", plan: "Plan", usage: "Usage", compaction: "Compaction result" };
export function ActivityResult({ activity, live = false }: { activity: AgentActivity; live?: boolean }) {
	const { status, copying, copy } = useTextCopy(activity.text);
	const steps = activity.type === "plan" ? activity.steps : undefined;
	const disclosure = useRef<HTMLDetailsElement>(null);
	const planOpened = useRef(false);
	const hasSteps = Boolean(steps?.length);
	useLayoutEffect(() => {
		if (hasSteps && !planOpened.current && disclosure.current) {
			disclosure.current.open = true;
			planOpened.current = true;
		}
	}, [hasSteps]);
	useLayoutEffect(() => { if (activity.type === "reasoning" && disclosure.current) disclosure.current.open = live; }, [live, activity.type]);
	const compaction = activity.type === "compaction" ? activity.compaction : undefined;
	const number = new Intl.NumberFormat();
	const toolLabels: Record<string, string> = { run_project_command: "Run command", read_project_file: "Read file", write_project_file: "Write file", list_project_files: "Browse files", load_skill: "Load skill", ask_user: "Ask question" };
	const title = toolLabels[activity.title] ?? activity.title.replaceAll('_', ' ');
	const statusOnly = activity.type === "compaction" && !activity.text;
	return <details data-conversation-id={`activity:${activity.id}`} className="task-activity" data-kind={activity.type} ref={disclosure}><summary>{activity.type === "reasoning" && <Brain size={14} />}<span className={live && activity.type === "reasoning" ? "live-shimmer" : undefined}>{activity.type === "reasoning" ? live || activity.status === "running" ? "Thinking…" : "Thinking" : title}{activity.type !== "reasoning" && activity.status ? ` · ${activity.status}` : ""}{steps?.length ? ` · ${steps.filter(step => step.status === "completed").length}/${steps.length} completed` : ""}</span><ChevronRight size={13} className="disclosure-chevron" /></summary><div className="activity-result">{statusOnly ? <p className="compaction-status">{activity.status === "running" ? "Compacting native context…" : activity.status === "completed" ? "Native context compacted." : "Native compaction failed."}</p> : <><div className="message-code-actions"><span aria-live="polite">{status === "failed" ? "Copy failed" : labels[activity.type]}</span><button type="button" disabled={copying || !activity.text} onClick={() => void copy()} aria-label={status === "copied" ? "Result copied" : "Copy result"}>{status === "copied" ? <Check size={14} /> : <Copy size={14} />}{status === "copied" ? "Copied" : "Copy result"}</button></div>{activity.type === "compaction" && activity.summary ? <><div className="compaction-summary"><MessageContent text={activity.summary} /></div><details className="compaction-source"><summary>Original result</summary><pre>{activity.text}</pre></details></> : compaction ? <><dl className="compaction-metrics"><div><dt>Before</dt><dd>{number.format(compaction.beforeTokens)} tokens</dd></div>{compaction.afterTokens !== undefined && <div><dt>After</dt><dd>{number.format(compaction.afterTokens)} tokens</dd></div>}{compaction.durationMs !== undefined && <div><dt>Duration</dt><dd>{number.format(compaction.durationMs)} ms</dd></div>}</dl><details className="compaction-source"><summary>Original result</summary><pre>{activity.text}</pre></details></> : steps?.length ? <>{activity.explanation && <p className="plan-explanation">{activity.explanation}</p>}<ol className="plan-steps">{steps.map((step, index) => <li key={index} data-status={step.status}>{step.status === "cancelled" ? <CircleSlash size={16} aria-hidden /> : step.status === "completed" ? <Check size={16} aria-hidden /> : step.status === "in_progress" ? <CircleDot size={16} aria-hidden /> : <Circle size={16} aria-hidden />}<span>{step.text}<small>{step.status === "in_progress" ? "In progress" : step.status === "completed" ? "Completed" : step.status === "cancelled" ? "Cancelled" : "Pending"}</small></span></li>)}</ol><details className="plan-source"><summary>Original result</summary><pre>{activity.text}</pre></details></> : activity.type === "reasoning" ? <MessageContent text={activity.text} /> : <pre>{activity.text}</pre>}</>}</div></details>;
}
