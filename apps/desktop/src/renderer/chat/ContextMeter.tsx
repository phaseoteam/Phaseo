import { Layers } from "lucide-react";
import type { Task } from "../../shared/workspace";
import { formatRoundedCount } from "@phaseo/app-kit/format";
import { formatCost } from "../../shared/usageAmounts";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { contextUsage, latestTurnUsage, turnUsage } from "../lib/turnUsage";
import { cn } from "../lib/utils";

const tokens = (count: number) => formatRoundedCount(count, "en-US");

/**
 * The context meter beside the send button: how full the model's window was after the latest turn, with what that
 * turn processed and cost, and Compact where the harness can compact. Hidden when the harness does not report its window.
 */
export function ContextMeter({ task, onCompact }: { task: Pick<Task, "messages" | "activities">; onCompact?: () => void }) {
	const reports = latestTurnUsage(task.messages, task.activities ?? []);
	const usage = contextUsage(reports);
	if (!usage) return null;
	const share = Math.min(1, usage.used / usage.window), percent = Math.round(share * 100), turn = turnUsage(reports);
	const tone = share >= 0.9 ? "text-destructive" : share >= 0.8 ? "text-warning" : "text-muted-foreground";
	const radius = 7, circumference = 2 * Math.PI * radius;
	return <Popover>
		<PopoverTrigger openOnHover delay={300} render={<button type="button" aria-label={`Context window ${percent}% full`} className={cn("flex h-8 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium tabular-nums transition-colors hover:bg-muted data-popup-open:bg-muted", tone)} />}>
			<svg aria-hidden viewBox="0 0 18 18" className="size-4 -rotate-90"><circle cx="9" cy="9" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" /><circle cx="9" cy="9" r={radius} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - share)} strokeLinecap="round" /></svg>
			{percent}%
		</PopoverTrigger>
		<PopoverContent side="top" align="end" sideOffset={8} className="w-64 gap-2 p-3 text-xs">
			<p className="text-[13px] font-semibold">Context window</p>
			<p className="text-muted-foreground"><span className="font-medium text-foreground tabular-nums">{tokens(usage.used)}</span> of {tokens(usage.window)} tokens in use after the last turn ({percent}%).</p>
			{turn.Total !== undefined && <p className="text-muted-foreground">That turn processed {tokens(turn.Total)} tokens{turn.Cost ? ` and cost ${formatCost(turn.Cost)}` : ""}.</p>}
			<p className="text-muted-foreground">Phaseo compacts earlier messages by itself when the window nears its limit.</p>
			{onCompact && <button type="button" onClick={onCompact} className="flex h-7 items-center gap-1.5 self-start rounded-md px-2 font-medium text-foreground hover:bg-muted"><Layers className="size-3.5" />Compact now</button>}
		</PopoverContent>
	</Popover>;
}
