import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { PullRequestCandidate, PullRequestCandidates } from "../../../shared/pullRequestView";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { ScrollArea } from "../../components/ui/scroll-area";
import { cn } from "../../lib/utils";
import { ActorAvatar, errorMessage, Tip } from "./presentation";
import { matchesCandidate } from "./pullRequestLogic";

const words = {
	labels: { label: "Change labels", search: "Search labels", empty: "This repository has no labels.", noMatch: "No label matches that.", error: "The labels could not be read.", truncated: "This repository has more labels than are listed here. Apply the rest on GitHub.", disabled: "Changing labels needs triage access on this repository" },
	reviewers: { label: "Request reviewers", search: "Search people", empty: "Nobody else can review this pull request.", noMatch: "Nobody matches that.", error: "The people who can review could not be read.", truncated: "This repository has more people than are listed here. Ask the rest on GitHub.", disabled: "Asking for a review needs write access on this repository" },
} as const;

/**
 * T3's label and reviewer pickers: an icon button that opens a searchable list, read from GitHub only when it opens.
 * It stays open after a pick, since a second label or reviewer usually follows; every row locks while one change is in flight.
 */
export function CandidatePicker({ projectId, number, kind, allowed, icon, onToggle }: { projectId: string; number: number; kind: PullRequestCandidates["kind"]; allowed: boolean; icon: ReactNode; onToggle: (candidate: PullRequestCandidate) => Promise<boolean> }) {
	const text = words[kind];
	const [open, setOpen] = useState(false), [query, setQuery] = useState("");
	const [list, setList] = useState<PullRequestCandidates>(), [error, setError] = useState(""), [pending, setPending] = useState<string>();
	const generation = useRef(0);
	useEffect(() => {
		if (!open) return;
		const current = ++generation.current; setError(""); setQuery("");
		const api = window.phaseoDesktop?.workspace;
		if (!api) { setError("Open the desktop app to change this."); return; }
		void api.pullRequestCandidates(projectId, { number, kind }).then(value => { if (current === generation.current) setList(value); }, reason => { if (current === generation.current) setError(errorMessage(reason)); });
	}, [open, projectId, number, kind]);
	const shown = useMemo(() => (list?.candidates ?? []).filter(candidate => matchesCandidate(candidate, query)), [list, query]);
	const trigger = <Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label={text.label} disabled={!allowed}>{icon}</Button>;
	if (!allowed) return <Tip side="bottom" label={text.disabled}><span className="inline-flex">{trigger}</span></Tip>;
	const toggle = async (candidate: PullRequestCandidate) => {
		if (pending) return;
		setPending(candidate.key);
		const done = await onToggle(candidate);
		setPending(undefined);
		if (done) setList(current => current && { ...current, candidates: current.candidates.map(value => value.key === candidate.key ? { ...value, applied: !value.applied } : value) });
	};
	return <Popover open={open} onOpenChange={setOpen}>
		<Tip side="bottom" label={text.label}><PopoverTrigger render={trigger} /></Tip>
		<PopoverContent align="start" side="bottom" className="w-72 gap-0 p-0" data-candidate-picker={kind}>
			<div className="border-b border-border/60 p-1.5"><Input autoFocus value={query} onChange={event => setQuery(event.target.value)} aria-label={text.search} placeholder={text.search} className="h-7 text-xs"
				onKeyDown={event => { if (event.key === "Enter" && shown.length === 1) { event.preventDefault(); void toggle(shown[0]); } }} /></div>
			<ScrollArea className="max-h-72" viewportClassName="max-h-72"><div className="p-1" role="listbox" aria-label={text.label} aria-multiselectable>
				{!list && !error ? <p role="status" className="flex items-center gap-2 p-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden className="size-3.5 animate-spin" />Loading…</p>
					: error ? <p role="alert" className="p-2 text-xs text-muted-foreground">{text.error} {error}</p>
					: !shown.length ? <p className="p-2 text-xs text-muted-foreground">{query ? text.noMatch : text.empty}</p>
					: shown.map(candidate => <button key={candidate.key} type="button" role="option" aria-selected={candidate.applied} disabled={pending !== undefined} onClick={() => void toggle(candidate)} className={cn("flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent/60 focus-visible:bg-accent disabled:opacity-60")}>
						{kind === "labels" ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground" style={candidate.color ? { backgroundColor: `#${candidate.color}` } : undefined} /> : <ActorAvatar actor={{ login: candidate.key, ...(candidate.avatarUrl ? { avatarUrl: candidate.avatarUrl } : {}) }} />}
						<span className="min-w-0 flex-1 truncate">{candidate.label}{candidate.detail && <span className="text-muted-foreground"> · {candidate.detail}</span>}</span>
						{pending === candidate.key ? <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin" /> : candidate.applied ? <Check aria-label={kind === "labels" ? "Applied" : "Requested"} className="size-3.5 shrink-0" /> : null}
					</button>)}
				{list?.truncated && <p className="px-2 py-1.5 text-xs text-muted-foreground">{text.truncated}</p>}
			</div></ScrollArea>
		</PopoverContent>
	</Popover>;
}
