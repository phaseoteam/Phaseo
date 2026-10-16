import { Children, isValidElement, useState, type ReactNode } from "react";
import { CircleCheck, CircleDashed, CircleDot, CircleX, GitMerge, GitPullRequestArrow, GitPullRequestClosed, GitPullRequestDraft, LoaderCircle, Link2, TriangleAlert, Unlink2, UserCheck, UserRound, UserRoundX, type LucideIcon } from "lucide-react";
import { Tip } from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";
import type { PullRequest } from "../../../shared/pullRequests";
import type { PullRequestActor, PullRequestCheck, PullRequestCheckStatus } from "../../../shared/pullRequestView";
import { compactCount, isConflicting, isWorkflowApproval, pullRequestStateKey, type ChecksRollup, type PullRequestStateKey, type ReviewOutcome } from "./pullRequestLogic";

/** T3 Code's pull request glyphs and colours (pullRequestIcons.tsx), verbatim. */
export const PullRequestGlyph = { pullRequest: GitPullRequestArrow, reopen: GitPullRequestArrow, draft: GitPullRequestDraft, closed: GitPullRequestClosed, merged: GitMerge, conflicting: TriangleAlert, link: Link2, unlink: Unlink2 } as const;
export type PullRequestStatePresentation = { label: string; toneClassName: string; Icon: LucideIcon };
export const PULL_REQUEST_STATE_PRESENTATION: Record<PullRequestStateKey, PullRequestStatePresentation> = {
	open: { label: "Open", toneClassName: "text-emerald-600 dark:text-emerald-300/90", Icon: PullRequestGlyph.pullRequest },
	draft: { label: "Draft", toneClassName: "text-zinc-500 dark:text-zinc-400/80", Icon: PullRequestGlyph.draft },
	closed: { label: "Closed", toneClassName: "text-red-600 dark:text-red-300/90", Icon: PullRequestGlyph.closed },
	merged: { label: "Merged", toneClassName: "text-violet-600 dark:text-violet-300/90", Icon: PullRequestGlyph.merged },
};
/**
 * How a pull request's state reads anywhere it appears, including the pane tab that holds it:
 * `const { Icon, toneClassName, label } = pullRequestStatePresentation(state, draft)`.
 */
export function pullRequestStatePresentation(state: "OPEN" | "CLOSED" | "MERGED" | "open" | "closed" | "merged", draft: boolean): PullRequestStatePresentation { return PULL_REQUEST_STATE_PRESENTATION[pullRequestStateKey(state, draft)]; }

/** A tooltip around any element, the shape every glyph here uses. */
export { Tip };

const ghostTitleWidths = ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-2/5", "w-3/5", "w-1/2"], ghostMetaWidths = ["w-2/5", "w-1/3", "w-2/5", "w-1/4", "w-1/3", "w-2/5", "w-1/3"];
/** T3's PullRequestListGhost: rows in the list's own shape (glyph, title over meta, time over size), pulsing together. */
export function PullRequestListGhost({ rows = 7 }: { rows?: number }) {
	const bar = (className: string) => <span aria-hidden className={cn("block h-3 rounded bg-muted-foreground/15", className)} />;
	return <div role="status" aria-label="Loading pull requests" className="flex flex-col gap-0.5 motion-safe:animate-pulse">
		{Array.from({ length: rows }, (_, index) => <div key={index} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-2">
			{bar("size-4 rounded-full")}
			<div className="min-w-0 space-y-1.5">{bar(cn("h-3.5", ghostTitleWidths[index % ghostTitleWidths.length]))}{bar(cn("h-3", ghostMetaWidths[index % ghostMetaWidths.length]))}</div>
			<div className="flex flex-col items-end gap-1.5">{bar("w-12")}{bar("w-16")}</div>
		</div>)}
		<span className="sr-only">Loading pull requests…</span>
	</div>;
}

export function PullRequestStateGlyph({ state, draft, className }: { state: "OPEN" | "CLOSED" | "MERGED" | "open" | "closed" | "merged"; draft: boolean; className?: string }) {
	const presentation = pullRequestStatePresentation(state, draft);
	// The trigger stays a span: a row is itself a button and must not nest a control.
	return <Tip label={presentation.label}><span className="inline-flex shrink-0"><presentation.Icon role="img" aria-label={presentation.label} className={cn("size-4 shrink-0", presentation.toneClassName, className)} /></span></Tip>;
}
export function PullRequestConflictGlyph({ state, draft, mergeable, base, className }: { state: string; draft: boolean; mergeable?: string; base?: string; className?: string }) {
	if (!isConflicting({ state, draft, mergeable })) return null;
	const label = base ? `Conflicts with ${base}` : "Has conflicts";
	return <Tip label={label}><span className="inline-flex shrink-0"><TriangleAlert role="img" aria-label={label} className={cn("size-4 shrink-0 text-destructive", className)} /></span></Tip>;
}
/** The conflict warning rides the corner of the lifecycle glyph, so titles line up whether or not a row is blocked. */
export function PullRequestRowGlyph({ state, draft, mergeable, base }: { state: "OPEN" | "CLOSED" | "MERGED" | "open" | "closed" | "merged"; draft: boolean; mergeable?: string; base?: string }) {
	return <span className="flex w-4 shrink-0 flex-col items-center gap-0.5"><span className="relative inline-flex"><PullRequestStateGlyph state={state} draft={draft} /><span className="absolute -right-1 -bottom-1 inline-flex"><PullRequestConflictGlyph state={state} draft={draft} mergeable={mergeable} base={base} className="size-3 fill-background [stroke-width:2.5]" /></span></span></span>;
}

const Spinner = ({ className, ...props }: { className?: string; "aria-hidden"?: boolean }) => <LoaderCircle {...props} className={cn("animate-spin", className)} />;
export const CHECK_STATUS_PRESENTATION: Record<PullRequestCheckStatus, { label: string; Icon: LucideIcon | typeof Spinner; toneClassName: string }> = {
	pending: { label: "Running", Icon: Spinner, toneClassName: "text-amber-500" },
	"action-required": { label: "Awaiting action", Icon: CircleDot, toneClassName: "text-amber-600 dark:text-amber-400/90" },
	success: { label: "Passed", Icon: CircleCheck, toneClassName: "text-emerald-600 dark:text-emerald-300/90" },
	failure: { label: "Failed", Icon: CircleX, toneClassName: "text-destructive" },
	cancelled: { label: "Cancelled", Icon: CircleX, toneClassName: "text-destructive" },
	skipped: { label: "Skipped", Icon: CircleDashed, toneClassName: "text-muted-foreground/70" },
	neutral: { label: "Neutral", Icon: CircleDashed, toneClassName: "text-muted-foreground/70" },
};
export function checkStatusLabel(check: PullRequestCheck) { return isWorkflowApproval(check) ? "Awaiting approval" : CHECK_STATUS_PRESENTATION[check.status].label; }
export function CheckStatusIcon({ status }: { status: PullRequestCheckStatus }) { const presentation = CHECK_STATUS_PRESENTATION[status]; return <presentation.Icon aria-hidden className={cn("size-3.5 shrink-0", presentation.toneClassName)} />; }
/** GitHub's own headline for each rollup, so a reader who knows that page reads this one the same way. */
export const CHECKS_ROLLUP_PRESENTATION: Record<ChecksRollup, { label: string; Icon: LucideIcon; toneClassName: string }> = {
	passing: { label: "All checks have passed", Icon: CircleCheck, toneClassName: CHECK_STATUS_PRESENTATION.success.toneClassName },
	failing: { label: "Some checks were not successful", Icon: CircleX, toneClassName: "text-destructive" },
	pending: { label: "Some checks haven't completed yet", Icon: CircleDot, toneClassName: "text-amber-600 dark:text-amber-400/90" },
};
export function ChecksGlyph({ rollup }: { rollup: ChecksRollup }) {
	const presentation = CHECKS_ROLLUP_PRESENTATION[rollup];
	return <Tip label={presentation.label}><span className="inline-flex shrink-0"><presentation.Icon role="img" aria-label={presentation.label} className={cn("size-3.5", presentation.toneClassName)} /></span></Tip>;
}

const REVIEW_DECISION_PRESENTATION: Partial<Record<PullRequest["review"], { Icon: LucideIcon; label: string; toneClassName: string }>> = {
	approved: { Icon: UserCheck, label: "Approved", toneClassName: CHECK_STATUS_PRESENTATION.success.toneClassName },
	"changes-requested": { Icon: UserRoundX, label: "Changes requested", toneClassName: "text-amber-600/90 dark:text-amber-400/80" },
	required: { Icon: UserRound, label: "Awaiting review", toneClassName: "text-muted-foreground/60" },
};
export function ReviewDecisionGlyph({ decision }: { decision: PullRequest["review"] }) {
	const presentation = REVIEW_DECISION_PRESENTATION[decision];
	if (!presentation) return null;
	return <Tip label={presentation.label}><span className="inline-flex shrink-0"><presentation.Icon aria-hidden className={cn("size-3.5", presentation.toneClassName)} /><span className="sr-only">{presentation.label}</span></span></Tip>;
}

/** A verdict reads in the same green a passing check wears; the ring runs a shade stronger than the text. */
export const REVIEW_OUTCOME_PRESENTATION: Record<ReviewOutcome, { label: string; Icon: LucideIcon; toneClassName: string; ringClassName: string; staleRingClassName: string }> = {
	approved: { label: "Approved", Icon: CircleCheck, toneClassName: "text-emerald-600 dark:text-emerald-300/90", ringClassName: "ring-2 ring-emerald-500 dark:ring-emerald-400", staleRingClassName: "ring-2 ring-[color-mix(in_srgb,var(--color-emerald-500)_35%,var(--background))] dark:ring-[color-mix(in_srgb,var(--color-emerald-400)_35%,var(--background))]" },
	"changes-requested": { label: "Changes requested", Icon: CircleX, toneClassName: "text-destructive", ringClassName: "ring-2 ring-destructive", staleRingClassName: "ring-2 ring-[color-mix(in_srgb,var(--destructive)_35%,var(--background))]" },
	dismissed: { label: "Review dismissed", Icon: CircleDashed, toneClassName: "text-muted-foreground/70", ringClassName: "ring-2 ring-muted-foreground/60", staleRingClassName: "ring-2 ring-[color-mix(in_srgb,var(--muted-foreground)_30%,var(--background))]" },
};
export const reviewOutcomeStaleLabel = (outcome: ReviewOutcome) => `${REVIEW_OUTCOME_PRESENTATION[outcome].label} earlier changes`;
export function ReviewOutcomeIcon({ outcome, className }: { outcome: ReviewOutcome; className?: string }) { const presentation = REVIEW_OUTCOME_PRESENTATION[outcome]; return <presentation.Icon aria-hidden className={cn("size-3.5 shrink-0", presentation.toneClassName, className)} />; }
export function ReviewOutcomeLabel({ outcome }: { outcome: ReviewOutcome }) { const presentation = REVIEW_OUTCOME_PRESENTATION[outcome]; return <span className={cn("inline-flex items-center gap-1 text-xs font-medium", presentation.toneClassName)}><presentation.Icon aria-hidden className="size-3" />{presentation.label}</span>; }

export function ActorAvatar({ actor, className }: { actor: PullRequestActor | null; className?: string }) {
	const login = actor?.login ?? "ghost", url = actor?.avatarUrl;
	const [failed, setFailed] = useState<string>();
	// Not every account has an avatar, and the request can fail offline.
	if (!url || failed === url) return <span aria-hidden className={cn("flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-3xs font-medium text-muted-foreground", className)}>{login.slice(0, 1).toUpperCase()}</span>;
	return <img aria-hidden alt="" src={url} loading="lazy" referrerPolicy="no-referrer" className={cn("size-4 shrink-0 rounded-full bg-muted object-cover", className)} onError={() => setFailed(url)} />;
}
export function ActorLabel({ actor, variant = "label", className }: { actor: PullRequestActor | null; variant?: "label" | "avatar"; className?: string }) {
	const login = actor?.login ?? "ghost";
	return <Tip label={login}><span className={cn("flex min-w-0 shrink items-center", variant === "label" && "gap-1.5", className)}><ActorAvatar actor={actor} /><span className={variant === "label" ? "truncate font-medium text-foreground" : "sr-only"}>{login}</span></span></Tip>;
}

/** Added and removed lines; left out when the host reported neither, so it never reads as an empty change. */
export function DiffStat({ additions, deletions, className }: { additions: number; deletions: number; className?: string }) {
	if (!additions && !deletions) return null;
	return <span className={cn("inline-flex items-baseline gap-1 tabular-nums", className)}><span className="text-emerald-600 dark:text-emerald-400">+{compactCount(additions)}</span><span className="text-red-600 dark:text-red-400">-{compactCount(deletions)}</span></span>;
}
/** Dot-separated metadata that only draws a dot between the segments that survive. */
export function MetaLine({ children, className }: { children: ReactNode; className?: string }) {
	const segments = Children.toArray(children);
	return <span className={cn("flex min-w-0 items-center gap-1.5", className)}>{segments.flatMap((segment, index) => index === 0 ? [segment] : [<span aria-hidden className="shrink-0 text-muted-foreground/50" key={`separator:${isValidElement(segment) ? String(segment.key) : String(segment)}`}>·</span>, segment])}</span>;
}
/** Cuts a branch or repository name in the middle, where names from one owner differ. */
export function MiddleTruncate({ value, className, limit = 32 }: { value: string; className?: string; limit?: number }) {
	const shown = value.length <= limit ? value : `${value.slice(0, Math.ceil(limit / 2) - 1)}…${value.slice(-Math.floor(limit / 2))}`;
	return <span className={cn("min-w-0 truncate", className)} aria-label={shown === value ? undefined : value}>{shown}</span>;
}

export function errorMessage(reason: unknown) { return (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""); }
