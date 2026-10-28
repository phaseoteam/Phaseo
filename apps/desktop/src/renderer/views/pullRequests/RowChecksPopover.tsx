import { useEffect, useState, type ReactElement } from "react";
import type { PullRequestCheck } from "../../../shared/pullRequestView";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { cn } from "../../lib/utils";
import { ChecksList } from "./ChecksPopover";
import { CHECKS_ROLLUP_PRESENTATION, errorMessage } from "./presentation";
import { checksCountLabel } from "./checksLogic";
import { summarizeChecks, type ChecksRollup } from "./pullRequestLogic";

/** Mounted by the popup, so a page of rows costs no reads until somebody opens one (T3's LazyChecksBody). */
function LazyChecks({ projectId, number, onOpen }: { projectId: string; number: number; onOpen: (url: string) => void }) {
	const [state, setState] = useState<{ checks?: PullRequestCheck[]; error?: string }>({});
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		if (!api) { setState({ error: "Open the desktop app to read checks." }); return; }
		let active = true;
		void api.pullRequestView(projectId, number).then(view => { if (active) setState({ checks: view.checkRuns }); }, reason => { if (active) setState({ error: errorMessage(reason) }); });
		return () => { active = false; };
	}, [projectId, number]);
	if (state.error) return <p className="text-xs text-muted-foreground">{state.error}</p>;
	if (!state.checks) return <p className="text-xs text-muted-foreground">Loading checks…</p>;
	return <><p className="text-xs text-muted-foreground">{summarizeChecks(state.checks)}</p><ChecksList checks={state.checks} onOpen={onOpen} /></>;
}

/**
 * A row's checks (T3's PullRequestChecksPopover outside the detail header). The icon form sits on a list row that
 * knows only the rollup and reads the checks when opened; the count form ("2/5" running, "1 failed") is given them.
 */
export function RowChecksPopover({ rollup, projectId, number, checks, variant = "icon", render, className }: { rollup: ChecksRollup; projectId: string; number: number; checks?: readonly PullRequestCheck[]; variant?: "icon" | "count"; render?: ReactElement; className?: string }) {
	const presentation = CHECKS_ROLLUP_PRESENTATION[rollup];
	const open = (url: string) => { void window.phaseoDesktop?.workspace.openLink(url); };
	const count = checks ? checksCountLabel(checks) : null, summary = checks ? summarizeChecks(checks) : null;
	// A list row is itself a button, so the icon trigger is a span; the click stops here so it does not open the row.
	return <Popover>
		<PopoverTrigger nativeButton={variant === "count"} aria-label={variant === "count" ? `Open checks: ${summary ?? presentation.label}` : `Checks: ${presentation.label}`}
			render={variant === "count" ? render ?? <Button variant="ghost" size="xs" className={className} /> : <span role="button" tabIndex={0} className={cn("inline-flex shrink-0 cursor-pointer items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)} />}
			onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
			<presentation.Icon aria-hidden className={cn("size-3.5", presentation.toneClassName)} />
			{variant === "count" && count && <span className="tabular-nums">{count}</span>}
		</PopoverTrigger>
		<PopoverContent align="start" side="bottom" className="w-80 gap-2 p-3" onClick={event => event.stopPropagation()}>
			<p className="text-sm font-medium">{presentation.label}</p>
			{checks ? <>{summary && <p className="text-xs text-muted-foreground">{summary}</p>}<ChecksList checks={checks} onOpen={open} /></> : <LazyChecks projectId={projectId} number={number} onOpen={open} />}
		</PopoverContent>
	</Popover>;
}
