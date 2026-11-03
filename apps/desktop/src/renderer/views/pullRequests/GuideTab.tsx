import { formatDateTime } from "@phaseo/app-kit/format";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, ChevronRight, ChevronUp, Code2, Eye, File, LoaderCircle, MessageCircleQuestion, MessageSquare, Sparkles, TriangleAlert } from "lucide-react";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import type { GuideExcerpt, GuideStop, PullRequestGuide, PullRequestGuideResult } from "../../../shared/pullRequestGuide";
import type { PullRequestFile } from "../../../shared/pullRequestFiles";
import type { PullRequestReviewCommentDraft, PullRequestView } from "../../../shared/pullRequestView";
import { DiffView } from "../../components/DiffView";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { Kbd } from "../../components/ui/kbd";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Textarea } from "../../components/ui/textarea";
import { showToast } from "../../components/ui/toast";
import { shortcut, useCommand } from "../../lib/keybindings";
import { pullRequestPatch } from "../../lib/pullRequestPatch";
import { usePersistedState } from "../../lib/persistedState";
import type { DiffLayout } from "../../components/diffRendering";
import { cn } from "../../lib/utils";
import { DiffStat, errorMessage, Tip } from "./presentation";
import { agentSelectionPrompt, patchExcerpt, rangeLabel, rangeToDraft } from "./pullRequestDiff";
import { excerptPatch, letterStopNotes, proseTokens, stopQuestionPrompt, type LetteredNote } from "./pullRequestGuideView";
import { nextPendingReviewCommentId, pullRequestReviewKey, reviewDrafts } from "./pullRequestReviewStore";

/** Where the reader is in each guide, per guide head, for as long as the app is open. */
const progress = new Map<string, { position: number; seen: Set<number> }>();
const ATTENTION_LABELS: Record<NonNullable<GuideStop["attention"]>["kind"], string> = { tradeoff: "A trade-off to weigh", contract: "A contract to check", product: "A product call", risk: "A risk to judge", accessibility: "An accessibility call" };

/** Guide prose: the model's inline markdown (code, bold, emphasis) without a full renderer. */
export function GuideProse({ text }: { text: string }) {
	return <>{proseTokens(text).map((token, index) => token.kind === "code" ? <code key={index} className="rounded bg-muted px-1 py-px font-mono text-[0.92em]">{token.text}</code> : token.kind === "strong" ? <strong key={index} className="font-semibold text-foreground">{token.text}</strong> : token.kind === "em" ? <em key={index}>{token.text}</em> : <span key={index}>{token.text}</span>)}</>;
}

function stopSubline(stop: GuideStop) {
	const parts = [stop.excerpts.length ? `${stop.excerpts.length} ${stop.excerpts.length === 1 ? "excerpt" : "excerpts"}` : "", stop.files.length ? `${stop.files.length} ${stop.files.length === 1 ? "file" : "files"}` : ""].filter(Boolean);
	return parts.join(" · ") || "Context";
}

/** The tour's contents: where the reader is and which stops they have read past; a stop with a call to make is marked. */
function GuideRail({ stops, position, seen, onSelect }: { stops: GuideStop[]; position: number; seen: Set<number>; onSelect: (index: number) => void }) {
	return <nav aria-label="Review tour" className="flex min-h-0 flex-col gap-3">
		<p className="text-xs text-muted-foreground tabular-nums">{seen.size} of {stops.length} read</p>
		<ol className="flex flex-col gap-0.5">{stops.map((stop, index) => <li key={index}>
			<button type="button" aria-current={position === index ? "step" : undefined} onClick={() => onSelect(index)} className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", position === index ? "bg-accent" : "hover:bg-accent/60")}>
				<span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] tabular-nums", seen.has(index) ? "border-success/40 text-success" : "border-border text-muted-foreground")}>{seen.has(index) ? <Check aria-label={`Stop ${index + 1}, read`} className="size-3" /> : index + 1}</span>
				<span className="flex min-w-0 flex-col gap-0.5">
					<span className="text-xs font-medium text-foreground">{stop.title}</span>
					<span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{stop.attention && <span className="font-medium text-warning">Look closely</span>}<span>{stopSubline(stop)}</span></span>
				</span>
			</button>
		</li>)}</ol>
	</nav>;
}

/** Lettered notes in one list, beside the stop on very wide panes and under the excerpts otherwise. */
function GuideNotes({ notes, className }: { notes: LetteredNote[]; className?: string }) {
	if (!notes.length) return null;
	return <ol aria-label="Notes" className={cn("flex flex-col gap-2", className)}>{notes.map(note => <li key={note.letter} className="flex gap-2 border-l-2 border-info/60 py-0.5 pl-3 text-xs">
		<span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-full bg-info/15 text-[10px] font-semibold text-info">{note.letter}</span>
		<span className="min-w-0"><span className="block font-medium text-foreground"><span className="sr-only">Note {note.letter}: </span><GuideProse text={note.title} /></span>{note.body && <span className="mt-0.5 block text-muted-foreground"><GuideProse text={note.body} /></span>}<span className="mt-0.5 block font-mono text-2xs text-muted-foreground/80">{note.path}:{note.line}</span></span>
	</li>)}</ol>;
}

/** Lines picked in an excerpt, written up for the review or handed to an agent. */
type Commenting = { canReview: boolean; onReview: (draft: PullRequestReviewCommentDraft) => void; onAsk: (text: string) => void; number: number };
function ExcerptDraft({ label, canReview, onReview, onAsk, onCancel }: { label: string; canReview: boolean; onReview: (body: string) => void; onAsk: (request: string) => void; onCancel: () => void }) {
	const [text, setText] = useState("");
	return <div className="border-y border-border/60 bg-background px-3 py-2 font-sans text-xs whitespace-normal" onPointerDown={event => event.stopPropagation()}>
		<p className="mb-1.5 truncate font-mono text-muted-foreground">{label}</p>
		<Textarea autoFocus value={text} rows={3} onChange={event => setText(event.target.value)} placeholder={canReview ? "Leave a comment or ask about these lines" : "Ask about these lines"} aria-label={`Comment on ${label}`} className="min-h-16 text-xs" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }} />
		<div className="mt-2 flex flex-wrap justify-end gap-2">
			<Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
			<Button size="xs" variant="outline" disabled={!text.trim()} onClick={() => onAsk(text)}>Add to agent</Button>
			{canReview && <Button size="xs" disabled={!text.trim()} onClick={() => onReview(text)}>Add to review</Button>}
		</div>
	</div>;
}

/** An excerpt as a real diff: its lines can be picked to comment on or ask about, and its notes carry their letters. */
function Excerpt({ excerpt, notes, layout, commenting, onOpenFile }: { excerpt: GuideExcerpt; notes: LetteredNote[]; layout: DiffLayout; commenting: Commenting; onOpenFile: (path: string) => void }) {
	const patch = useMemo(() => excerptPatch(excerpt), [excerpt]);
	const [draft, setDraft] = useState<(Omit<PullRequestReviewCommentDraft, "body"> & { range: SelectedLineRange }) | null>(null);
	const side = excerpt.side === "old" ? "deletions" as const : "additions" as const;
	const annotations: DiffLineAnnotation<string>[] = [...notes.map(note => ({ side, lineNumber: note.line, metadata: `note:${note.letter}` })), ...(draft ? [{ side: draft.side === "LEFT" ? "deletions" as const : "additions" as const, lineNumber: draft.line, metadata: "draft" }] : [])];
	const render = (annotation: DiffLineAnnotation<string>) => {
		if (annotation.metadata === "draft" && draft) return <ExcerptDraft label={rangeLabel(draft.path, draft)} canReview={commenting.canReview} onCancel={() => setDraft(null)}
			onReview={body => { commenting.onReview({ path: draft.path, line: draft.line, side: draft.side, ...(draft.startLine ? { startLine: draft.startLine, startSide: draft.startSide } : {}), body }); setDraft(null); }}
			onAsk={request => { const start = draft.startLine && draft.startSide === draft.side ? draft.startLine : draft.line; commenting.onAsk(agentSelectionPrompt({ number: commenting.number, path: draft.path, draft, lines: patchExcerpt(patch, draft.side, start, draft.line), request })); setDraft(null); }} />;
		const note = notes.find(value => `note:${value.letter}` === annotation.metadata);
		return note ? <div className="flex items-center gap-2 border-y border-info/30 bg-info/5 px-3 py-1 font-sans text-xs whitespace-normal"><span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-full bg-info/15 text-[10px] font-semibold text-info">{note.letter}</span><span className="min-w-0 truncate text-foreground"><GuideProse text={note.title} /></span></div> : null;
	};
	return <figure className="flex min-w-0 flex-col gap-1.5">
		<figcaption className="flex min-w-0 items-center gap-2 text-xs">
			<span className="min-w-0 truncate font-mono text-muted-foreground">{excerpt.path}:{excerpt.start}{excerpt.end > excerpt.start ? `–${excerpt.end}` : ""}</span>
			{excerpt.caption && <span className="min-w-0 truncate text-foreground"><GuideProse text={excerpt.caption} /></span>}
			<Tip label="Open this file in the Code tab"><Button size="xs" variant="ghost" className="ml-auto shrink-0 text-muted-foreground" onClick={() => onOpenFile(excerpt.path)}><Code2 aria-hidden className="size-3" />Open in Code</Button></Tip>
		</figcaption>
		{patch ? <div className="border-y border-border/60"><DiffView patch={patch} layout={layout} hideHeader hideActions wrap annotations={annotations} renderAnnotation={render} lineSelection={draft ? { selected: draft.range, onSelect: () => {} } : { selected: null, onSelect: range => setDraft({ ...rangeToDraft(excerpt.path, range), range }) }} /></div> : <p className="text-xs text-muted-foreground">This excerpt has no lines.</p>}
	</figure>;
}

/** The pull request's own diffs for a stop's other files, read a page at a time until they are found, once per head. */
const fileCache = new Map<string, { files: Map<string, PullRequestFile>; page: number; done: boolean }>();
function useStopFiles(view: PullRequestView, projectId: string, paths: readonly string[]) {
	const key = `${projectId}:${view.repository}#${view.number}@${view.headOid}`;
	const [, setVersion] = useState(0), [error, setError] = useState("");
	const entry = fileCache.get(key) ?? { files: new Map(), page: 0, done: false };
	const missing = paths.some(path => !entry.files.has(path));
	const loading = useRef(false);
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || !missing || loading.current) return;
		const current = fileCache.get(key) ?? { files: new Map(), page: 0, done: false };
		if (current.done) return;
		fileCache.set(key, current);
		loading.current = true;
		void (async () => {
			try {
				while (!current.done && paths.some(path => !current.files.has(path))) {
					const page = await api.pullRequestFiles(projectId, { number: view.number, page: current.page + 1, headOid: view.headOid, baseOid: view.baseOid });
					for (const file of page.files) current.files.set(file.filename, file);
					current.page = page.page; current.done = !page.hasNext;
					setVersion(value => value + 1);
				}
			} catch (reason) { setError(errorMessage(reason)); }
			finally { loading.current = false; setVersion(value => value + 1); }
		})();
	}, [key, missing, paths, projectId, view.number, view.headOid, view.baseOid]);
	return { files: entry.files, loading: missing && !entry.done && !error, error };
}

function StopView({ stop, index, count, nextTitle, view, projectId, layout, railOpen, onRailOpenChange, stopList, commenting, onStep, onOpenFile, onAsk, onFinish }: { stop: GuideStop; index: number; count: number; nextTitle?: string; view: PullRequestView; projectId: string; layout: DiffLayout; railOpen: boolean; onRailOpenChange: (open: boolean) => void; stopList: ReactNode; commenting: Commenting; onStep: (delta: 1 | -1) => void; onOpenFile: (path: string) => void; onAsk?: (question: string) => void; onFinish?: () => void }) {
	const { lettered, byExcerpt } = useMemo(() => letterStopNotes(stop), [stop]);
	const excerptPaths = new Set(stop.excerpts.map(excerpt => excerpt.path)), otherFiles = stop.files.filter(file => !excerptPaths.has(file.path));
	const paths = useMemo(() => { const inExcerpts = new Set(stop.excerpts.map(excerpt => excerpt.path)); return stop.files.filter(file => !inExcerpts.has(file.path)).map(file => file.path); }, [stop]);
	const diff = useStopFiles(view, projectId, paths);
	const keys = [shortcut("guide.next"), shortcut("guide.previous")].filter(Boolean);
	return <div className={cn("grid gap-8", lettered.length > 0 && "@min-[90rem]/guide:grid-cols-[minmax(0,1fr)_20rem]")}>
		<article className="flex min-w-0 flex-col gap-5" aria-label={`Stop ${index + 1}: ${stop.title}`}>
			<Collapsible open={railOpen} onOpenChange={onRailOpenChange}>
				<header className="flex items-center justify-between gap-2">
					<p className="text-xs text-muted-foreground tabular-nums @max-[56rem]/guide:hidden">Stop {index + 1} of {count}</p>
					<CollapsibleTrigger render={<Button size="xs" variant="ghost" className="-ml-2 text-muted-foreground @min-[56rem]/guide:hidden" />}><span className="tabular-nums">Stop {index + 1} of {count}</span><ChevronDown aria-hidden className={cn("size-3.5 transition-transform", railOpen && "rotate-180")} /></CollapsibleTrigger>
					<div className="flex items-center gap-1">
						<Tip label="Previous stop"><Button size="icon-xs" variant="outline" aria-label="Previous stop" disabled={index === 0} onClick={() => onStep(-1)}><ChevronUp aria-hidden className="size-3.5" /></Button></Tip>
						<Tip label="Next stop"><Button size="icon-xs" variant="outline" aria-label="Next stop" disabled={index === count - 1} onClick={() => onStep(1)}><ChevronDown aria-hidden className="size-3.5" /></Button></Tip>
						{keys.length === 2 && <span aria-hidden className="ml-1 flex items-center gap-0.5 @max-[30rem]/guide:hidden"><Kbd>{keys[0]}</Kbd><Kbd>{keys[1]}</Kbd></span>}
					</div>
				</header>
				<CollapsibleContent className="@min-[56rem]/guide:hidden"><div className="pt-3">{stopList}</div></CollapsibleContent>
			</Collapsible>
			<div className="flex max-w-[60rem] flex-col gap-2">
				<h2 className="text-lg font-semibold text-foreground">{stop.title}</h2>
				{stop.summary.trim() && <p className="text-sm text-muted-foreground"><GuideProse text={stop.summary} /></p>}
			</div>
			{stop.attention && <div role="note" className="flex gap-2.5 border-l-2 border-warning py-1 pl-3 text-sm">
				<Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
				<div className="min-w-0"><p className="font-semibold text-foreground">{ATTENTION_LABELS[stop.attention.kind]}</p><p className="mt-0.5 text-muted-foreground"><GuideProse text={stop.attention.note} /></p></div>
			</div>}
			{stop.excerpts.length > 0 && <div className="flex min-w-0 flex-col gap-4">{stop.excerpts.map((excerpt, position) => <Excerpt key={`${excerpt.path}:${excerpt.side}:${excerpt.start}-${excerpt.end}:${position}`} excerpt={excerpt} notes={byExcerpt[position] ?? []} layout={layout} commenting={commenting} onOpenFile={onOpenFile} />)}</div>}
			<GuideNotes notes={lettered} className="@min-[90rem]/guide:hidden" />
			{otherFiles.length > 0 && <section className="flex flex-col gap-1.5" aria-label={stop.excerpts.length ? "Also in this stop" : "Files in this stop"}>
				<h3 className="text-xs font-medium text-muted-foreground">{stop.excerpts.length ? "Also in this stop" : "Files in this stop"}</h3>
				<ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">{otherFiles.map(file => {
					const loaded = diff.files.get(file.path), patch = loaded ? pullRequestPatch(loaded) : undefined;
					return <li key={file.path}><Collapsible>
						<div className="group flex min-w-0 items-center gap-2 text-xs hover:bg-accent/50">
							<CollapsibleTrigger className="group/trigger flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
								<ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/trigger:rotate-90" />
								<File aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
								<span className="min-w-0 truncate font-mono text-foreground">{file.path}</span>
								{file.note?.trim() && <span className="ml-auto min-w-0 truncate text-muted-foreground @max-[30rem]/guide:hidden"><GuideProse text={file.note} /></span>}
								{loaded && <DiffStat additions={loaded.additions} deletions={loaded.deletions} className={cn("shrink-0 font-mono", !file.note?.trim() && "ml-auto")} />}
							</CollapsibleTrigger>
							<Tip label="Open this file in the Code tab"><Button size="icon-xs" variant="ghost" className="mr-1 shrink-0 text-muted-foreground" aria-label={`Open ${file.path} in Code`} onClick={() => onOpenFile(file.path)}><Code2 aria-hidden className="size-3" /></Button></Tip>
						</div>
						<CollapsibleContent>{patch ? <DiffView patch={patch} layout={layout} hideHeader hideActions wrap /> : <p className="px-3 py-2 text-xs text-muted-foreground">{diff.loading ? "Loading the diff…" : diff.error ? `The diff could not be loaded: ${diff.error}` : "This file is not in the loaded diff."}</p>}</CollapsibleContent>
					</Collapsible></li>;
				})}</ul>
			</section>}
			{(stop.questions.length > 0 || onAsk) && <section className="flex flex-col gap-1.5" aria-label="Questions to consider">
				{stop.questions.length > 0 && <h3 className="text-xs font-medium text-muted-foreground">Questions to consider</h3>}
				<div className="flex flex-col items-start gap-0.5">
					{stop.questions.map(question => onAsk ? <button key={question} type="button" onClick={() => onAsk(question)} className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
						<MessageCircleQuestion aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span className="sr-only">Ask an agent: </span><span><GuideProse text={question} /></span>
					</button> : <p key={question} className="flex gap-2 px-2 text-sm text-foreground"><MessageCircleQuestion aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><GuideProse text={question} /></p>)}
					{onAsk && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => onAsk("")}><MessageCircleQuestion aria-hidden className="size-3.5" />Ask about this stop</Button>}
				</div>
			</section>}
			<footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border/60 pt-4">
				{nextTitle ? <Button className="min-w-0" onClick={() => onStep(1)}><span className="min-w-0 truncate">Next: {nextTitle}</span><ArrowRight aria-hidden className="size-4" /></Button>
					: onFinish ? <Button onClick={onFinish}><MessageSquare aria-hidden className="size-4" />Finish review</Button> : null}
			</footer>
		</article>
		{lettered.length > 0 && <aside className="hidden @min-[90rem]/guide:sticky @min-[90rem]/guide:top-4 @min-[90rem]/guide:block @min-[90rem]/guide:self-start"><GuideNotes notes={lettered} /></aside>}
	</div>;
}

/** The tour: the rail beside the stop from 56rem, tucked into the stop's header below that. J and K step while it is on screen. */
function GuideTour({ guide, view, projectId, active, banner, onOpenCode, onFinishReview, onAsk }: { guide: PullRequestGuide; view: PullRequestView; projectId: string; active: boolean; banner: ReactNode; onOpenCode: (path?: string) => void; onFinishReview?: () => void; onAsk?: (text: string) => void }) {
	const key = `${view.repository}#${view.number}@${guide.headSha}`;
	const [state, setState] = useState(() => progress.get(key) ?? { position: 0, seen: new Set<number>() });
	const [railOpen, setRailOpen] = useState(false);
	const [layout] = usePersistedState<DiffLayout>("phaseo.desktop.pullRequestDiffLayout", "unified");
	useEffect(() => { setState(progress.get(key) ?? { position: 0, seen: new Set<number>() }); }, [key]);
	const scroller = useRef<HTMLDivElement>(null);
	const count = guide.stops.length, position = Math.max(Math.min(state.position, count - 1), 0);
	const goTo = useCallback((next: number) => {
		setState(current => { const value = { position: next, seen: next > current.position ? new Set(current.seen).add(current.position) : current.seen }; progress.set(key, value); return value; });
		setRailOpen(false);
		scroller.current?.scrollTo({ top: 0 });
	}, [key]);
	const step = (delta: 1 | -1) => { const next = position + delta; if (next >= 0 && next < count) goTo(next); };
	useCommand("guide.next", () => { if (position >= count - 1) return false; step(1); }, active);
	useCommand("guide.previous", () => { if (position <= 0) return false; step(-1); }, active);
	const reviewKey = pullRequestReviewKey(projectId, view.repository, view.number);
	const commenting: Commenting = { number: view.number, canReview: view.state === "OPEN", onReview: draft => { reviewDrafts.addComment(reviewKey, { id: nextPendingReviewCommentId(), ...draft }); showToast("success", "Added to your review"); }, onAsk: text => onAsk?.(text) };
	const stop = guide.stops[position];
	const finish = onFinishReview ? () => { setState(current => { const value = { ...current, seen: new Set(current.seen).add(position) }; progress.set(key, value); return value; }); onFinishReview(); } : undefined;
	const rail = <GuideRail stops={guide.stops} position={position} seen={state.seen} onSelect={goTo} />;
	return <ScrollArea className="h-full" viewportRef={scroller} viewportClassName="pr-scroller">
		<div className="@container/guide mx-auto grid max-w-[100rem] gap-6 px-4 py-4 @min-[56rem]/guide:grid-cols-[16rem_minmax(0,1fr)] @min-[90rem]/guide:gap-8 @min-[90rem]/guide:px-6">
			<aside className="sticky top-4 self-start @max-[56rem]/guide:hidden">{rail}</aside>
			<main className="flex min-w-0 flex-col gap-4">
				{banner}
				{stop ? <StopView key={position} stop={stop} index={position} count={count} nextTitle={guide.stops[position + 1]?.title} view={view} projectId={projectId} layout={layout} railOpen={railOpen} onRailOpenChange={setRailOpen} stopList={rail} commenting={commenting} onStep={step} onOpenFile={path => onOpenCode(path)} {...(onAsk ? { onAsk: (question: string) => onAsk(stopQuestionPrompt({ number: view.number, title: view.title, url: view.url, stop, question })) } : {})} {...(finish ? { onFinish: finish } : {})} />
					: <p className="text-sm text-muted-foreground">This change has no files to tour.</p>}
				<p className="text-[11px] text-muted-foreground/80">Written by {guide.model} {formatDateTime(guide.generatedAt)}.{guide.truncated ? " The change was too large to show the model in full, so some files are listed without excerpts." : ""} Drag the line numbers in an excerpt to comment on them or ask about them.</p>
			</main>
		</div>
	</ScrollArea>;
}

/**
 * The Guide tab: a maintainer's tour of the pull request, written on request by the title model through your Phaseo
 * account and stored per pull request head, so opening the tab is free. A guide written before the latest push says
 * so and offers Rewrite. `writeRequest` lets the pane's More menu ask for one.
 */
export function GuideTab({ view, projectId, active, onOpenCode, onFinishReview, onAsk, writeRequest = 0, onGuideState }: { view: PullRequestView; projectId: string; active: boolean; onOpenCode: (path?: string) => void; onFinishReview?: () => void; onAsk?: (text: string) => void; writeRequest?: number; onGuideState?: (written: boolean) => void }) {
	const [result, setResult] = useState<PullRequestGuideResult>(), [loadError, setLoadError] = useState(""), [writing, setWriting] = useState(false);
	const api = window.phaseoDesktop?.workspace;
	const read = useCallback(async () => {
		if (!api) { setLoadError("Open the desktop app to read guides."); return; }
		try { setResult(await api.pullRequestGuide(projectId, view.number)); setLoadError(""); } catch (reason) { setLoadError(errorMessage(reason)); }
	}, [api, projectId, view.number]);
	useEffect(() => { void read(); }, [read, view.headOid]);
	useEffect(() => { if (result) onGuideState?.(Boolean(result.guide)); }, [result, onGuideState]);
	const running = writing || Boolean(result?.running);
	// A run started elsewhere (another window, or before this tab was opened) is watched until it ends.
	useEffect(() => { if (!result?.running || writing) return; const timer = window.setInterval(() => void read(), 3000); return () => window.clearInterval(timer); }, [result?.running, writing, read]);
	const write = useCallback(async () => {
		if (!api || running) return;
		setWriting(true); setLoadError("");
		try { setResult(await api.pullRequestGuide(projectId, view.number, true)); } catch (reason) { setLoadError(errorMessage(reason)); } finally { setWriting(false); }
	}, [api, running, projectId, view.number]);
	const answered = useRef(writeRequest);
	useEffect(() => { if (writeRequest !== answered.current) { answered.current = writeRequest; void write(); } }, [writeRequest, write]);
	const guide = result?.guide ?? null;
	const failure = result?.error ?? (loadError || undefined);
	const writeButton = (label: string) => <Button size="xs" variant="outline" disabled={running} onClick={() => void write()}>{running ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : <Sparkles aria-hidden className="size-3.5" />}{running ? "Reading the change…" : label}</Button>;
	if (!guide) {
		if (!result && !loadError) return <div className="flex min-h-48 items-center justify-center"><LoaderCircle aria-label="Loading" className="size-4 animate-spin text-muted-foreground" /></div>;
		return <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
			<p className="text-sm font-medium text-foreground">{running ? "Writing a review guide" : "No review guide yet"}</p>
			<p role={failure ? "alert" : undefined} className="max-w-md text-xs text-muted-foreground">{failure ?? (running ? "The model is reading the change. A large one takes a few minutes. You can leave this tab; it carries on." : "A guide is a tour of the change: stops through the code in reading order, with the calls only a maintainer can make. It is written by your chat title model (Settings → General) through your Phaseo account.")}</p>
			{writeButton(failure ? "Try again" : "Write guide")}
		</div>;
	}
	const stale = result!.currentHeadSha !== guide.headSha;
	const banner = stale || failure || running ? <div role="status" className={cn("flex items-center gap-2 border-l-2 py-1 pl-3 text-xs", running ? "border-info" : "border-warning")}>
		{running ? <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin text-info" /> : <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warning" />}
		<span className="min-w-0 flex-1 text-muted-foreground">{running ? "Rewriting this guide." : failure ?? "Written before the latest push."}</span>
		{!running && writeButton("Rewrite")}
	</div> : null;
	return <GuideTour guide={guide} view={view} projectId={projectId} active={active} banner={banner} onOpenCode={onOpenCode} {...(onFinishReview ? { onFinishReview } : {})} {...(onAsk ? { onAsk } : {})} />;
}
