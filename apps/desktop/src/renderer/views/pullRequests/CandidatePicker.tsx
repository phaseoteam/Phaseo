import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { PullRequestCandidate, PullRequestCandidates } from "../../../shared/pullRequestView";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { ScrollArea } from "../../components/ui/scroll-area";
import { cn } from "../../lib/utils";
import { ActorAvatar, errorMessage, Tip } from "./presentation";
import { matchesCandidate, moveHighlight } from "./pullRequestLogic";

const words = {
	labels: { label: "Change labels", search: "Search labels", empty: "This repository has no labels.", noMatch: "No label matches that.", error: "The labels could not be read.", truncated: "This repository has more labels than are listed here. Apply the rest on GitHub.", disabled: "Changing labels needs triage access on this repository" },
	reviewers: { label: "Request reviewers", search: "Search people", empty: "Nobody else can review this pull request.", noMatch: "Nobody matches that.", error: "The people who can review could not be read.", truncated: "This repository has more people than are listed here. Ask the rest on GitHub.", disabled: "Asking for a review needs write access on this repository" },
} as const;

/**
 * T3's label and reviewer pickers: an icon button that opens a searchable list, read from GitHub only when it opens.
 * Like T3's, it is a combobox rather than a menu, so typing stays in the search box: arrow keys, Home and End move
 * the highlight (the first row is highlighted as you type), Enter toggles it and Escape closes. It stays open after
 * a pick, since a second label or reviewer usually follows; every row locks while one change is in flight.
 */
export function CandidatePicker({ projectId, number, kind, allowed, icon, onToggle }: { projectId: string; number: number; kind: PullRequestCandidates["kind"]; allowed: boolean; icon: ReactNode; onToggle: (candidate: PullRequestCandidate) => Promise<boolean> }) {
	const text = words[kind];
	const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [highlight, setHighlight] = useState(0);
	const [list, setList] = useState<PullRequestCandidates>(), [error, setError] = useState(""), [pending, setPending] = useState<string>();
	const generation = useRef(0);
	const listId = useId();
	useEffect(() => {
		if (!open) return;
		const current = ++generation.current; setError(""); setQuery(""); setHighlight(0);
		const api = window.phaseoDesktop?.workspace;
		if (!api) { setError("Open the desktop app to change this."); return; }
		void api.pullRequestCandidates(projectId, { number, kind }).then(value => { if (current === generation.current) setList(value); }, reason => { if (current === generation.current) setError(errorMessage(reason)); });
	}, [open, projectId, number, kind]);
	const shown = useMemo(() => (list?.candidates ?? []).filter(candidate => matchesCandidate(candidate, query)), [list, query]);
	const active = shown.length ? Math.min(highlight, shown.length - 1) : -1;
	const optionId = (index: number) => `${listId}-option-${index}`;
	useEffect(() => { if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" }); });
	const trigger = <Button size="icon-xs" variant="ghost" className="text-muted-foreground" aria-label={text.label} disabled={!allowed}>{icon}</Button>;
	if (!allowed) return <Tip side="bottom" label={text.disabled}><span className="inline-flex">{trigger}</span></Tip>;
	const toggle = async (candidate: PullRequestCandidate) => {
		if (pending) return;
		setPending(candidate.key);
		const done = await onToggle(candidate);
		setPending(undefined);
		if (done) setList(current => current && { ...current, candidates: current.candidates.map(value => value.key === candidate.key ? { ...value, applied: !value.applied } : value) });
	};
	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.nativeEvent.isComposing) return;
		if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
		if (event.key === "Enter") { event.preventDefault(); if (active >= 0) void toggle(shown[active]); return; }
		const next = moveHighlight(active, shown.length, event.key);
		if (next !== undefined) { event.preventDefault(); setHighlight(next); }
	};
	const ready = Boolean(list) && !error && shown.length > 0;
	return <Popover open={open} onOpenChange={setOpen}>
		<Tip side="bottom" label={text.label}><PopoverTrigger render={trigger} /></Tip>
		<PopoverContent align="start" side="bottom" className="w-72 gap-0 p-0" data-candidate-picker={kind}>
			<div className="border-b border-border/60 p-1.5"><Input autoFocus value={query} onChange={event => { setQuery(event.target.value); setHighlight(0); }} aria-label={text.search} placeholder={text.search} className="h-7 text-xs"
				role="combobox" aria-autocomplete="list" aria-expanded={ready} aria-controls={listId} aria-activedescendant={ready && active >= 0 ? optionId(active) : undefined} onKeyDown={onKeyDown} /></div>
			<ScrollArea className="max-h-72" viewportClassName="max-h-72"><div id={listId} className="p-1" role="listbox" aria-label={text.label} aria-multiselectable>
				{!list && !error ? <p role="status" className="flex items-center gap-2 p-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden className="size-3.5 animate-spin" />Loading…</p>
					: error ? <p role="alert" className="p-2 text-xs text-muted-foreground">{text.error} {error}</p>
					: !shown.length ? <p className="p-2 text-xs text-muted-foreground">{query ? text.noMatch : text.empty}</p>
					// Rows take no focus, so the search box keeps it; the pointer moves the highlight as T3's does.
					: shown.map((candidate, index) => <div key={candidate.key} id={optionId(index)} role="option" aria-selected={candidate.applied} aria-disabled={pending !== undefined || undefined} data-highlighted={index === active || undefined}
						onPointerMove={() => { if (index !== active) setHighlight(index); }} onMouseDown={event => event.preventDefault()} onClick={() => void toggle(candidate)}
						className={cn("flex w-full min-w-0 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none select-none data-[highlighted]:bg-accent", pending !== undefined && "opacity-60")}>
						{kind === "labels" ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground" style={candidate.color ? { backgroundColor: `#${candidate.color}` } : undefined} /> : <ActorAvatar actor={{ login: candidate.key, ...(candidate.avatarUrl ? { avatarUrl: candidate.avatarUrl } : {}) }} />}
						<span className="min-w-0 flex-1 truncate">{candidate.label}{candidate.detail && <span className="text-muted-foreground"> · {candidate.detail}</span>}</span>
						{pending === candidate.key ? <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin" /> : candidate.applied ? <Check aria-label={kind === "labels" ? "Applied" : "Requested"} className="size-3.5 shrink-0" /> : null}
					</div>)}
				{list?.truncated && <p className="px-2 py-1.5 text-xs text-muted-foreground">{text.truncated}</p>}
			</div></ScrollArea>
		</PopoverContent>
	</Popover>;
}
