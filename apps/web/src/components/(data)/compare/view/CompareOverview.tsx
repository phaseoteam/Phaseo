"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CompareGrid, CompareGroup, CompareNoteRow, CompareRow, MODEL_COLOURS, useCompareGrid, type CompareCell } from "./CompareGrid";
import {
	bestIndices,
	doSameJob,
	ECI_BENCHMARK_ID,
	pickResult,
	priceRow,
	requestCost,
	timeValue,
	TYPICAL_REQUEST,
	visibleOnPhone,
	type Direction,
	type VerdictReason,
	type Verdicts,
} from "./compareViewMath";
import type { CompareViewBenchmark, CompareViewModel, CompareViewUsageByModel } from "./types";
import { useCompareFormat, type CompareFormat } from "./useCompareFormat";

function numericCells(
	values: Array<number | null | undefined>,
	direction: Direction | null,
	render: (value: number, index: number) => React.ReactNode,
	empty: string,
	sub?: (index: number) => React.ReactNode,
): CompareCell[] {
	const best = direction ? bestIndices(values, direction) : new Set<number>();
	return values.map((value, index) => value == null
		? { content: empty, text: "", muted: true, sub: sub?.(index) }
		: { content: render(value, index), text: String(value), best: best.has(index), sub: sub?.(index) });
}

function textCells(values: Array<string | null | undefined>, empty: string): CompareCell[] {
	return values.map((value) => (value ? { content: value, text: value } : { content: empty, text: "", muted: true }));
}

function reasonText(reason: VerdictReason, t: ReturnType<typeof useTranslations>, format: CompareFormat): string {
	switch (reason.type) {
		case "cheapest": return t("reasonCheapest", { value: format.usd(reason.value) });
		case "largestContext": return t("reasonLargestContext", { value: format.tokens(reason.value) });
		case "largestOutput": return t("reasonLargestOutput", { value: format.tokens(reason.value) });
		case "fastest": return t("reasonFastest", { value: format.throughput(reason.value) });
		case "lowestLatency": return t("reasonLowestLatency", { value: format.latency(reason.value) });
		case "topCapability": return t("reasonTopCapability", { value: reason.value.toFixed(1) });
		case "onlyInput": return t("reasonOnlyInput", { modalities: format.modalities(reason.modalities).toLowerCase() });
		case "mostPlans": return t("reasonMostPlans", { count: reason.value });
		case "latestCutoff": return t("reasonLatestCutoff", { value: format.monthYear(reason.value) });
		case "mostRoutes": return t("reasonMostRoutes", { count: reason.value });
	}
}

export function CompareVerdicts({ models, verdicts }: { models: CompareViewModel[]; verdicts: Verdicts }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const { phonePage } = useCompareGrid();
	if (models.length < 2) return null;
	return (
		<section aria-labelledby="compare-verdicts" className="space-y-2">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 id="compare-verdicts" className="text-base font-semibold">{t("atAGlance")}</h2>
				<p className="text-xs text-muted-foreground">{t("atAGlanceSub")}</p>
			</div>
			<div className="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(var(--verdict-columns),minmax(0,1fr))]" style={{ "--verdict-columns": models.length } as React.CSSProperties}>
				{models.map((model, index) => {
					const reasons = verdicts.byModel[model.id] ?? [];
					return (
						<div key={model.id} className={cn("rounded-md border border-border p-3 text-sm", !visibleOnPhone(index, phonePage) && "hidden sm:block")}>
							<p className="mb-1.5 flex items-center gap-2 font-semibold">
								<span aria-hidden className="h-4 w-1 shrink-0 rounded-sm" style={{ background: MODEL_COLOURS[index] }} />
								<span className="min-w-0">{t("chooseFor", { name: model.name })}</span>
							</p>
							{reasons.length ? (
								<ul className="list-disc space-y-1 pl-4 text-muted-foreground">
									{reasons.map((reason) => <li key={reason.type}>{reasonText(reason, t, format)}</li>)}
								</ul>
							) : (
								<p className="text-muted-foreground">{t("noLead")}</p>
							)}
						</div>
					);
				})}
			</div>
			{verdicts.capabilityTie ? <p className="text-xs text-muted-foreground">{t("capabilityTie")}</p> : null}
		</section>
	);
}

export function CompareSpecTable({
	models,
	usage,
	benchmarks,
}: {
	models: CompareViewModel[];
	usage: CompareViewUsageByModel;
	benchmarks: CompareViewBenchmark[];
}) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const { differencesOnly } = useCompareGrid();
	const sameJob = doSameJob(models);
	const priceDirection: Direction | null = sameJob ? "lower" : null;
	const notPriced = t("notPriced");

	const priceCells = (kind: "input" | "output" | "cacheRead") => {
		const rows = models.map((model) => priceRow(model, kind));
		const tokenValues = rows.map((row) => (row && row.unit === "token" ? (row.price / row.per) * 1_000_000 : null));
		const best = priceDirection ? bestIndices(tokenValues, priceDirection) : new Set<number>();
		return rows.map((row, index): CompareCell => {
			const model = models[index]!;
			const sub = kind === "input" && model.pricing
				? model.pricing.provider.routed ? model.pricing.provider.name : t("listedOnly", { provider: model.pricing.provider.name })
				: undefined;
			if (!row) return { content: model.pricing ? t("noPricePublished") : notPriced, text: "", muted: true, sub };
			return { content: format.price(row), text: `${row.price}/${row.per}/${row.unit}`, best: best.has(index), sub };
		});
	};

	const eci = benchmarks.find((benchmark) => benchmark.id === ECI_BENCHMARK_ID);
	const eciScores = models.map((model) => {
		if (!eci) return null;
		const picked = pickResult(eci, model.id, null);
		return picked.kind === "result" ? picked.result : null;
	});
	const feature = (key: keyof CompareViewModel["features"]) =>
		models.map((model): CompareCell => {
			const value = model.features[key];
			if (value == null) return { content: t("noRouteData"), text: "", muted: true };
			return value ? { content: t("yes"), text: "yes" } : { content: t("notListed"), text: "no", muted: true };
		});
	const windowNote = (field: "latencyWindow" | "throughputWindow") => {
		const windows = [...new Set(models.map((model) => usage[model.id]?.[field]).filter(Boolean))];
		if (!windows.length) return undefined;
		return windows.length === 1 ? format.window(windows[0]) : t("windowMixed");
	};

	return (
		<section id="overview" aria-labelledby="compare-overview" className="scroll-mt-32 space-y-2">
			<h2 id="compare-overview" className="sr-only">{t("overview")}</h2>
			<CompareGrid label={t("overview")}>
				<CompareGroup title={t("pricingGroup")} source={sameJob ? t("pricingGroupSource") : t("pricingGroupSourceUnits")} />
				<CompareRow label={t("input")} cells={priceCells("input")} note={sameJob ? t("lowerIsBetter") : t("differentJobs")} />
				<CompareRow label={t("output")} cells={priceCells("output")} />
				<CompareRow label={t("cacheRead")} cells={priceCells("cacheRead")} />
				{sameJob ? (
					<CompareRow
						label={t("typicalRequest")}
						labelSub={t("typicalRequestSub")}
						cells={numericCells(models.map((model) => requestCost(model, TYPICAL_REQUEST)), "lower", (value) => format.usd(value), notPriced)}
						note={t("seeCalculator")}
					/>
				) : null}

				<CompareGroup title={t("limits")} />
				<CompareRow
					label={t("contextWindow")}
					cells={numericCells(models.map((model) => model.contextWindow?.tokens), "higher", (value) => format.tokens(value), t("notPublished"),
						(index) => (models[index]!.contextWindow?.source === "providers" ? t("fromProviders") : undefined))}
					note={t("tokens")}
				/>
				<CompareRow
					label={t("maxOutput")}
					cells={numericCells(models.map((model) => model.maxOutput?.tokens), "higher", (value) => format.tokens(value), t("notPublished"),
						(index) => (models[index]!.maxOutput?.source === "providers" ? t("fromProviders") : undefined))}
					note={t("tokensPerRequest")}
				/>

				<CompareGroup title={t("featuresGroup")} source={t("featuresGroupSource")} />
				<CompareRow label={t("takes")} cells={textCells(models.map((model) => format.modalities(model.inputTypes)), t("notPublished"))} />
				<CompareRow label={t("returns")} cells={textCells(models.map((model) => format.modalities(model.outputTypes)), t("notPublished"))} />
				<CompareRow label={t("tools")} cells={feature("tools")} />
				<CompareRow label={t("structuredOutputs")} cells={feature("structuredOutputs")} />
				<CompareRow label={t("reasoning")} cells={feature("reasoning")} />
				<CompareRow label={t("webSearch")} cells={feature("webSearch")} />

				<CompareGroup title={t("onPhaseo")} source={t("onPhaseoSource")} />
				<CompareRow
					label={t("routes")}
					cells={numericCells(models.map((model) => model.providers.length), "higher", (value) => t("routeCount", { count: value }), t("noRoutes"))}
				/>
				<CompareRow
					label={t("latency")}
					cells={numericCells(models.map((model) => usage[model.id]?.latencyP50Ms30m), "lower", (value) => format.latency(value), t("noTraffic"))}
					note={windowNote("latencyWindow")}
				/>
				<CompareRow
					label={t("throughput")}
					cells={numericCells(models.map((model) => usage[model.id]?.throughputP50TokPerSec30m), "higher", (value) => format.throughput(value), t("noTraffic"))}
					note={windowNote("throughputWindow")}
				/>
				<CompareRow
					label={t("requests24h")}
					cells={numericCells(models.map((model) => usage[model.id]?.totalRequests || null), null, (value) => format.tokens(value), t("noTraffic"))}
				/>

				{eci ? (
					<>
						<CompareGroup title={t("benchmarksGroup")} source={t("eciSource")} />
						<CompareRow
							label={eci.name}
							cells={numericCells(eciScores.map((result) => result?.score), "higher", (value) => value.toFixed(1), t("notReported"),
								(index) => {
									const ci = eciScores[index]?.ci;
									return ci ? t("interval", { low: ci[0].toFixed(1), high: ci[1].toFixed(1) }) : undefined;
								})}
							note={t("higherIsBetter")}
						/>
					</>
				) : null}

				<CompareGroup title={t("details")} />
				<CompareRow
					label={t("released")}
					cells={models.map((model): CompareCell => model.releaseDate
						? { content: format.date(model.releaseDate), text: model.releaseDate }
						: { content: t("notPublished"), text: "", muted: true })}
				/>
				<CompareRow
					label={t("knowledgeCutoff")}
					cells={numericCells(models.map((model) => timeValue(model.knowledgeCutoff)), "higher",
						(_, index) => format.monthYear(models[index]!.knowledgeCutoff!), t("notPublished"))}
					note={t("laterIsBetter")}
				/>
				<CompareRow label={t("status")} cells={textCells(models.map((model) => format.status(model.status)), t("notPublished"))} />
				<CompareRow label={t("licence")} cells={textCells(models.map((model) => model.licence), t("notPublished"))} />
				<CompareRow
					label={t("subscriptionPlans")}
					cells={models.map((model): CompareCell => model.subscriptionPlans.length
						? {
							content: t("planCount", { count: model.subscriptionPlans.length }),
							text: String(model.subscriptionPlans.length),
							sub: model.subscriptionPlans.slice(0, 3).map((plan) => plan.name).join(", ") + (model.subscriptionPlans.length > 3 ? "…" : ""),
						}
						: { content: t("noPlans"), text: "", muted: true })}
				/>
				<CompareRow
					label={t("docs")}
					cells={models.map((model): CompareCell => model.links.apiReference
						? {
							content: <a href={model.links.apiReference} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t("openDocs")}</a>,
							text: model.links.apiReference,
						}
						: { content: t("notPublished"), text: "", muted: true })}
				/>
				{differencesOnly ? <CompareNoteRow>{t("sameRowsHidden")}</CompareNoteRow> : null}
			</CompareGrid>
		</section>
	);
}
