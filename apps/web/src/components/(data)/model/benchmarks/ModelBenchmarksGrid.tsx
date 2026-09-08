"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";

function BenchmarkRow({ item }: { item: ModelBenchmarkHighlight }) {
	const [open, setOpen] = useState(false);
	return <Collapsible open={open} onOpenChange={setOpen} className="border-b">
		<div className="flex min-h-14 items-center gap-3 py-2">
			<div className="min-w-0 flex-1"><Link href={`/benchmarks/${item.benchmarkId}`} className="text-sm font-medium hover:underline">{item.benchmarkName}</Link>{item.isSelfReported ? <span className="ml-2 text-xs text-muted-foreground">Self-reported</span> : null}</div>
			<span className="shrink-0 text-sm font-semibold tabular-nums">{item.scoreDisplay}</span>
			{item.sourceLink ? <Button asChild variant="ghost" size="icon-sm"><a href={item.sourceLink} target="_blank" rel="noreferrer" aria-label={`Open source for ${item.benchmarkName}`}><ExternalLink /></a></Button> : null}
			{item.otherInfo ? <CollapsibleTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Show details for ${item.benchmarkName}`} className={open ? "text-foreground" : "text-muted-foreground"}><Info /></Button></CollapsibleTrigger> : null}
		</div>
		{item.otherInfo ? <CollapsibleContent className="pb-3 pr-20 text-xs leading-5 text-muted-foreground">{item.otherInfo}</CollapsibleContent> : null}
	</Collapsible>;
}

export function ModelBenchmarksGrid({ highlights }: { highlights: ModelBenchmarkHighlight[] }) {
	const [search, setSearch] = useState("");
	const [showAll, setShowAll] = useState(false);
	const filtered = [...highlights].filter((item) => item.benchmarkName.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (b.totalModels ?? 0) - (a.totalModels ?? 0) || a.benchmarkName.localeCompare(b.benchmarkName));
	const visible = showAll || search ? filtered : filtered.slice(0, 8);
	return <div>
		{highlights.length > 8 ? <Input aria-label="Search model benchmarks" placeholder="Search benchmarks" value={search} onChange={(event) => setSearch(event.target.value)} className="mb-2 sm:max-w-xs" /> : null}
		<div>{visible.map((item) => <BenchmarkRow key={item.benchmarkId} item={item} />)}</div>
		{!filtered.length ? <p className="py-6 text-sm text-muted-foreground">No benchmarks match your search.</p> : null}
		{!search && filtered.length > 8 ? <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer benchmarks" : `Show all ${filtered.length} benchmarks`}<ChevronDown className={cn("transition-transform", showAll && "rotate-180")} /></Button> : null}
	</div>;
}
