"use client";

import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { artificialAnalysisChartColour, formatArtificialAnalysisValue } from "@/lib/benchmarks/artificialAnalysis";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";

export function IntelligenceValueBars({ entries }: { entries: PublicIntelligenceValueEntry[] }) {
	const sorted = [...entries].sort((a, b) => a.score - b.score);
	const maximum = Math.max(1, ...sorted.map((entry) => entry.score));
	return <figure className="border-b py-5">
		<figcaption className="mb-4 text-xs text-muted-foreground">USD per intelligence point · Best to worst · Lower is better</figcaption>
		<TooltipProvider delayDuration={120}>
			<ScrollArea scrollBarOrientation="horizontal" keepScrollbarMounted viewportClassName="pb-4" className="w-full">
				<div className="flex gap-3 px-3" style={{ width: Math.max(sorted.length * 76, 520) }}>
					{sorted.map((entry) => <div key={entry.model_id} className="w-16 shrink-0">
						<div className="flex h-56 flex-col justify-end border-b">
							<span className="mb-2 text-center text-xs tabular-nums">{formatArtificialAnalysisValue(entry.score)}</span>
							<Tooltip>
								<TooltipTrigger asChild><button type="button" aria-label={`${entry.model_name}: ${formatArtificialAnalysisValue(entry.score)} per intelligence point`} className="mx-auto w-10 rounded-t-sm border border-foreground/20 outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ height: `${Math.max(2, entry.score / maximum * 180)}px`, backgroundColor: artificialAnalysisChartColour(entry.organisation_id, entry.organisation_colour) }} /></TooltipTrigger>
								<TooltipContent className="space-y-1">
									<p className="font-semibold">{entry.model_name}</p>
									<p>{entry.organisation_name}</p>
									<p>{entry.other_info?.split(";")[0]}</p>
									<p>{formatArtificialAnalysisValue(entry.score)} / intelligence point</p>
								</TooltipContent>
							</Tooltip>
						</div>
						<Link href={`/models/${entry.model_id}`} className="mt-2 block h-16 text-center text-[10px] leading-tight hover:underline">{entry.model_name}</Link>
					</div>)}
				</div>
			</ScrollArea>
		</TooltipProvider>
	</figure>;
}
