import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, LoaderCircle, MessageCircleQuestion, Sparkles, TriangleAlert } from "lucide-react";
import type { GuideExcerpt, GuideStop, PullRequestGuide, PullRequestGuideResult } from "../../../shared/pullRequestGuide";
import type { PullRequestView } from "../../../shared/pullRequestView";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { shortcut, useCommand } from "../../lib/keybindings";
import { cn } from "../../lib/utils";
import { errorMessage } from "./presentation";

/** Where the reader is in each guide, per guide head, for as long as the app is open (T3's tour progress). */
const progress = new Map<string, { position: number; seen: Set<number> }>();
const attentionLabels: Record<NonNullable<GuideStop["attention"]>["kind"], string> = { tradeoff: "A trade-off", contract: "A promise to callers", product: "A product call", risk: "A risk accepted", accessibility: "Accessibility" };

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

/** An excerpt as a small diff, with its notes as left-ruled rows beneath the lines they explain. */
function Excerpt({ excerpt, notes }: { excerpt: GuideExcerpt; notes: GuideStop["notes"] }) {
	const mine = notes.filter(note => note.path === excerpt.path && note.line >= excerpt.start && note.line <= excerpt.end);
	return <figure className="flex min-w-0 flex-col gap-1.5">
		<figcaption className="flex min-w-0 items-baseline gap-2 text-xs"><span className="min-w-0 truncate font-mono text-muted-foreground">{excerpt.path}:{excerpt.start}{excerpt.end > excerpt.start ? `–${excerpt.end}` : ""}</span>{excerpt.caption && <span className="min-w-0 truncate text-foreground">{excerpt.caption}</span>}</figcaption>
		<ScrollArea scrollBarOrientation="horizontal" className="border-y border-border/60">
			<table className="w-full border-collapse font-mono text-[11.5px] leading-[1.55]"><tbody>{excerpt.lines.map((line, index) => {
				const number = excerpt.side === "old" ? line.old : line.new ?? line.old;
				const note = mine.find(value => value.line === (excerpt.side === "old" ? line.old : line.new));
				return <tr key={index} data-note={note ? "" : undefined} className={cn(line.kind === "add" && "bg-success/10", line.kind === "del" && "bg-destructive/10")}>
					<td className="w-10 pr-2 text-right align-top text-muted-foreground/70 select-none tabular-nums">{number}</td>
					<td className={cn("w-4 align-top select-none", line.kind === "add" ? "text-success" : line.kind === "del" ? "text-destructive" : "text-muted-foreground/50")}>{line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}</td>
					<td className="pr-3 whitespace-pre">{line.text || " "}</td>
				</tr>;
			})}</tbody></table>
		</ScrollArea>
		{mine.map(note => <div key={`${note.line}:${note.title}`} className="border-l-2 border-info/60 py-0.5 pl-3 text-xs">
			<p className="font-medium text-foreground"><span className="mr-1.5 font-mono font-normal text-muted-foreground">Line {note.line}</span>{note.title}</p>
			{note.body && <p className="mt-0.5 text-muted-foreground">{note.body}</p>}
		</div>)}
	</figure>;
}

function StopView({ stop, index, count, nextTitle, onStep, onOpenCode }: { stop: GuideStop; index: number; count: number; nextTitle?: string; onStep: (delta: 1 | -1) => void; onOpenCode: () => void }) {
	return <article className="flex min-w-0 flex-col gap-4" aria-label={`Stop ${index + 1}: ${stop.title}`}>
		<header className="flex flex-col gap-1">
			<p className="text-xs text-muted-foreground tabular-nums">Stop {index + 1} of {count}</p>
			<h2 className="text-sm font-semibold text-foreground">{stop.title}</h2>
			{stop.summary && <p className="text-xs leading-relaxed text-muted-foreground">{stop.summary}</p>}
		</header>
		{stop.attention && <div role="note" className="flex gap-2 border-l-2 border-warning py-0.5 pl-3 text-xs">
			<TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
			<p><span className="font-semibold text-foreground">{attentionLabels[stop.attention.kind]}. </span><span className="text-muted-foreground">{stop.attention.note}</span></p>
		</div>}
		{stop.excerpts.map((excerpt, position) => <Excerpt key={`${excerpt.path}:${excerpt.side}:${excerpt.start}:${position}`} excerpt={excerpt} notes={stop.notes} />)}
		{stop.files.length > 0 && <section className="flex flex-col gap-1.5" aria-label="Files">
			<h3 className="text-xs font-semibold text-foreground">Files</h3>
			<ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">{stop.files.map(file => <li key={file.path} className="flex min-w-0 items-baseline gap-2 py-1.5 text-xs">
				<button type="button" onClick={onOpenCode} className="min-w-0 truncate font-mono text-foreground hover:underline">{file.path}</button>
				{file.note && <span className="min-w-0 truncate text-muted-foreground">{file.note}</span>}
			</li>)}</ul>
		</section>}
		{stop.questions.length > 0 && <section className="flex flex-col gap-1.5" aria-label="Questions to ask">
			<h3 className="text-xs font-semibold text-foreground">Questions to ask</h3>
			<ul className="flex flex-col gap-1">{stop.questions.map(question => <li key={question} className="flex gap-2 text-xs text-muted-foreground"><MessageCircleQuestion aria-hidden className="mt-0.5 size-3.5 shrink-0" />{question}</li>)}</ul>
		</section>}
		<footer className="flex items-center gap-2 border-t border-border/60 pt-3">
			<Button size="xs" variant="ghost" disabled={index === 0} onClick={() => onStep(-1)}><ChevronLeft aria-hidden className="size-3.5" />Previous</Button>
			<span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{nextTitle ? `Next: ${nextTitle}` : "Last stop"}</span>
			<Button size="xs" variant="outline" disabled={index === count - 1} onClick={() => onStep(1)}>Next<ChevronRight aria-hidden className="size-3.5" /></Button>
		</footer>
	</article>;
}

/** The tour: the rail beside the stop on a wide pane, above it on a narrow one. J and K step while the tab is on screen. */
function GuideTour({ guide, guideKey, active, banner, onOpenCode }: { guide: PullRequestGuide; guideKey: string; active: boolean; banner: React.ReactNode; onOpenCode: () => void }) {
	const key = `${guideKey}@${guide.headSha}`;
	const [state, setState] = useState(() => progress.get(key) ?? { position: 0, seen: new Set<number>() });
	useEffect(() => { setState(progress.get(key) ?? { position: 0, seen: new Set<number>() }); }, [key]);
	const scroller = useRef<HTMLDivElement>(null);
	const count = guide.stops.length, position = Math.max(Math.min(state.position, count - 1), 0);
	const goTo = useCallback((next: number) => {
		setState(current => { const value = { position: next, seen: next > current.position ? new Set(current.seen).add(current.position) : current.seen }; progress.set(key, value); return value; });
		scroller.current?.scrollTo({ top: 0 });
	}, [key]);
	const step = (delta: 1 | -1) => { const next = position + delta; if (next >= 0 && next < count) goTo(next); };
	useCommand("guide.next", () => { if (position >= count - 1) return false; step(1); }, active);
	useCommand("guide.previous", () => { if (position <= 0) return false; step(-1); }, active);
	const stop = guide.stops[position];
	return <ScrollArea className="h-full" viewportRef={scroller}>
		<div className="@container/guide mx-auto grid max-w-[100rem] gap-6 px-4 py-4 @min-[44rem]/guide:grid-cols-[14rem_minmax(0,1fr)]">
			<aside className="self-start @min-[44rem]/guide:sticky @min-[44rem]/guide:top-4"><GuideRail stops={guide.stops} position={position} seen={state.seen} onSelect={goTo} /></aside>
			<main className="flex min-w-0 flex-col gap-4">
				{banner}
				{stop ? <StopView stop={stop} index={position} count={count} nextTitle={guide.stops[position + 1]?.title} onStep={step} onOpenCode={onOpenCode} /> : <p className="text-xs text-muted-foreground">This change has no files to tour.</p>}
				<p className="text-[11px] text-muted-foreground/80">Written by {guide.model} {new Date(guide.generatedAt).toLocaleString()}.{guide.truncated ? " The change was too large to show the model in full, so some files are listed without excerpts." : ""}{shortcut("guide.next") ? ` ${shortcut("guide.next")} and ${shortcut("guide.previous")} step through the stops.` : ""}</p>
			</main>
		</div>
	</ScrollArea>;
}

/**
 * T3's Guide tab: a maintainer's tour of the pull request, written on request by the title model through your Phaseo
 * account and stored per pull request head, so opening the tab is free. A guide written before the latest push says
 * so and offers Rewrite.
 */
export function GuideTab({ view, projectId, active, onOpenCode }: { view: PullRequestView; projectId: string; active: boolean; onOpenCode: () => void }) {
	const [result, setResult] = useState<PullRequestGuideResult>(), [loadError, setLoadError] = useState(""), [writing, setWriting] = useState(false);
	const api = window.phaseoDesktop?.workspace;
	const read = useCallback(async () => {
		if (!api) { setLoadError("Open the desktop app to read guides."); return; }
		try { setResult(await api.pullRequestGuide(projectId, view.number)); setLoadError(""); } catch (reason) { setLoadError(errorMessage(reason)); }
	}, [api, projectId, view.number]);
	useEffect(() => { void read(); }, [read, view.headOid]);
	const running = writing || Boolean(result?.running);
	// A run started elsewhere (another window, or before this tab was opened) is watched until it ends.
	useEffect(() => { if (!result?.running || writing) return; const timer = window.setInterval(() => void read(), 3000); return () => window.clearInterval(timer); }, [result?.running, writing, read]);
	const write = async () => {
		if (!api || running) return;
		setWriting(true); setLoadError("");
		try { setResult(await api.pullRequestGuide(projectId, view.number, true)); } catch (reason) { setLoadError(errorMessage(reason)); } finally { setWriting(false); }
	};
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
	return <GuideTour guide={guide} guideKey={`${view.repository}#${view.number}`} active={active} banner={banner} onOpenCode={onOpenCode} />;
}
