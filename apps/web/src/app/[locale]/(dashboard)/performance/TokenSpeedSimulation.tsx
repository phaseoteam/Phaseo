"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const sampleTokens = [
	"Lorem", "ipsum", "dolor", "sit", "amet,", "consectetur", "adipiscing", "elit.",
	"Integer", "vel", "sem", "at", "sapien", "facilisis", "viverra.", "Suspendisse",
	"potenti.", "Donec", "eu", "nibh", "vitae", "justo", "ornare", "tempor.",
	"Curabitur", "mattis", "libero", "sed", "nunc", "volutpat,", "quis", "aliquet",
	"erat", "faucibus.",
];

const playbackSlowdown = 4;
const lanes = [
	{ nameKey: "measuredPace" as const, rate: 18, firstToken: 900, color: "bg-amber-500" },
	{ nameKey: "fastPace" as const, rate: 45, firstToken: 520, color: "bg-sky-500" },
	{ nameKey: "veryFastPace" as const, rate: 90, firstToken: 240, color: "bg-emerald-500" },
].map((lane) => ({
	...lane,
	speed: `${lane.rate} tokens/s`,
	interval: (1000 * playbackSlowdown) / lane.rate,
}));

const windowSize = 72;

export default function TokenSpeedSimulation() {
	const t = useTranslations("Catalogue.performance");
	const [elapsed, setElapsed] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [isVisible, setIsVisible] = useState(false);
	const simulationRef = useRef<HTMLDivElement>(null);
	const startRef = useRef(performance.now());
	const pausedAtRef = useRef(0);

	useEffect(() => {
		if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setPlaying(true);
		}
	}, []);

	useEffect(() => {
		const simulation = simulationRef.current;
		if (!simulation) return;
		const observer = new IntersectionObserver(
			([entry]) => setIsVisible(entry.isIntersecting),
			{ threshold: 0.05 }
		);
		observer.observe(simulation);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!playing || !isVisible) return;
		startRef.current = performance.now() - pausedAtRef.current;
		const tick = () => {
			const now = performance.now();
			const next = now - startRef.current;
			pausedAtRef.current = next;
			setElapsed(next);
		};
		tick();
		const timer = window.setInterval(tick, 40);
		return () => window.clearInterval(timer);
	}, [isVisible, playing]);

	const replay = () => {
		pausedAtRef.current = 0;
		startRef.current = performance.now();
		setElapsed(0);
		setPlaying(true);
	};

	return (
		<div ref={simulationRef} className="overflow-hidden rounded-md border border-border/70 bg-background">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-5 py-3">
				<div>
					<p className="text-sm font-medium">{t("liveRelativeSpeedPlayback")}</p>
					<p className="mt-0.5 text-xs text-muted-foreground">{t("relativeSpeedsDescription")}</p>
				</div>
				<div className="flex gap-2">
					<Button className="rounded-md" size="sm" variant="outline" onClick={() => setPlaying((value) => !value)}>
						{playing ? <Pause /> : <Play />}{playing ? t("pausePlayback") : t("playPlayback")}
					</Button>
					<Button className="rounded-md" size="sm" variant="outline" onClick={replay}><RotateCcw />{t("replayPlayback")}</Button>
				</div>
			</div>

			<div className="divide-y divide-border/70">
				{lanes.map((lane) => {
					const generatedCount = Math.max(0, Math.floor((elapsed - lane.firstToken) / lane.interval) + 1);
					const firstVisibleIndex = Math.max(0, generatedCount - windowSize);
					const visibleTokens = Array.from(
						{ length: Math.min(generatedCount, windowSize) },
						(_, index) => ({
							absoluteIndex: firstVisibleIndex + index,
							value: sampleTokens[(firstVisibleIndex + index) % sampleTokens.length],
						})
					);
					const waiting = elapsed < lane.firstToken;
					return (
						<div key={lane.nameKey} className="grid gap-4 px-5 py-6 sm:grid-cols-[9rem_minmax(0,1fr)]">
							<div>
								<div className="flex items-center gap-2"><span className={`size-2 rounded-full ${lane.color}`} /><p className="text-sm font-medium">{t(lane.nameKey)}</p></div>
								<p className="mt-1 pl-4 font-mono text-xs text-muted-foreground">{lane.speed}</p>
							</div>
							<StreamingOutput
								laneName={lane.nameKey}
								waiting={waiting}
								generatedCount={generatedCount}
								tokens={visibleTokens}
							/>
						</div>
					);
				})}
			</div>

			<div className="flex items-center justify-between border-t border-border/70 bg-muted/20 px-5 py-2 font-mono text-xs text-muted-foreground">
				<span>{playing ? t("streamingContinuously") : t("playbackPaused")}</span>
				<span>{t("elapsedSeconds", { seconds: (elapsed / 1000).toFixed(1) })}</span>
			</div>
		</div>
	);
}

function StreamingOutput({
	laneName,
	waiting,
	generatedCount,
	tokens,
}: {
	laneName: string;
	waiting: boolean;
	generatedCount: number;
	tokens: Array<{ absoluteIndex: number; value: string }>;
}) {
	const t = useTranslations("Catalogue.performance");
	const outputRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const output = outputRef.current;
		if (output) output.scrollTop = output.scrollHeight;
	}, [generatedCount]);

	return (
		<ScrollArea
			viewportRef={outputRef}
			className="h-[7.25rem] rounded-md border border-border/70 bg-muted/15"
			viewportClassName="p-4 font-mono text-sm leading-7"
		>
			<div>
				{waiting && <span className="inline-flex items-center gap-2 text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />{t("waitingForFirstToken")}</span>}
				<span aria-hidden="true">
					{tokens.map((token, index) => (
						<span key={`${laneName}-${token.absoluteIndex}`} className={index === tokens.length - 1 ? "bg-foreground px-0.5 text-background" : ""}>{token.value}{" "}</span>
					))}
				</span>
				{generatedCount > 0 && <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-foreground align-middle" />}
			</div>
		</ScrollArea>
	);
}
