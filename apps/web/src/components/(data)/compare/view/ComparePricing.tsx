"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CompareGrid, CompareRow, MODEL_COLOURS, type CompareCell } from "./CompareGrid";
import { bestIndices, doSameJob, requestCost, sortTiers, tierRows, type Workload } from "./compareViewMath";
import type { ComparePriceKind, CompareViewModel, CompareViewPriceRow } from "./types";
import { useCompareFormat } from "./useCompareFormat";

const KIND_ORDER: ComparePriceKind[] = ["input", "output", "cacheRead", "cacheWrite5m", "cacheWrite1h", "cacheWrite"];
const KIND_LABELS = {
	input: "input",
	output: "output",
	cacheRead: "cacheRead",
	cacheWrite5m: "cacheWrite5m",
	cacheWrite1h: "cacheWrite1h",
	cacheWrite: "cacheWrite",
} as const satisfies Record<Exclude<ComparePriceKind, "other">, string>;

export function Segmented<T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: Array<{ value: T; label: string; hint?: string }>;
	value: T;
	onChange: (value: T) => void;
}) {
	return (
		<div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-muted/50 p-0.5">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					role="radio"
					aria-checked={option.value === value}
					onClick={() => onChange(option.value)}
					className={cn(
						"h-8 rounded-md px-2.5 text-xs text-muted-foreground transition-colors sm:h-7",
						option.value === value && "bg-background text-foreground shadow-sm ring-1 ring-border",
					)}
				>
					{option.label}
					{option.hint ? <span className="ml-1 opacity-70">{option.hint}</span> : null}
				</button>
			))}
		</div>
	);
}

type MeterLine = { key: string; label: string; kind: ComparePriceKind; meter?: string };

/** Every price row a tier has across the models: the main token kinds first, then each other meter. */
function meterLines(models: CompareViewModel[], tier: string, label: (row: CompareViewPriceRow) => string, kindLabel: (kind: Exclude<ComparePriceKind, "other">) => string): MeterLine[] {
	const rows = models.flatMap((model) => tierRows(model, tier) ?? []);
	const lines: MeterLine[] = KIND_ORDER.filter((kind) => rows.some((row) => row.kind === kind))
		.map((kind) => ({ key: kind, label: kindLabel(kind as Exclude<ComparePriceKind, "other">), kind }));
	const others = new Map<string, MeterLine>();
	for (const row of rows) {
		if (row.kind === "other" && !others.has(row.meter)) others.set(row.meter, { key: row.meter, label: label(row), kind: "other", meter: row.meter });
	}
	return [...lines, ...others.values()];
}

export function ComparePricing({ models }: { models: CompareViewModel[] }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const tiers = useMemo(() => sortTiers(models.flatMap((model) => Object.keys(model.pricing?.tiers ?? {}))), [models]);
	const [tier, setTier] = useState("standard");
	const activeTier = tiers.includes(tier) ? tier : tiers[0] ?? "standard";
	const sameJob = doSameJob(models);
	const lines = meterLines(models, activeTier, format.meter, (kind) => t(KIND_LABELS[kind]));
	const conditional = models.reduce((sum, model) => sum + (model.pricing?.tiers[activeTier]?.filter((row) => row.conditional).length ?? 0), 0);

	const cells = (line: MeterLine): CompareCell[] => {
		const rows = models.map((model) => {
			const tierPrices = tierRows(model, activeTier);
			if (!tierPrices) return { state: "notOffered" as const };
			const matches = tierPrices.filter((row) => (line.meter ? row.meter === line.meter : row.kind === line.kind));
			if (!matches.length) return { state: "missing" as const };
			return { state: "price" as const, row: matches.reduce((best, row) => (row.price < best.price ? row : best)) };
		});
		const comparable = rows.map((entry) => (entry.state === "price" ? (entry.row.price / entry.row.per) * (entry.row.unit === "token" ? 1_000_000 : 1) : null));
		const units = new Set(rows.flatMap((entry) => (entry.state === "price" ? [entry.row.unit] : [])));
		const best = sameJob && units.size === 1 ? bestIndices(comparable, "lower") : new Set<number>();
		return rows.map((entry, index): CompareCell => {
			if (entry.state === "notOffered") return { content: t("notOffered"), text: "", muted: true };
			if (entry.state === "missing") {
				const automatic = line.kind === "cacheWrite5m" || line.kind === "cacheWrite1h" || line.kind === "cacheWrite";
				return { content: automatic ? t("noWriteFee") : t("noPricePublished"), text: "", muted: true };
			}
			return { content: format.price(entry.row), text: `${entry.row.price}/${entry.row.per}`, best: best.has(index) };
		});
	};

	return (
		<section id="pricing" aria-labelledby="compare-pricing" className="scroll-mt-32 space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 id="compare-pricing" className="text-base font-semibold">{t("pricing")}</h2>
					<p className="text-xs text-muted-foreground">{t("pricingSub")}</p>
				</div>
				{tiers.length > 1 ? (
					<Segmented label={t("tier")} value={activeTier} onChange={setTier} options={tiers.map((value) => ({ value, label: format.tier(value) }))} />
				) : null}
			</div>
			{lines.length ? (
				<CompareGrid label={t("pricing")}>
					<div role="row" className="hidden border-b border-border/70 pb-1 text-xs text-muted-foreground sm:grid sm:[grid-template-columns:var(--compare-columns)] sm:gap-x-3">
						<span role="columnheader" />
						{models.map((model) => (
							<span key={model.id} role="columnheader" className="px-3">
								{model.pricing ? (model.pricing.provider.routed ? model.pricing.provider.name : t("listedOnly", { provider: model.pricing.provider.name })) : t("notPriced")}
							</span>
						))}
						<span role="columnheader" />
					</div>
					{lines.map((line, index) => (
						<CompareRow
							key={line.key}
							label={line.label}
							cells={cells(line)}
							note={index === 0 ? t("perMillionUnlessStated") : undefined}
						/>
					))}
				</CompareGrid>
			) : (
				<p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t("noPricing")}</p>
			)}
			<p className="rounded-md border-l-2 border-sky-500 bg-sky-500/5 px-3 py-2 text-xs text-muted-foreground">
				{t(`tierNote.${["standard", "batch", "flex", "priority"].includes(activeTier) ? activeTier : "other"}` as never)}
				{conditional ? ` ${t("conditionalPrices", { count: conditional })}` : ""}
			</p>
		</section>
	);
}

const PRESETS: Record<string, Workload & { requests: number }> = {
	chat: { inputTokens: 2000, outputTokens: 500, cachedShare: 0, requests: 1000 },
	rag: { inputTokens: 12_000, outputTokens: 600, cachedShare: 0.4, requests: 500 },
	agent: { inputTokens: 40_000, outputTokens: 2500, cachedShare: 0.75, requests: 200 },
	bulk: { inputTokens: 6000, outputTokens: 300, cachedShare: 0, requests: 20_000 },
};

function NumberField({ label, value, onChange, max }: { label: string; value: number; onChange: (value: number) => void; max?: number }) {
	const id = useId();
	return (
		<div className="grid gap-1">
			<label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
			<input
				id={id}
				type="number"
				inputMode="numeric"
				min={0}
				max={max}
				value={value}
				onChange={(event) => onChange(Math.max(0, Math.min(max ?? Number.MAX_SAFE_INTEGER, Number(event.target.value) || 0)))}
				className="h-10 rounded-md border border-border bg-background px-3 text-sm tabular-nums sm:h-9"
			/>
		</div>
	);
}

/** Runs in the browser from the prices already on the page, so it costs no server work. */
export function CompareCalculator({ models }: { models: CompareViewModel[] }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const [preset, setPreset] = useState<keyof typeof PRESETS | "custom">("chat");
	const [workload, setWorkload] = useState(PRESETS.chat!);
	const update = (patch: Partial<typeof workload>) => {
		setPreset("custom");
		setWorkload((current) => ({ ...current, ...patch }));
	};
	const results = models.map((model) => {
		const perRequest = requestCost(model, workload);
		return { model, perRequest, perMonth: perRequest == null ? null : perRequest * workload.requests * 30 };
	});
	const monthly = results.map((result) => result.perMonth);
	const max = Math.max(0, ...monthly.filter((value): value is number => value != null));
	const best = bestIndices(monthly, "lower");
	if (results.every((result) => result.perRequest == null)) return null;

	return (
		<section aria-labelledby="compare-calculator" className="space-y-3">
			<div>
				<h2 id="compare-calculator" className="text-base font-semibold">{t("calculator")}</h2>
				<p className="text-xs text-muted-foreground">{t("calculatorSub")}</p>
			</div>
			<div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
				<div className="space-y-3">
					<Segmented
						label={t("workload")}
						value={preset}
						onChange={(value) => {
							setPreset(value);
							if (value !== "custom") setWorkload(PRESETS[value]!);
						}}
						options={[
							{ value: "chat", label: t("presetChat") },
							{ value: "rag", label: t("presetRag") },
							{ value: "agent", label: t("presetAgent") },
							{ value: "bulk", label: t("presetBulk") },
						]}
					/>
					<div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
						<NumberField label={t("inputTokensPerRequest")} value={workload.inputTokens} onChange={(inputTokens) => update({ inputTokens })} />
						<NumberField label={t("outputTokensPerRequest")} value={workload.outputTokens} onChange={(outputTokens) => update({ outputTokens })} />
						<NumberField label={t("cachedShare")} value={Math.round(workload.cachedShare * 100)} max={100} onChange={(value) => update({ cachedShare: value / 100 })} />
						<NumberField label={t("requestsPerDay")} value={workload.requests} onChange={(requests) => update({ requests })} />
					</div>
				</div>
				<div role="table" aria-label={t("calculator")} className="min-w-0">
					<div role="row" className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-3 border-b border-border/70 pb-1 text-xs text-muted-foreground sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_6rem_7rem]">
						<span role="columnheader">{t("model")}</span>
						<span role="columnheader" className="hidden sm:block">{t("monthlyCost")}</span>
						<span role="columnheader" className="text-right">{t("perRequest")}</span>
						<span role="columnheader" className="text-right">{t("perMonth")}</span>
					</div>
					{results.map((result, index) => (
						<div key={result.model.id} role="row" className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-3 border-b border-border/70 py-2.5 text-sm sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_6rem_7rem]">
							<span role="rowheader" className="truncate">{result.model.name}</span>
							<span role="cell" className="hidden h-2.5 overflow-hidden rounded-sm bg-muted sm:block">
								{result.perMonth != null && max > 0 ? (
									<span className="block h-full rounded-sm" style={{ width: `${(result.perMonth / max) * 100}%`, background: MODEL_COLOURS[index] }} />
								) : null}
							</span>
							<span role="cell" className="text-right tabular-nums">{result.perRequest == null ? t("notPriced") : format.usd(result.perRequest)}</span>
							<span role="cell" className={cn("text-right tabular-nums", best.has(index) && "font-semibold text-emerald-700 dark:text-emerald-300")}>
								{result.perMonth == null ? "–" : format.usd(result.perMonth)}
							</span>
						</div>
					))}
					<p className="mt-2 text-xs text-muted-foreground">{t("calculatorNote")}</p>
				</div>
			</div>
		</section>
	);
}
