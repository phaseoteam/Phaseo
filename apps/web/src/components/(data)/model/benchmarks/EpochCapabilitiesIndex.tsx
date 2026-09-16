"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";
import { epochCapabilitiesIndexId, isEpochCapabilitiesIndex, parseEpochConfidenceInterval } from "@/lib/benchmarks/epoch";
import { cn } from "@/lib/utils";

export function EpochCapabilitiesIndex({ highlights, ranking, modelId, initialExpanded = false }: {
	highlights: ModelBenchmarkHighlight[];
	ranking?: PublicBenchmarkRanking | null;
	modelId?: string;
	initialExpanded?: boolean;
}) {
	const [expanded, setExpanded] = useState(initialExpanded);
	const result = highlights.find((item) => isEpochCapabilitiesIndex(item.benchmarkId) && item.score !== null);
	if (!result || result.score === null) return null;

	const entries = ranking?.entries ?? [];
	const currentIndex = entries.findIndex((entry) => entry.model_id === modelId);
	const start = currentIndex < 0 ? 0 : Math.min(Math.max(0, currentIndex - 5), Math.max(0, entries.length - 12));
	const visibleEntries = entries.slice(start, start + 12);
	const rangeValues = visibleEntries.flatMap((entry) => {
		const interval = parseEpochConfidenceInterval(entry.other_info);
		return interval ? [interval.low, interval.high] : [entry.score];
	});
	const min = Math.min(...rangeValues, result.score);
	const max = Math.max(...rangeValues, result.score);
	const span = Math.max(max - min, 1);
	const position = (value: number) => `${((value - min) / span) * 100}%`;
	const interval = parseEpochConfidenceInterval(result.otherInfo) ?? parseEpochConfidenceInterval(entries.find((entry) => entry.model_id === modelId)?.other_info);

	return <section aria-label="Epoch Capabilities Index">
		<div>
			<h2 className="sr-only">Epoch AI</h2>
			<Image src="/benchmarks/epoch-ai.svg" alt="Epoch AI" width={150} height={26} className="h-[22px] w-auto dark:hidden" />
			<Image src="/benchmarks/epoch-ai_dark.svg" alt="" width={150} height={26} className="hidden h-[22px] w-auto dark:block" aria-hidden="true" />
			<p className="mt-1.5 text-xs text-muted-foreground">Capabilities Index</p>
		</div>
		<button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="group mt-4 flex w-full items-center justify-between gap-6 border-y py-5 text-left">
			<div>
				<p className="text-sm font-medium">Epoch Capabilities Index</p>
				<div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
					<p className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{result.score.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
					{interval ? <span className="inline-flex items-baseline gap-2 border-l pl-4 tabular-nums"><span className="text-xs text-muted-foreground">95% CI</span><span className="text-sm font-medium">{interval.low.toFixed(2)}–{interval.high.toFixed(2)}</span></span> : null}
				</div>
				{result.rank ? <p className="mt-1 text-xs font-medium text-muted-foreground">Ranked #{result.rank}{result.totalModels ? ` of ${result.totalModels}` : ""}</p> : null}
			</div>
			<ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform group-hover:text-foreground", expanded && "rotate-180")} />
		</button>
		{expanded ? <div className="border-b py-5" aria-live="polite">
			<div className="mb-4"><h3 className="text-sm font-medium">ECI leaderboard</h3><p className="text-xs text-muted-foreground">Higher is better · bars show the published 95% confidence interval</p></div>
			{visibleEntries.length ? <ScrollArea className="w-full" scrollBarOrientation="horizontal" keepScrollbarMounted viewportClassName="pb-3"><div className="min-w-[640px] space-y-2.5">{visibleEntries.map((entry) => {
				const ci = parseEpochConfidenceInterval(entry.other_info);
				const selected = entry.model_id === modelId;
				return <div key={entry.model_id} className="grid grid-cols-[2rem_minmax(8rem,13rem)_1fr_auto] items-center gap-2 text-xs">
					<span className="text-right tabular-nums text-muted-foreground">#{entry.rank}</span>
					<Link href={`/models/${entry.model_id}`} className={cn("flex min-w-0 items-center gap-2 truncate font-medium hover:underline", selected && "text-foreground")}><span className="relative size-5 shrink-0 overflow-hidden rounded bg-muted"><Logo id={entry.organisation_id ?? entry.model_id} alt="" fill className="object-contain p-0.5" /></span><span className="truncate">{entry.model_name}</span></Link>
					<div className="relative h-5 rounded-sm bg-muted/60">
						{ci ? <span className={cn("absolute top-1/2 h-px -translate-y-1/2 bg-foreground/55", selected && "bg-foreground")} style={{ left: position(ci.low), width: `calc(${position(ci.high)} - ${position(ci.low)})` }}><span className="absolute -left-px -top-1 h-2 w-px bg-current" /><span className="absolute -right-px -top-1 h-2 w-px bg-current" /></span> : null}
						<span className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground", selected && "size-3 bg-foreground ring-2 ring-background")} style={{ left: position(entry.score) }} />
					</div>
					<span className="w-28 text-right font-medium tabular-nums">{entry.score.toFixed(2)}{ci ? <span className="block text-[10px] font-normal text-muted-foreground">{ci.low.toFixed(2)}–{ci.high.toFixed(2)}</span> : null}</span>
				</div>;
			})}</div></ScrollArea> : <p className="py-4 text-sm text-muted-foreground">Leaderboard data is not available yet.</p>}
			<div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
				<a href={result.sourceLink ?? "https://epoch.ai/eci"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">Source: Epoch AI <ArrowUpRight className="size-3.5" /></a>
				<Button asChild size="sm" variant="outline"><Link href={`/benchmarks/${epochCapabilitiesIndexId}`}>View Full Leaderboard <ArrowUpRight /></Link></Button>
			</div>
		</div> : null}
	</section>;
}
