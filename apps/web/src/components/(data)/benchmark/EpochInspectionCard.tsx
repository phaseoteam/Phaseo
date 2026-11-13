import { useLocale, useTranslations } from "@/i18n/react";
import { ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Logo } from "@/components/Logo";
import { Link } from "@/i18n/navigation";
import type { EpochDashboardRow, EpochMetric } from "@/lib/benchmarks/epochDashboard";

export function epochCreatorId(organisation: string) {
	const known: Record<string, string> = { Anthropic: "anthropic", OpenAI: "openai", "Google DeepMind": "google", "Meta AI": "meta", "Mistral AI": "mistral", "Z.ai (Zhipu AI)": "z-ai", Moonshot: "moonshotai" };
	return known[organisation] ?? organisation.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function EpochInspectionCard({ row, comparison, metric, pinned, keep, leave, close }: {
	row: EpochDashboardRow; comparison?: EpochDashboardRow; metric: EpochMetric; pinned: boolean;
	keep: () => void; leave: () => void; close: () => void;
}) {
	const t = useTranslations("Catalogue.benchmarks.epochExplorer"), ta = useTranslations("Catalogue.benchmarks.explorer"), locale = useLocale();
	const number = (value: number | null) => value === null ? "—" : value.toLocaleString(locale, { maximumFractionDigits: 2 });
	const date = row.date ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(row.date)) : "—";
	return <div data-export-hide role="status" data-pinned={pinned || undefined} onMouseEnter={keep} onMouseLeave={leave} onFocus={keep} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) leave(); }} className={`${comparison ? "w-[22rem]" : "w-64"} max-w-full rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md`}>
		<div className="flex items-start gap-2"><Logo id={epochCreatorId(row.organisation)} alt="" width={18} height={18} /><div className="min-w-0 flex-1"><p className="font-semibold">{row.name}</p><p className="mt-1 text-muted-foreground">{row.organisation}{pinned ? ` · ${ta("pinned")}` : ""}</p></div><Button size="icon" variant="ghost" className="-mt-1 -mr-1 size-7" aria-label={t("close")} onClick={close}><X className="size-3.5" /></Button></div>
		{comparison ? <div className="my-3"><p className="mb-2 text-muted-foreground">{t("comparedWith", { model: comparison.name })}</p><Table wrapInContainer={false} className="w-full text-right text-xs tabular-nums"><TableHeader className="text-[10px] text-muted-foreground [&_tr]:border-0"><TableRow className="hover:bg-transparent dark:hover:bg-transparent"><TableHead className="h-auto p-0 sr-only">{t("index")}</TableHead><TableHead className="h-auto p-0 pb-2 text-right font-normal text-inherit dark:text-inherit">{ta("selected")}</TableHead><TableHead className="h-auto p-0 pb-2 pl-2 text-right font-normal text-inherit dark:text-inherit">{ta("hovered")}</TableHead><TableHead className="h-auto p-0 pb-2 pl-2 text-right font-normal text-inherit dark:text-inherit">{t("points")}</TableHead></TableRow></TableHeader><TableBody>{(["overall", "coding", "maths"] as const).map((key) => { const a = comparison.scores[key], b = row.scores[key], delta = a !== null && b !== null ? b - a : null; return <TableRow key={key} className="border-0 hover:bg-transparent dark:hover:bg-transparent"><TableHead scope="row" className="h-auto p-0 py-1 pr-2 text-left text-[11px] font-normal text-muted-foreground dark:text-muted-foreground">{t(key)}</TableHead><TableCell className="p-0">{number(a)}</TableCell><TableCell className="p-0 pl-2 font-medium">{number(b)}</TableCell><TableCell className="p-0 whitespace-nowrap pl-2 text-muted-foreground">{delta !== null && delta > 0 ? "+" : ""}{number(delta)}</TableCell></TableRow>; })}</TableBody></Table></div> : <dl className="my-3 space-y-2">{(["overall", "coding", "maths"] as const).map((key) => <div key={key} className="flex justify-between gap-4"><dt className="text-muted-foreground">{t(key)}</dt><dd className="font-medium tabular-nums">{number(row.scores[key])}</dd></div>)}</dl>}
		<p className="text-muted-foreground">{date} · {t(row.access)}</p>
		{comparison && metric === "overall" ? <div className="mt-3 space-y-2 border-t pt-3 text-muted-foreground"><p>{t("confidence")}</p>{[comparison, row].map((model) => <div key={model.id} className="flex justify-between gap-3"><span className="truncate">{model.name}</span><span className="shrink-0 tabular-nums">{model.interval ? `${number(model.interval.low)}–${number(model.interval.high)}` : t("intervalUnavailable")}</span></div>)}<p className="text-[10px]">{t("overlapNote")}</p></div> : null}
		{metric === "overall" && !comparison ? <p className="mt-2 text-muted-foreground">{t("confidence")}: {row.interval ? `${number(row.interval.low)}–${number(row.interval.high)}` : t("intervalUnavailable")}</p> : null}
		{metric !== "overall" ? <p className="mt-2 text-muted-foreground">{t("benchmarkCount", { count: row.counts[metric] })}</p> : null}
		{row.modelId ? <Link href={`/models/${row.modelId}`} className="mt-3 inline-flex items-center gap-1 underline underline-offset-4">{t("modelPage")}<ArrowUpRight className="size-3" /></Link> : null}
	</div>;
}
