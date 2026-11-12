import { useState } from "react";
import type { PullRequestCheck } from "../../../shared/pullRequestView";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { ScrollArea } from "../../components/ui/scroll-area";
import { cn } from "../../lib/utils";
import { CHECKS_ROLLUP_PRESENTATION, CheckStatusIcon, checkStatusLabel, Tip } from "./presentation";
import { groupChecks, summarizeChecks, type ChecksRollup } from "./pullRequestLogic";

/** The checks behind a rollup: problems and running checks first, passing ones behind "Show all". */
export function ChecksList({ checks, onOpen }: { checks: readonly PullRequestCheck[]; onOpen: (url: string) => void }) {
	const [showAll, setShowAll] = useState(false);
	const { attention, running, completed } = groupChecks(checks);
	const collapsible = attention.length + running.length > 0 && completed.length > 0;
	const visible = [...attention, ...running, ...(showAll || !collapsible ? completed : [])];
	if (!checks.length) return <p className="text-xs text-muted-foreground">No checks reported</p>;
	return <>
		<ScrollArea className="max-h-64" viewportClassName="max-h-64">
			<ul className="flex flex-col gap-1">
				{visible.map((check, index) => <li key={`${index}:${check.name}`} className="flex items-center gap-2 text-xs">
					<CheckStatusIcon status={check.status} />
					<Tip label={check.description ?? check.name}><span className="min-w-0 flex-1 truncate">{check.name}</span></Tip>
					<span className="shrink-0 text-muted-foreground">{checkStatusLabel(check)}</span>
					{check.url && <button type="button" className="shrink-0 text-primary hover:underline" onClick={() => onOpen(check.url!)}>Details</button>}
				</li>)}
			</ul>
		</ScrollArea>
		{collapsible && <Button variant="ghost" size="xs" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "Show all"}</Button>}
	</>;
}

/** The rollup icon in the header and the checks it opens; running checks read a while ago say they may have moved on. */
export function ChecksPopover({ rollup, checks, onOpen, className, stale = false }: { rollup: ChecksRollup; checks: readonly PullRequestCheck[]; onOpen: (url: string) => void; className?: string; stale?: boolean }) {
	const presentation = CHECKS_ROLLUP_PRESENTATION[rollup];
	return <Popover>
		<PopoverTrigger aria-label={`Checks: ${presentation.label}`} className={cn("inline-flex shrink-0 cursor-pointer items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)}>
			<presentation.Icon aria-hidden className={cn("size-3.5", presentation.toneClassName)} />
		</PopoverTrigger>
		<PopoverContent align="start" side="bottom" className="w-80 gap-2 p-3">
			<p className="text-sm font-medium">{presentation.label}</p>
			<p className="text-xs text-muted-foreground">{summarizeChecks(checks)}</p>
			{stale ? <p className="text-xs text-muted-foreground">Check details are out of date. Refresh the pull request to update them.</p> : <ChecksList checks={checks} onOpen={onOpen} />}
		</PopoverContent>
	</Popover>;
}
