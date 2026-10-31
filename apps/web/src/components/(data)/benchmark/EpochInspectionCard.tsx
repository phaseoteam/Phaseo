"use client";

import { useLocale, useTranslations } from "@/i18n/react";
import { ArrowUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
		{comparison ? <div className="my-3"><p className="mb-2 text-muted-foreground">{t("comparedWith", { model: comparison.name })}</p><table className="w-full text-right tabular-nums"><thead className="text-[10px] text-muted-foreground"><tr><th className="sr-only">{t("index")}</th><th className="pb-2 font-normal">{ta("selected")}</th><th className="pb-2 pl-2 font-normal">{ta("hovered")}</th><th className="pb-2 pl-2 font-normal">{t("points")}</th></tr></thead><tbody>{(["overall", "coding", "maths"] as const).map((key) => { const a = comparison.scores[key], b = row.scores[key], delta = a !== null && b !== null ? b - a : null; return <tr key={key}><th scope="row" className="py-1 pr-2 text-left text-[11px] font-normal text-muted-foreground">{t(key)}</th><td>{number(a)}</td><td className="pl-2 font-medium">{number(b)}</td><td className="whitespace-nowrap pl-2 text-muted-foreground">{delta !== null && delta > 0 ? "+" : ""}{number(delta)}</td></tr>; })}</tbody></table></div> : <dl className="my-3 space-y-2">{(["overall", "coding", "maths"] as const).map((key) => <div key={key} className="flex justify-between gap-4"><dt className="text-muted-foreground">{t(key)}</dt><dd className="font-medium tabular-nums">{number(row.scores[key])}</dd></div>)}</dl>}
		<p className="text-muted-foreground">{date} · {t(row.access)}</p>
		{comparison && metric === "overall" ? <div className="mt-3 space-y-2 border-t pt-3 text-muted-foreground"><p>{t("confidence")}</p>{[comparison, row].map((model) => <div key={model.id} className="flex justify-between gap-3"><span className="truncate">{model.name}</span><span className="shrink-0 tabular-nums">{model.interval ? `${number(model.interval.low)}–${number(model.interval.high)}` : t("intervalUnavailable")}</span></div>)}<p className="text-[10px]">{t("overlapNote")}</p></div> : null}
		{metric === "overall" && !comparison ? <p className="mt-2 text-muted-foreground">{t("confidence")}: {row.interval ? `${number(row.interval.low)}–${number(row.interval.high)}` : t("intervalUnavailable")}</p> : null}
		{metric !== "overall" ? <p className="mt-2 text-muted-foreground">{t("benchmarkCount", { count: row.counts[metric] })}</p> : null}
		{row.modelId ? <Link href={`/models/${row.modelId}`} className="mt-3 inline-flex items-center gap-1 underline underline-offset-4">{t("modelPage")}<ArrowUpRight className="size-3" /></Link> : null}
	</div>;
}
