import { useId, useState } from "react";
import { useTranslations } from "@/i18n/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompareGrid, CompareRow, CompareSection, GRID_CLASS, MODEL_COLOURS, useCompareGrid, type CompareCell } from "./CompareGrid";
import { bestIndices, doSameJob, extraBands, requestCost, tierRows, TYPICAL_REQUEST, visibleOnPhone, type Workload } from "./compareViewMath";
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

/** Every price row the chosen tiers have across the models: the main token kinds, then each other meter. */
function meterLines(
	models: CompareViewModel[],
	tiers: string[],
	label: (row: CompareViewPriceRow) => string,
	kindLabel: (kind: Exclude<ComparePriceKind, "other">) => string,
): { main: MeterLine[]; other: MeterLine[] } {
	const rows = models.flatMap((model, index) => tierRows(model, tiers[index]!) ?? []);
	const main: MeterLine[] = KIND_ORDER.filter((kind) => rows.some((row) => row.kind === kind))
		.map((kind) => ({ key: kind, label: kindLabel(kind as Exclude<ComparePriceKind, "other">), kind }));
	const other = new Map<string, MeterLine>();
	for (const row of rows) {
		if (row.kind === "other" && !other.has(row.meter)) other.set(row.meter, { key: row.meter, label: label(row), kind: "other", meter: row.meter });
	}
	return { main, other: [...other.values()] };
}

/** Which route and tier each column is priced on, under the sticky pickers' column. */
function RouteCaptionRow({ models, tiers }: { models: CompareViewModel[]; tiers: string[] }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const { phonePage } = useCompareGrid();
	return (
		<div role="row" className={cn(GRID_CLASS, "border-b border-border/60 pb-2 text-xs text-muted-foreground")}>
			<span role="columnheader" className="hidden sm:block sm:px-3">{t("pricedOn")}</span>
			{models.map((model, index) => (
				<span key={model.id} role="columnheader" className={cn("min-w-0 truncate sm:px-3", !visibleOnPhone(index, phonePage) && "hidden sm:block")}>
					{model.pricing
						? `${model.pricing.provider.routed ? model.pricing.provider.name : t("listedOnly", { provider: model.pricing.provider.name })} · ${format.tier(tiers[index]!)}`
						: t("notPriced")}
				</span>
			))}
		</div>
	);
}

export function ComparePricing({ models, tiers }: { models: CompareViewModel[]; tiers: string[] }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const [showAll, setShowAll] = useState(false);
	const sameJob = doSameJob(models);
	const { main, other } = meterLines(models, tiers, format.meter, (kind) => t(KIND_LABELS[kind]));
	const perMillion = t("perMillionTokens");

	const priceContent = (row: CompareViewPriceRow) => (row.unit === "token"
		? <>{format.price(row)}<span className="ml-1 text-xs font-normal text-muted-foreground">{perMillion}</span></>
		: format.price(row));

	const cells = (line: MeterLine): CompareCell[] => {
		const rows = models.map((model, index) => {
			const tierPrices = tierRows(model, tiers[index]!);
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
				return { content: automatic ? t("noWriteFee") : "—", text: "", muted: true };
			}
			const bands = extraBands(models[index]!, tiers[index]!, entry.row);
			return {
				content: priceContent(entry.row),
				text: `${entry.row.price}/${entry.row.per}`,
				best: best.has(index),
				sub: bands.length ? (
					<span className="mt-0.5 block space-y-0.5">
						{entry.row.condition ? <span className="block">{t("bandPrice", { condition: entry.row.condition, price: format.price(entry.row) })}</span> : null}
						{bands.map((band) => <span key={band.condition ?? band.price} className="block">{t("bandPrice", { condition: band.condition ?? "", price: format.price(band) })}</span>)}
					</span>
				) : undefined,
			};
		});
	};

	const typicalCells = (): CompareCell[] => {
		const costs = models.map((model, index) => requestCost(model, TYPICAL_REQUEST, tiers[index]));
		const best = bestIndices(costs, "lower");
		return costs.map((cost, index) => (cost == null
			? { content: t("notPriced"), text: "", muted: true }
			: { content: format.usd(cost), text: String(cost), best: best.has(index) }));
	};

	const anyPriced = models.some((model) => model.pricing);
	return (
		<CompareSection id="pricing" title={t("pricing")} description={sameJob ? t("pricingSubRoute") : t("pricingGroupSourceUnits")}>
			{anyPriced ? (
				<CompareGrid label={t("pricing")}>
					<RouteCaptionRow models={models} tiers={tiers} />
					{main.map((line) => <CompareRow key={line.key} label={line.label} cells={cells(line)} />)}
					{sameJob ? (
						<CompareRow
							label={t("typicalRequest")}
							labelSub={t("typicalRequestSub")}
							cells={typicalCells()}
						/>
					) : null}
					{showAll ? other.map((line) => <CompareRow key={line.key} label={line.label} cells={cells(line)} />) : null}
				</CompareGrid>
			) : (
				<p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t("noPricing")}</p>
			)}
			{other.length ? (
				<button
					type="button"
					onClick={() => setShowAll((value) => !value)}
					aria-expanded={showAll}
					className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<ChevronDown aria-hidden className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
					{showAll ? t("fewerMeters") : t("moreMeters", { count: other.length })}
				</button>
			) : null}
		</CompareSection>
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
		<div className="grid min-w-0 gap-1">
			<label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
			<input
				id={id}
				type="number"
				inputMode="numeric"
				min={0}
				max={max}
				value={value}
				onChange={(event) => onChange(Math.max(0, Math.min(max ?? Number.MAX_SAFE_INTEGER, Number(event.target.value) || 0)))}
				className="h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm tabular-nums sm:h-9"
			/>
		</div>
	);
}

/** Runs in the browser from the prices already on the page, so it costs no server work. */
export function CompareCalculator({ models, tiers }: { models: CompareViewModel[]; tiers: string[] }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const [preset, setPreset] = useState<keyof typeof PRESETS | "custom">("chat");
	const [workload, setWorkload] = useState(PRESETS.chat!);
	const update = (patch: Partial<typeof workload>) => {
		setPreset("custom");
		setWorkload((current) => ({ ...current, ...patch }));
	};
	const results = models.map((model, index) => {
		const perRequest = requestCost(model, workload, tiers[index]);
		return { model, perRequest, perMonth: perRequest == null ? null : perRequest * workload.requests * 30 };
	});
	const monthly = results.map((result) => result.perMonth);
	const max = Math.max(0, ...monthly.filter((value): value is number => value != null));
	const best = bestIndices(monthly, "lower");
	if (results.every((result) => result.perRequest == null)) return null;

	return (
		<CompareSection id="calculator" title={t("calculator")} description={t("calculatorSub")}>
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
					<div role="row" className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] gap-3 border-b border-border/60 pb-1 text-xs text-muted-foreground sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_6rem_7rem]">
						<span role="columnheader">{t("model")}</span>
						<span role="columnheader" className="hidden sm:block">{t("monthlyCost")}</span>
						<span role="columnheader" className="text-right">{t("perRequest")}</span>
						<span role="columnheader" className="text-right">{t("perMonth")}</span>
					</div>
					{results.map((result, index) => (
						<div key={result.model.id} role="row" className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-3 border-b border-border/60 py-2.5 text-sm sm:grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_6rem_7rem]">
							<span role="rowheader" className="min-w-0">
								<span className="block truncate">{result.model.name}</span>
								{result.model.pricing ? <span className="block truncate text-xs text-muted-foreground">{result.model.pricing.provider.name} · {format.tier(tiers[index]!)}</span> : null}
							</span>
							<span role="cell" className="hidden h-2.5 overflow-hidden rounded-sm bg-muted sm:block">
								{result.perMonth != null && max > 0 ? (
									<span className="block h-full rounded-sm" style={{ width: `${(result.perMonth / max) * 100}%`, background: MODEL_COLOURS[index] }} />
								) : null}
							</span>
							<span role="cell" className="text-right tabular-nums">{result.perRequest == null ? t("notPriced") : format.usd(result.perRequest)}</span>
							<span role="cell" className={cn("text-right tabular-nums", best.has(index) && "font-semibold text-emerald-600 dark:text-emerald-400")}>
								{result.perMonth == null ? "–" : format.usd(result.perMonth)}
							</span>
						</div>
					))}
					<p className="mt-2 text-xs text-muted-foreground">{t("calculatorNote")}</p>
				</div>
			</div>
		</CompareSection>
	);
}
