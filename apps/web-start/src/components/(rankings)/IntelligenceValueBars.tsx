"use client";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/Logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { IntelligenceValueHoverCard } from "./IntelligenceValueHoverCard";
import { artificialAnalysisChartColour, artificialAnalysisValueKey, artificialAnalysisValueLabel, formatArtificialAnalysisValue } from "@/lib/benchmarks/artificialAnalysis";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { useLocale, useTranslations } from "next-intl";
import { localizedBenchmarkConfiguration } from "@/i18n/benchmark-display";

export function IntelligenceValueBars({ entries, total = entries.length }: { entries: PublicIntelligenceValueEntry[]; total?: number }) {
	const locale = useLocale();
	const t = useTranslations();
	const tValue = useTranslations("Catalogue.rankings.intelligenceValue");
	const configurationLabel = (entry: PublicIntelligenceValueEntry) => artificialAnalysisValueLabel(entry, (variant) => localizedBenchmarkConfiguration(variant, t));

 const sorted = [...entries].sort((a, b) => a.score - b.score);
 const maximum = Math.max(1, ...sorted.map((entry) => entry.score));
 return <figure className="border-b py-5">
  <figcaption className="mb-4 text-xs text-muted-foreground">{tValue("barsCaption")}</figcaption>
  <ScrollArea scrollBarOrientation="horizontal" viewportClassName="pb-3" className="w-full">
   <div className="relative h-[360px] border-b" style={{ width: Math.max(sorted.length * 54 + 144, 480), minWidth: "100%" }}>
    <div className="pointer-events-none absolute inset-x-16 bottom-[140px] top-4 flex flex-col justify-between">{[0, 1, 2, 3, 4].map((line) => <span key={line} className="border-t border-dashed border-border/70" />)}</div>
    <div className="absolute inset-x-16 bottom-0 top-4 flex items-end gap-1.5">
     {sorted.map((entry) => <HoverCard key={artificialAnalysisValueKey(entry)}>
      <HoverCardTrigger asChild delay={80} closeDelay={80}><div tabIndex={0} aria-label={tValue("barAria", { model: entry.model_name, cost: formatArtificialAnalysisValue(entry.score, locale), configuration: configurationLabel(entry) })} className="group flex h-full min-w-12 flex-1 basis-12 flex-col items-center justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
       <span className="relative flex w-8 shrink-0 items-end justify-center rounded-t-[3px] border border-foreground/20 text-[10px] font-semibold tabular-nums group-hover:brightness-110 sm:w-9" style={{ height: `${Math.max(3, entry.score / maximum * 205)}px`, backgroundColor: artificialAnalysisChartColour(entry.organisation_id, entry.organisation_colour) }}><span className="absolute bottom-full mb-1 text-foreground">{formatArtificialAnalysisValue(entry.score, locale)}</span></span>
       <span className="relative my-1 size-4 shrink-0"><Logo id={entry.organisation_id ?? entry.model_id} alt="" fill className="object-contain" /></span>
       <div className="relative h-[112px] w-full"><Link href={`/models/${entry.model_id}`} className="absolute right-1/2 top-0 line-clamp-2 w-24 origin-top-right -rotate-[55deg] whitespace-normal break-words text-right text-[11px] leading-[1.15] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{entry.model_name} <span className="text-muted-foreground">({configurationLabel(entry)})</span></Link></div>
      </div></HoverCardTrigger>
      <IntelligenceValueHoverCard entry={entry} total={total} />
     </HoverCard>)}
    </div>
   </div>
  </ScrollArea>
 </figure>;
}
