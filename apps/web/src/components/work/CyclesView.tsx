"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { CalendarRange, Plus, Redo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { createWorkCycle, rolloverWorkCycle } from "@/app/(dashboard)/work/actions";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cycleBurnUp, cycleIsCurrent, nextCycleDates } from "@/lib/work/insights";
import type { WorkCycle } from "@/lib/work/types";
import { useDayFormat } from "./ProjectsView";
import { useWorkAction } from "./useWorkAction";
import { ProgressBar } from "./WorkBits";
import { WORK_NEUTRAL, seriesTheme } from "./workChart";

function useCycleName() {
	const t = useTranslations("Work.item");
	return (cycle: Pick<WorkCycle, "name" | "number">) => cycle.name || t("cycleNumber", { number: cycle.number });
}

export function CyclesView({ cycles, current }: { cycles: WorkCycle[]; current: WorkCycle | null }) {
	const t = useTranslations("Work.cycles");
	const formatDay = useDayFormat();
	const cycleName = useCycleName();
	const [creating, setCreating] = useState(false);
	const [rolling, setRolling] = useState<WorkCycle | null>(null);
	const today = new Date().toISOString().slice(0, 10);
	const history = [...cycles].sort((a, b) => b.number - a.number);
	const active = current ?? cycles.find((cycle) => cycleIsCurrent(cycle, today)) ?? null;
	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold">{t("title")}</h2>
					<p className="text-sm text-muted-foreground">{t("description")}</p>
				</div>
				<Button type="button" size="sm" onClick={() => setCreating(true)}><Plus aria-hidden="true" />{t("createNext")}</Button>
			</div>

			{active ? (
				<section aria-labelledby="work-current-cycle" className="space-y-3">
					<div className="flex flex-wrap items-baseline justify-between gap-3">
						<div className="space-y-0.5">
							<p className="text-xs text-muted-foreground">{t("current")}</p>
							<h3 id="work-current-cycle" className="text-lg font-semibold">{cycleName(active)}</h3>
							<p className="flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarRange className="size-3.5" aria-hidden="true" />{t("dates", { start: formatDay(active.startsOn), end: formatDay(active.endsOn) })}</p>
						</div>
						<dl className="flex flex-wrap gap-6 text-sm">
							<div><dt className="text-xs text-muted-foreground">{t("scope")}</dt><dd className="text-lg font-semibold tabular-nums">{active.scope ?? "—"}</dd></div>
							<div><dt className="text-xs text-muted-foreground">{t("completed")}</dt><dd className="text-lg font-semibold tabular-nums">{active.completed ?? "—"}</dd></div>
							<div><dt className="text-xs text-muted-foreground">{t("items")}</dt><dd className="text-lg font-semibold tabular-nums">{t("doneOf", { done: active.doneCount, total: active.itemCount })}</dd></div>
						</dl>
					</div>
					<BurnUpChart cycle={active} />
					<div className="flex flex-wrap gap-2">
						{active.itemCount > active.doneCount ? <Button type="button" size="sm" variant="outline" onClick={() => setRolling(active)}><Redo2 aria-hidden="true" />{t("rollover")}</Button> : null}
					</div>
				</section>
			) : <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{t("noCurrent")}</p>}

			<section aria-labelledby="work-cycle-history" className="space-y-2">
				<h3 id="work-cycle-history" className="text-sm font-medium">{t("history")}</h3>
				{history.length ? (
					<div className="overflow-x-auto rounded-md border">
						<table className="w-full text-sm">
							<thead className="border-b text-left text-xs text-muted-foreground">
								<tr>
									<th className="px-3 py-2 font-normal">{t("cycle")}</th>
									<th className="px-3 py-2 font-normal">{t("datesLabel")}</th>
									<th className="px-3 py-2 font-normal">{t("items")}</th>
									<th className="px-3 py-2 text-right font-normal">{t("scope")}</th>
									<th className="px-3 py-2 text-right font-normal">{t("completed")}</th>
									<th className="px-3 py-2 font-normal"><span className="sr-only">{t("actions")}</span></th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{history.map((cycle) => {
									const ended = cycle.endsOn < today;
									return (
										<tr key={cycle.id} className={cycle.id === active?.id ? "bg-muted/40" : undefined}>
											<td className="px-3 py-2 font-medium">{cycleName(cycle)}</td>
											<td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{t("dates", { start: formatDay(cycle.startsOn), end: formatDay(cycle.endsOn) })}</td>
											<td className="px-3 py-2 whitespace-nowrap">
												<ProgressBar value={cycle.itemCount ? cycle.doneCount / cycle.itemCount : 0} label={t("progressOf", { name: cycleName(cycle) })} />
												<span className="ml-2 text-xs text-muted-foreground tabular-nums">{t("doneOf", { done: cycle.doneCount, total: cycle.itemCount })}</span>
											</td>
											<td className="px-3 py-2 text-right tabular-nums">{cycle.scope ?? "—"}</td>
											<td className="px-3 py-2 text-right tabular-nums">{cycle.completed ?? "—"}</td>
											<td className="px-3 py-2 text-right">
												{(ended || cycle.id === active?.id) && cycle.itemCount > cycle.doneCount ? <Button type="button" size="xs" variant="ghost" onClick={() => setRolling(cycle)}><Redo2 aria-hidden="true" />{t("rollover")}</Button> : null}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : <p className="text-sm text-muted-foreground">{t("empty")}</p>}
			</section>

			{creating ? <CreateCycleDialog cycles={cycles} onClose={() => setCreating(false)} /> : null}
			{rolling ? <RolloverDialog cycle={rolling} onClose={() => setRolling(null)} /> : null}
		</div>
	);
}

function BurnUpChart({ cycle }: { cycle: WorkCycle }) {
	const t = useTranslations("Work.cycles");
	const formatDay = useDayFormat();
	const rows = useMemo(() => cycleBurnUp(cycle), [cycle]);
	const config = {
		scope: { label: t("scope"), theme: WORK_NEUTRAL },
		ideal: { label: t("ideal"), theme: WORK_NEUTRAL },
		completed: { label: t("completed"), theme: seriesTheme(0) },
	} satisfies ChartConfig;
	if (!rows.length) return null;
	return (
		<figure className="space-y-1">
			<figcaption className="text-xs text-muted-foreground">{t("burnUpCaption")}</figcaption>
			<ChartContainer config={config} className="aspect-auto h-48 w-full max-w-3xl">
				<LineChart data={rows} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
					<CartesianGrid vertical={false} />
					<XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(value: string) => formatDay(value)} />
					<YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
					<ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => formatDay(String(label))} />} />
					<ChartLegend content={<ChartLegendContent />} />
					<Line dataKey="scope" type="stepAfter" stroke="var(--color-scope)" strokeWidth={2} dot={false} isAnimationActive={false} />
					<Line dataKey="ideal" type="linear" stroke="var(--color-ideal)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
					<Line dataKey="completed" type="linear" stroke="var(--color-completed)" strokeWidth={2} connectNulls dot={{ r: 4, fill: "var(--color-completed)" }} isAnimationActive={false} />
				</LineChart>
			</ChartContainer>
		</figure>
	);
}

function CreateCycleDialog({ cycles, onClose }: { cycles: WorkCycle[]; onClose: () => void }) {
	const t = useTranslations("Work.cycles");
	const tCommon = useTranslations("Work.common");
	const { perform, busy } = useWorkAction();
	const id = useId();
	const [draft, setDraft] = useState(() => ({ name: "", ...nextCycleDates(cycles) }));
	const [error, setError] = useState<string | null>(null);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		if (!draft.startsOn || !draft.endsOn || draft.endsOn <= draft.startsOn) return setError(t("datesInvalid"));
		setError(null);
		const result = await perform("cycle", () => createWorkCycle({ name: draft.name.trim() || null, startsOn: draft.startsOn, endsOn: draft.endsOn }));
		if (result.ok) onClose();
	};
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-md">
				<form onSubmit={submit} className="space-y-4">
					<DialogHeader>
						<DialogTitle>{t("createNext")}</DialogTitle>
						<DialogDescription>{t("createDescription")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-name`}>{t("name")}</Label>
						<Input id={`${id}-name`} maxLength={120} value={draft.name} placeholder={t("namePlaceholder")} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="rounded-md" />
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-start`}>{t("startsOn")}</Label>
							<Input id={`${id}-start`} type="date" value={draft.startsOn} onChange={(event) => setDraft({ ...draft, startsOn: event.target.value })} className="rounded-md" />
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-end`}>{t("endsOn")}</Label>
							<Input id={`${id}-end`} type="date" value={draft.endsOn} onChange={(event) => setDraft({ ...draft, endsOn: event.target.value })} className="rounded-md" />
						</div>
					</div>
					{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
						<Button type="submit" disabled={busy !== null}>{tCommon("create")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function RolloverDialog({ cycle, onClose }: { cycle: WorkCycle; onClose: () => void }) {
	const t = useTranslations("Work.cycles");
	const tCommon = useTranslations("Work.common");
	const cycleName = useCycleName();
	const { perform, busy } = useWorkAction();
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("rolloverTitle")}</DialogTitle>
					<DialogDescription>{t("rolloverDescription", { count: cycle.itemCount - cycle.doneCount, name: cycleName(cycle) })}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
					<Button type="button" disabled={busy !== null} onClick={async () => {
						const result = await perform("rollover", () => rolloverWorkCycle(cycle.id));
						if (result.ok) {
							toast.success(t("rolledOver", { count: Number(result.moved) || 0 }));
							onClose();
						}
					}}>{t("rollover")}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
