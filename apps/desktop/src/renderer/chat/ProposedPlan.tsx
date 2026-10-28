import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, ListChecks } from "lucide-react";
import { MessageContent } from "../components/MessageContent";
import { useTextCopy } from "../components/useTextCopy";
import { cn } from "../lib/utils";

/** The plan's own first heading, as T3 Code titles its plan card. */
export function proposedPlanTitle(markdown: string) {
	return markdown.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1]?.trim() || "Proposed plan";
}

/** Long plans start folded to their first lines, as in T3 Code. */
export const planFolds = (markdown: string) => markdown.length > 900 || markdown.split("\n").length > 20;

/** A proposed plan rendered as Markdown under a left rule, with copy and fold controls; actions or its outcome go underneath. */
export function ProposedPlan({ markdown, projectId, status, children }: { markdown: string; projectId?: string; status?: string; children?: ReactNode }) {
	const [expanded, setExpanded] = useState(false);
	const { status: copied, copying, copy } = useTextCopy(markdown);
	const folds = planFolds(markdown);
	const folded = folds && !expanded;
	return <section aria-label="Proposed plan" className="border-l-2 border-primary/60 py-1 pl-3.5">
		<div className="flex items-center gap-2 text-[13px]">
			<ListChecks className="size-4 shrink-0 text-primary" />
			<span className="shrink-0 font-semibold">Plan</span>
			<span className="min-w-0 truncate text-muted-foreground">{proposedPlanTitle(markdown)}</span>
			{status && <span className="shrink-0 text-xs text-muted-foreground">· {status}</span>}
			<button type="button" aria-label={copied === "copied" ? "Copied" : "Copy plan"} title={copied === "copied" ? "Copied" : "Copy plan"} disabled={copying} onClick={() => void copy()} className="ml-auto grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">{copied === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button>
		</div>
		<div className={cn("relative mt-2", folded && "max-h-72 overflow-hidden")}>
			<div data-selectable className="text-[14px] leading-relaxed"><MessageContent text={markdown} projectId={projectId} /></div>
			{folded && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-background to-transparent" />}
		</div>
		{folds && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="mt-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"><ChevronDown className={cn("size-3.5 transition-transform", !expanded && "-rotate-90")} />{expanded ? "Collapse plan" : "Expand plan"}</button>}
		{children}
	</section>;
}
