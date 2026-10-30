import { ArrowRight, ChevronRight, MessagesSquare, Paperclip, Play, RotateCcw, Square } from "lucide-react";
import type { CSSProperties } from "react";
import { lastRun, linkedItem } from "../../../shared/factory/actions";
import { agentForStage } from "../../../shared/factory/intake";
import { countFiles } from "../../../shared/factory/report";
import { stagesFor } from "../../../shared/factory/stages";
import type { FactorySnapshot, Run, StageId, StageStatus, WorkItem } from "../../../shared/factory/types";
import { AgentMark, ItemMark, StatusMark, statusLabel } from "../components/Marks";
import { Button } from "../../components/ui/button";
import { duration } from "../lib/format";
import { useFactoryNav, useNow } from "../lib/useFactory";
import { FactoryLink } from "../components/FactoryLink";
import { Tip } from "../../components/ui/tooltip";
import { InlineMarkdown } from "../components/Markdown";
import { cn } from "../../lib/utils";

/** "2 screenshots and 1 log", or the number of checks it ran. */
function proofLine(run: Run | undefined): string | null {
	const report = run?.report;
	if (!report) return null;
	const files = countFiles(report.files);
	const checks = report.notes.length ? `${report.notes.length} ${report.notes.length === 1 ? "check" : "checks"}` : "";
	return [files, checks].filter(Boolean).join(", ") || null;
}

/** An issue's last step: the pull request its fix became, and how far that has got. */
function PullRequestCard({ item, snapshot }: { item: WorkItem; snapshot: FactorySnapshot }) {
	const pull = linkedItem(item, snapshot.items);
	const fixed = item.stages.fix.status === "done";
	const stages = pull ? stagesFor(pull) : [];
	const status: StageStatus = !pull ? (fixed ? "needs-you" : "idle") : stages.some((stage) => pull.stages[stage.id].status === "running") ? "running" : stages.every((stage) => pull.stages[stage.id].status === "done") ? "done" : stages.some((stage) => ["needs-you", "failed"].includes(pull.stages[stage.id].status)) ? "needs-you" : "idle";
	const className = cn("relative flex min-h-40 flex-col gap-2 bg-background bg-linear-to-b from-muted/20 to-muted/20 p-4", status === "running" && "from-info/[0.04] to-info/[0.04]");
	const body = <>
		<div className="flex items-center gap-2">
			<StatusMark status={status} />
			<span className="text-sm font-semibold">Pull request</span>
		</div>
		<div className="text-2xs text-muted-foreground">{pull ? `#${pull.number}${pull.state === "draft" ? " · Draft" : ""}` : "Review and verify"}</div>
		{pull
			? <div className="space-y-1">
				{stages.map((stage) => <div key={stage.id} className="flex items-center gap-1.5 text-xs"><StatusMark status={pull.stages[stage.id].status} className="size-3.5" /><span>{stage.label}</span><span className="text-muted-foreground">{statusLabel(pull.stages[stage.id].status).toLowerCase()}</span></div>)}
			</div>
			: <p className="text-xs leading-relaxed text-muted-foreground/70">{fixed ? "Fix passed. Open a draft pull request with its proof." : snapshot.settings.playbooks.issue.openPullRequest ? "Opens as a draft when Fix passes, then gets reviewed and verified." : "Waits for you to open it when Fix passes."}</p>}
		<div className="flex-1" />
		{pull && <span className="flex items-center gap-2 text-xs font-medium text-foreground/80 group-hover:text-foreground">
			<ItemMark item={pull} className="size-4" />
			<span className="min-w-0 flex-1 truncate underline-offset-2 group-hover:underline">Open pull request #{pull.number}</span>
			<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
		</span>}
	</>;
	// Once there's a pull request the whole card goes to it.
	return pull
		? <FactoryLink to={{ item: pull.id }} className={cn(className, "group cursor-pointer hover:from-accent hover:to-accent hover:ring-1 hover:ring-foreground/15 hover:ring-inset")}>{body}</FactoryLink>
		: <div className={className}>{body}</div>;
}

/** The item's stages left to right, like a deployment's build steps. Issues end in the pull request they become. */
export function Pipeline({ item, snapshot, onRun, onCancel, onOpenRun }: { item: WorkItem; snapshot: FactorySnapshot; onRun: (stage: StageId) => void; onCancel: (run: Run) => void; onOpenRun: (run: Run) => void }) {
	const now = useNow();
	const { openThread } = useFactoryNav();
	const stages = stagesFor(item);
	const columns = stages.length + (item.kind === "issue" ? 1 : 0);
	// Cards sit on a hairline gap over the border colour, so they can go two to a row when the page is narrow.
	return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border @3xl:grid-cols-(--stage-columns)" style={{ "--stage-columns": `repeat(${columns}, minmax(0, 1fr))` } as CSSProperties}>
		{stages.map((stage, index) => {
			const state = item.stages[stage.id];
			const agent = snapshot.agents.find((candidate) => candidate.id === (state.agentId ?? agentForStage(item, stage.id, snapshot.settings.playbooks[item.kind])));
			const run = lastRun(item, stage.id, snapshot.runs) ?? snapshot.runs.find((candidate) => candidate.id === state.runId);
			const blocked = stage.after.some((previous) => stages.some((candidate) => candidate.id === previous) && !["done", "skipped"].includes(item.stages[previous].status));
			const elapsed = state.startedAt ? (state.finishedAt ?? now) - state.startedAt : undefined;
			const proof = state.status !== "running" ? proofLine(run) : null;
			return <div key={stage.id} className={cn("relative flex min-h-40 flex-col gap-2 bg-background p-4", state.status === "running" && "bg-linear-to-b from-info/[0.04] to-info/[0.04]")}>
				{state.status === "running" && <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-info/20"><div className="factory-sweep h-full w-2/5 bg-info" /></div>}
				<div className="flex items-center gap-2">
					<StatusMark status={state.status} />
					<span className="text-sm font-semibold">{stage.label}</span>
					<span className="flex-1" />
					{elapsed !== undefined && <span className="text-2xs text-muted-foreground tabular-nums">{duration(elapsed)}</span>}
					{index < columns - 1 && <ChevronRight className="absolute top-4 -right-2 z-10 hidden size-4 rounded-[4px] bg-background text-muted-foreground/60 @3xl:block" />}
				</div>
				<div className="text-2xs text-muted-foreground">{state.status === "idle" ? stage.output : run?.report?.verdict && state.status !== "running" ? run.report.verdict : statusLabel(state.status)}</div>
				<p className={cn("line-clamp-3 text-xs leading-relaxed", state.summary ? "text-foreground/90" : "text-muted-foreground/70")}>
					{state.summary ? <InlineMarkdown source={state.summary} repo={item.repo} /> : (state.status === "running" ? run?.log.filter((line) => line.kind === "tool" || line.kind === "text").at(-1)?.text ?? "Starting…" : blocked ? `Waits for ${stage.after.map((id) => stages.find((candidate) => candidate.id === id)?.label ?? id).join(" and ")}` : "Ready to run")}
				</p>
				{proof && <span className="flex items-center gap-1 text-2xs text-muted-foreground"><Paperclip className="size-3" />{proof}</span>}
				<div className="flex-1" />
				<div className="flex items-center gap-2">
					<AgentMark agent={agent} className="size-4" />
					<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{agent?.label ?? "Unassigned"}</span>
					{run?.threadId && <Tip label="Open this stage's thread in Code"><Button variant="ghost" size="icon-xs" aria-label={`Open ${stage.label} thread`} onClick={() => openThread(run.threadId!)}><MessagesSquare /></Button></Tip>}
					{state.status === "running" && run
						? <Button variant="outline" size="xs" onClick={() => onCancel(run)}><Square className="size-3" />Stop</Button>
						: run && state.status !== "idle" && state.status !== "queued"
							? <>
								<Button variant="ghost" size="xs" onClick={() => onOpenRun(run)}>Log</Button>
								<Button variant="ghost" size="icon-xs" aria-label={`Run ${stage.label} again`} onClick={() => onRun(stage.id)}><RotateCcw /></Button>
							</>
							: state.status === "skipped" ? null
								: state.status !== "idle" && state.status !== "queued" ? <Button variant="ghost" size="icon-xs" aria-label={`Run ${stage.label} again`} onClick={() => onRun(stage.id)}><RotateCcw /></Button>
								: <Button variant={blocked ? "ghost" : "outline"} size="xs" disabled={!agent} onClick={() => onRun(stage.id)}><Play className="size-3" />Run</Button>}
				</div>
			</div>;
		})}
		{item.kind === "issue" && <PullRequestCard item={item} snapshot={snapshot} />}
	</div>;
}
