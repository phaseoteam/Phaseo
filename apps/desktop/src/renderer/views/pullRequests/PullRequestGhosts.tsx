import type { ReactNode } from "react";
import { ExternalLink, MoreHorizontal, RefreshCw } from "lucide-react";
import type { PullRequestLinkSnapshot } from "../../../shared/pullRequestView";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { ActorLabel, DiffStat, MetaLine, PullRequestGlyph, pullRequestStatePresentation } from "./presentation";
import { formatRelativeTime } from "@phaseo/app-kit/format";
import { segmentedGroup } from "./segmented";

const Bar = ({ className }: { className?: string }) => <span aria-hidden className={cn("block h-3 rounded bg-muted-foreground/15", className)} />;
const tabs = ["Summary", "Guide", "Timeline", "Code"];

/** Placeholder people and comment rows while a conversation loads. */
export function ConversationGhost({ rows = 3 }: { rows?: number }) {
	return <div aria-hidden className="space-y-4 px-4 py-3 motion-safe:animate-pulse">
		{Array.from({ length: rows }, (_, index) => <div key={index} className="space-y-2 border-l-2 border-border/60 pl-3">
			<span className="flex items-center gap-2"><Bar className="size-4 rounded-full" /><Bar className="w-20" /><Bar className="w-10" /></span>
			<Bar className={index % 2 ? "w-3/5" : "w-4/5"} /><Bar className="w-2/5" />
		</div>)}
	</div>;
}
export function PeopleGhost() {
	return <div aria-hidden className="space-y-2 px-4 pt-2.5 pb-1 motion-safe:animate-pulse">
		{[0, 1].map(index => <div key={index} className="grid min-h-6 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2"><Bar className="w-16" /><span className="flex items-center gap-1"><Bar className="size-4 rounded-full" /><Bar className="size-4 rounded-full" /></span></div>)}
	</div>;
}

/**
 * The header in its own shape while the pull request loads, filled in from what the chat
 * last saw of it when it is linked, so the title and state do not flash in.
 */
export function PullRequestDetailGhost({ number, seed, repository, onBack, onOpen }: { number: number; seed?: PullRequestLinkSnapshot; repository?: string; onBack?: ReactNode; onOpen?: () => void }) {
	const presentation = seed ? pullRequestStatePresentation(seed.state, seed.draft) : undefined;
	return <div role="status" aria-label="Loading pull request" className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
		<div className="grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 border-b border-border/60">
			<div className="flex h-7 min-w-0 items-center gap-1 pl-4 text-sm text-muted-foreground sm:text-xs">
				{onBack}
				{repository ? <span className="min-w-0 truncate font-medium">{repository}</span> : <Bar className="w-24" />}
				{onOpen ? <button type="button" onClick={onOpen} aria-label={`Open pull request #${number} on GitHub`} className={cn("inline-flex shrink-0 items-center gap-0.5 font-medium hover:underline", presentation?.toneClassName)}>#{number}<ExternalLink aria-hidden className="size-2.5" /></button> : <span className="shrink-0 font-medium">#{number}</span>}
			</div>
			<div className="mr-4 flex h-7 shrink-0 items-center gap-1"><Bar className="h-6 w-16 rounded-md" /><Button size="icon-xs" variant="ghost" disabled aria-label="Pull request actions loading"><MoreHorizontal className="size-4" /></Button></div>
			<div className="col-span-2 mt-1 min-w-0 px-4 pb-4">
				{seed ? <h1 className="truncate text-base leading-snug font-semibold">{seed.title}</h1> : <Bar className="h-5 w-4/5 max-w-md" />}
				<div className="mt-2 flex min-h-5 items-center gap-2 text-xs text-muted-foreground">{seed ? <MetaLine className="min-w-0"><ActorLabel key="author" actor={{ login: seed.author }} /><span key="updated">updated {formatRelativeTime(seed.updatedAt)}</span></MetaLine> : <><Bar className="size-4 rounded-full" /><Bar className="w-24" /></>}</div>
				<div className="mt-4 flex min-h-5 items-center gap-2 font-mono text-xs text-muted-foreground/70">{seed ? <><span className="truncate">{seed.base}</span><span aria-hidden>←</span><span className="truncate">{seed.head}</span><DiffStat additions={seed.additions} deletions={seed.deletions} className="ml-auto shrink-0" /></> : <><Bar className="w-20" /><Bar className="w-28" /></>}</div>
			</div>
			<div className="col-span-2 flex items-center gap-2 border-t border-border/60 px-4 py-2"><span aria-hidden className={cn("flex items-center gap-0.5", segmentedGroup)}>{tabs.map(tab => <span key={tab} className="px-2 py-0.5 text-xs text-muted-foreground/60">{tab}</span>)}</span></div>
		</div>
		<div className="motion-safe:animate-pulse"><PeopleGhost /><ConversationGhost /></div>
		<span className="sr-only">Loading pull request #{number}…</span>
	</div>;
}

/** GitHub's "Could not resolve to a PullRequest" is a missing pull request rather than a failed read. */
export const isNotFound = (error: string) => /could not resolve to a pullrequest|not found \(http 404\)|http 404/i.test(error);

/** Pull requests unavailable: what went wrong, with Retry and Open on GitHub side by side. */
export function UnavailableState({ number, error, refreshing, onRetry, onOpen }: { number: number; error: string; refreshing: boolean; onRetry: () => void; onOpen?: () => void }) {
	const missing = isNotFound(error);
	return <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
		<PullRequestGlyph.pullRequest aria-hidden className="size-6 text-muted-foreground/60" />
		<p className="text-sm font-medium">{missing ? `Pull request #${number} not found` : `Pull request #${number} unavailable`}</p>
		<p role="alert" className="max-w-72 text-xs text-muted-foreground">{missing ? "It may be an issue rather than a pull request, or this account can't see it." : error}</p>
		<div className="mt-1 flex flex-wrap justify-center gap-2">
			<Button size="sm" variant="outline" disabled={refreshing} aria-busy={refreshing} onClick={onRetry}><RefreshCw aria-hidden className={cn("size-3.5", refreshing && "animate-spin")} />{refreshing ? "Retrying…" : "Retry"}</Button>
			{onOpen && <Button size="sm" variant="outline" onClick={onOpen}><ExternalLink aria-hidden className="size-3.5" />Open on GitHub</Button>}
		</div>
	</div>;
}
