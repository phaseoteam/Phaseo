import { ArrowUp, ArrowUpRight } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { lastRun, linkedItem, nextActions } from "../../../shared/actions";
import { currentStage, stageLabel } from "../../../shared/stages";
import type { FactorySnapshot, ItemAction, WorkItem } from "../../../shared/types";
import { StatusMark, statusLabel } from "../../components/Marks";
import { Button } from "../../components/ui/button";
import { Tip } from "../../components/ui/tooltip";
import { factory, href } from "../../lib/useFactory";
import { InlineMarkdown } from "../../components/Markdown";
import { cn } from "../../lib/utils";
import { errorText } from "../../components/AddRepo";


/** Runs one of an item's contextual actions. Navigation stays in the window; the rest goes to the store. */
export async function runAction(item: WorkItem, action: ItemAction): Promise<void> {
	if (action.id === "go-to" && action.target) window.location.hash = href({ page: "work", item: action.target });
	else if (action.id === "open-on-github") await factory().openExternal(item.url);
	else await factory().act(item.id, action);
}

export function ActionButton({ item, action, onError, size = "sm" }: { item: WorkItem; action: ItemAction; onError: (message: string | null) => void; size?: "sm" | "default" }) {
	const [busy, setBusy] = useState(false);
	// An action that asks first: the first press asks, a second one within a few seconds does it.
	const [asking, setAsking] = useState(false);
	useEffect(() => {
		if (!asking) return;
		const timer = setTimeout(() => setAsking(false), 5_000);
		return () => clearTimeout(timer);
	}, [asking]);
	const button = <Button variant={action.primary ? "default" : "outline"} size={size} disabled={busy} onClick={() => {
		if (action.confirm && !asking) return setAsking(true);
		setAsking(false);
		onError(null);
		setBusy(true);
		void runAction(item, action).catch((cause: unknown) => onError(errorText(cause))).finally(() => setBusy(false));
	}}>
		{asking ? `${action.confirm} Click again` : action.label}{!asking && (action.external || action.id === "open-on-github") && <ArrowUpRight className="size-3.5 opacity-70" />}
	</Button>;
	return action.detail ? <Tip label={action.external ? `${action.detail}. Changes GitHub.` : action.detail}>{button}</Tip> : button;
}

/** Where the item stands, in a sentence, and the buttons that move it along. */
export function NextSteps({ item, snapshot }: { item: WorkItem; snapshot: FactorySnapshot }) {
	const [error, setError] = useState<string | null>(null);
	const actions = nextActions(item, snapshot);
	const stage = currentStage(item);
	const state = stage && item.stages[stage.id];
	if (!actions.length || state?.status === "running" || state?.status === "queued") return null;
	const linked = linkedItem(item, snapshot.items);

	const status = state?.status ?? "done";
	// What the stage needs from the reporter, while it's waiting on them or before it asks.
	const asking = stage && (status === "waiting" || status === "needs-you") ? lastRun(item, stage.id, snapshot.runs)?.report?.ask : undefined;
	let title: string;
	let detail = state?.summary;
	if (!stage) {
		const verified = linked?.stages.verify.status === "done";
		const pullStage = linked && currentStage(linked);
		title = item.kind === "issue"
			? linked ? (verified ? `Fixed and verified in #${linked.number}` : `Fixed in #${linked.number}${pullStage ? `: ${pullStage.label.toLowerCase()} ${statusLabel(linked.stages[pullStage.id].status).toLowerCase()}` : ""}`) : "Fix passed"
			: "Reviewed and verified";
		detail = item.kind === "issue" ? (linked ? (verified ? linked.stages.verify.summary : linked.title) : item.stages.fix.summary) : item.stages.verify.summary;
	} else if (state?.status === "idle") {
		title = stage.id === stagesStart(item) ? "Not started" : `Ready for ${stageLabel(stage.id).toLowerCase()}`;
		detail = state.summary ?? (stage.id === stagesStart(item) ? `Nothing runs until you start it. ${stage.label} gives you ${stage.output.charAt(0).toLowerCase()}${stage.output.slice(1)}.` : `${stage.label} gives you ${stage.output.charAt(0).toLowerCase()}${stage.output.slice(1)}.`);
	} else {
		title = `${stage.label} ${statusLabel(state?.status ?? "idle").toLowerCase()}`;
	}

	return <section className={cn("mb-8 rounded-md border px-4 py-3.5", status === "needs-you" && "border-warning/40 bg-warning/[0.04]", status === "failed" && "border-destructive/40 bg-destructive/[0.04]", status === "waiting" && "border-info/40 bg-info/[0.04]")}>
		<div className="flex items-start gap-2.5">
			<StatusMark status={status} className="mt-0.5" />
			<div className="min-w-0 flex-1">
				<h2 className="text-sm font-semibold">{title}</h2>
				{detail && <p className="mt-0.5 text-sm text-muted-foreground"><InlineMarkdown source={detail} repo={item.repo} /></p>}
				{asking && <div className="mt-3">
					<div className="text-xs font-medium">{status === "waiting" ? "Asked the reporter" : "Needs from the reporter"}{item.asked ? <span className="font-normal text-muted-foreground"> · {item.asked.rounds === 1 ? "once" : `${item.asked.rounds} times`}</span> : null}</div>
					<ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground/90">{asking.map((entry) => <li key={entry}><InlineMarkdown source={entry} repo={item.repo} /></li>)}</ul>
				</div>}
				<div className="mt-3 flex flex-wrap items-center gap-2">
					{actions.map((action, index) => <ActionButton key={`${action.id}-${action.agentId ?? ""}-${index}`} item={item} action={action} onError={setError} />)}
				</div>
				{error && <p className="mt-2 text-xs text-destructive">{error}</p>}
			</div>
		</div>
	</section>;
}

function stagesStart(item: WorkItem) {
	return item.kind === "pull" ? "review" : "triage";
}

/** Talk to the agent: steer a run that's going, or reply to the last one so it carries on. */
export function Composer({ item, snapshot }: { item: WorkItem; snapshot: FactorySnapshot }) {
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	const runs = snapshot.runs.filter((run) => run.itemId === item.id).sort((a, b) => b.startedAt - a.startedAt);
	const running = runs.find((run) => run.status === "running");
	const last = running ?? runs[0];
	const agent = snapshot.agents.find((candidate) => candidate.id === (last?.agentId ?? item.assigneeId));
	const name = agent?.label ?? "the agent";
	const placeholder = running
		? agent?.harness === "codex" ? `Message ${name}. Codex reads it when this turn ends.` : `Message ${name} while it works`
		: last ? `Reply to ${stageLabel(last.stage)}. ${name} carries on where it stopped.` : `Tell ${name} something before it starts`;
	const send = () => {
		const message = text.trim();
		if (!message) return;
		setError(null);
		setText("");
		void factory().sendMessage(item.id, message).catch((cause: unknown) => {
			setText(message);
			setError(errorText(cause));
		});
	};
	const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	};
	return <div>
		<div className="flex items-end gap-2 rounded-md border bg-background py-1.5 pr-1.5 pl-3 focus-within:border-ring">
			<textarea value={text} rows={Math.min(6, Math.max(1, text.split("\n").length))} onChange={(event) => setText(event.target.value)} onKeyDown={onKey} placeholder={placeholder} className="min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground" />
			<Button size="icon-sm" aria-label="Send" disabled={!text.trim()} onClick={send}><ArrowUp className="size-4" /></Button>
		</div>
		{error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
	</div>;
}
