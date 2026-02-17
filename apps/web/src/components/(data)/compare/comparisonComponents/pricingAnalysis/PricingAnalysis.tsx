import { ExtendedModel, Price } from "@/data/types";
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
	CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PricingBarChart from "./PricingBarChart";
import React from "react";
import Link from "next/link";
import { ProviderLogoName } from "../../ProviderLogoName";

interface PricingAnalysisProps {
	selectedModels: ExtendedModel[];
}

// Helper functions to get prices (summary-level)
function getModelPrices(model: ExtendedModel): Price | null {
	if (!model.prices || model.prices.length === 0) return null;
	// By convention, loadCompareModels puts a synthetic "summary"
	// entry first, derived from the underlying pricing rules.
	return model.prices[0];
}

function getInputPrice(model: ExtendedModel): number | null {
	const prices = getModelPrices(model);
	return prices?.input_token_price ?? null;
}

function getOutputPrice(model: ExtendedModel): number | null {
	const prices = getModelPrices(model);
	return prices?.output_token_price ?? null;
}

function getTotalPrice(model: ExtendedModel): number | null {
	const input = getInputPrice(model);
	const output = getOutputPrice(model);
	if (input === null || output === null) return null;
	return ((input * 1 + output * 3) * 1_000_000) / 4;
}

type PricingProvider = { id: string; name: string };

function getPricingProviders(model: ExtendedModel): PricingProvider[] {
	const providers: PricingProvider[] = [];
	const seen = new Set<string>();

	for (const price of model.prices ?? []) {
		if (!price) continue;
		if (price.meter === "summary") continue;
		const providerId =
			price.api_provider_id ??
			(typeof price.api_provider === "string"
				? price.api_provider
				: price.api_provider?.api_provider_id);
		if (!providerId) continue;
		if (seen.has(providerId)) continue;
		seen.add(providerId);
		const providerName =
			typeof price.api_provider === "object"
				? price.api_provider.api_provider_name ?? providerId
				: providerId;
		providers.push({ id: providerId, name: providerName });
	}

	return providers;
}

function getCheapestBadge(models: ExtendedModel[]) {
	if (models.length < 2) return null;
	const totalPrices = models.map((m) => getTotalPrice(m) ?? 0);
	const minTotal = Math.min(...totalPrices);
	const cheapestIdxs = totalPrices
		.map((p, i) => (p === minTotal ? i : -1))
		.filter((i) => i !== -1);
	if (cheapestIdxs.length === 1) {
		return (
			<Badge
				variant="default"
				className="bg-green-100 text-green-800 border border-green-300 hover:bg-green-200 hover:text-green-900 hover:border-green-400 transition-colors"
			>
				{models[cheapestIdxs[0]].name} is cheapest
			</Badge>
		);
	}
	return (
		<Badge
			variant="secondary"
			className="bg-blue-100 text-blue-800 border border-blue-300"
		>
			Tied: {cheapestIdxs.map((i) => models[i].name).join(", ")}
		</Badge>
	);
}

function getStatCards(models: ExtendedModel[]) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
			{models.map((model) => {
				const input = getInputPrice(model);
				const output = getOutputPrice(model);
				const total = getTotalPrice(model);
				const providers = getPricingProviders(model);
				const shownProviders = providers.slice(0, 8);
				const extraProviders = providers.length - shownProviders.length;

				return (
					<Card key={model.id} className="shadow border-none">
						<CardHeader className="pb-2">
							<CardTitle className="text-base font-semibold flex items-center gap-2">
								<ProviderLogoName
									id={model.provider.provider_id}
									name={model.provider.name}
									href={`/organisations/${model.provider.provider_id}`}
									size="xxs"
									className="mr-2"
									mobilePopover
								/>
								<Link
									href={`/models/${encodeURIComponent(
										model.id
									)}`}
									className="group"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full">
										{model.name}
									</span>
								</Link>
							</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<div className="grid grid-cols-3 gap-3">
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Input $/M
									</div>
									<div className="font-mono font-semibold text-foreground">
										{input != null
											? `$${(input * 1_000_000).toFixed(2)}`
											: "-"}
									</div>
								</div>
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Output $/M
									</div>
									<div className="font-mono font-semibold text-foreground">
										{output != null
											? `$${(output * 1_000_000).toFixed(2)}`
											: "-"}
									</div>
								</div>
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Total $/M
									</div>
									<div className="font-mono font-semibold text-foreground">
										{total != null ? `$${total.toFixed(2)}` : "-"}
									</div>
								</div>
							</div>

							<div className="mt-3 space-y-2">
								<div className="text-[11px] font-medium text-muted-foreground">
									Providers
								</div>
								{shownProviders.length ? (
									<div className="flex flex-wrap items-center gap-2">
										{shownProviders.map((provider) => (
											<div
												key={`${model.id}-${provider.id}`}
												title={provider.name}
											>
												<ProviderLogoName
													id={provider.id}
													name={provider.name}
													href={`/api-providers/${provider.id}`}
													size="xxs"
													className="transition hover:opacity-90"
													mobilePopover
												/>
											</div>
										))}
										{extraProviders > 0 ? (
											<span className="text-xs text-muted-foreground">
												+{extraProviders} more
											</span>
										) : null}
									</div>
								) : (
									<p className="text-xs text-muted-foreground">
										No providers found yet.
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}

function getBarChartData(models: ExtendedModel[]) {
	return [
		{
			type: "Input $/M",
			...Object.fromEntries(
				models.map((m) => [
					m.name,
					getInputPrice(m) != null
						? getInputPrice(m)! * 1_000_000
						: null,
				])
			),
		},
		{
			type: "Output $/M",
			...Object.fromEntries(
				models.map((m) => [
					m.name,
					getOutputPrice(m) != null
						? getOutputPrice(m)! * 1_000_000
						: null,
				])
			),
		},
	];
}

function BarChartTooltip({ active, payload, label }: any) {
	if (!active || !payload || payload.length === 0) return null;
	return (
		<Card className="bg-white dark:bg-zinc-950 rounded-lg p-4 min-w-60">
			<CardHeader className="pb-2 p-0 mb-2">
				<CardTitle className="font-semibold text-sm">{label}</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				{payload.map((p: any) => (
					<div
						key={p.name}
						className="flex justify-between text-xs mb-1"
					>
						<span>{p.name}</span>
						<span>
							${p.value != null ? p.value.toFixed(2) : "-"} per 1M
							Tokens
						</span>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

// Build per-meter comparison rows using the enriched Price entries
// from loadCompareModels. We include every unique meter observed
// across the selection and show `-` where a model has no data.
type MeterComparisonRow = {
	meter: string;
	perModel: {
		modelId: string;
		modelName: string;
		pricePerMillion: number | null;
	}[];
};

function formatMeterLabel(meter: string): string {
	const key = meter.trim().toLowerCase();

	// Common overrides to keep wording consistent and readable.
	const overrides: Record<string, string> = {
		input_token: "Input Tokens",
		output_token: "Output Tokens",
		cached_input_token: "Cached Input Tokens",
		input_text: "Input Text",
		output_text: "Output Text",
		input_image: "Input Image",
		output_image: "Output Image",
		input_audio: "Input Audio",
		output_audio: "Output Audio",
		input_video: "Input Video",
		output_video: "Output Video",
		per_request: "Per Request",
		request: "Per Request",
	};

	if (overrides[key]) return overrides[key];

	// Fallback: snake_case or kebab-case -> Title Case.
	return key
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildMeterComparisonRows(
	models: ExtendedModel[]
): MeterComparisonRow[] {
	const meterMap = new Map<
		string,
		Map<string, { pricePerMillion: number | null }>
	>();

	for (const model of models) {
		const prices = model.prices ?? [];
		for (const price of prices) {
			if (!price.meter || price.meter === "summary") continue;
			const meterKey = price.meter;

			const basePrice =
				price.input_token_price ??
				price.output_token_price ??
				price.cached_input_token_price ??
				null;

			const perMillion =
				basePrice != null && Number.isFinite(basePrice)
					? basePrice * 1_000_000
					: null;

			if (!meterMap.has(meterKey)) {
				meterMap.set(
					meterKey,
					new Map<string, { pricePerMillion: number | null }>()
				);
			}

			const byModel = meterMap.get(meterKey)!;
			const existing = byModel.get(model.id)?.pricePerMillion ?? null;
			const next =
				existing == null
					? perMillion
					: perMillion == null
						? existing
						: Math.min(existing, perMillion);
			byModel.set(model.id, { pricePerMillion: next });
		}
	}

	const rows: MeterComparisonRow[] = [];

	for (const [meter, byModel] of meterMap.entries()) {
		const perModel = models.map((model) => {
			const entry = byModel.get(model.id);
			return {
				modelId: model.id,
				modelName: model.name,
				pricePerMillion: entry?.pricePerMillion ?? null,
			};
		});

		rows.push({ meter, perModel });
	}

	rows.sort((a, b) => a.meter.localeCompare(b.meter));
	return rows;
}

export default function PricingAnalysis({
	selectedModels,
}: PricingAnalysisProps) {
	if (!selectedModels || selectedModels.length === 0) return null;

	const meterRows = buildMeterComparisonRows(selectedModels);

	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Pricing</h2>
					<p className="text-sm text-muted-foreground">
						Observed provider pricing per million tokens.
					</p>
				</div>
				{getCheapestBadge(selectedModels)}
			</header>

			<div className="space-y-4">
				{getStatCards(selectedModels)}
				<div className="hidden sm:block rounded-xl border border-border/60 bg-background/60 p-4 text-center">
					<PricingBarChart
						chartData={getBarChartData(selectedModels)}
						models={selectedModels.map((m) => ({
							name: m.name,
							provider: m.provider.name,
						}))}
						CustomTooltip={BarChartTooltip}
					/>
				</div>

				{meterRows.length > 0 && (
					<div className="mt-6 space-y-2">
						<div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
							<div>
								<div className="text-sm font-semibold">
									Pricing by meter
								</div>
								<p className="text-xs text-muted-foreground">
									All unique meters observed across the selected models.
								</p>
							</div>
						</div>
						<div className="overflow-x-auto rounded-md border border-border bg-background/60 mt-2">
							<table className="min-w-full text-xs">
								<thead>
									<tr className="border-b border-border bg-muted/60">
										<th className="px-3 py-2 text-left font-medium">
											Meter
										</th>
										{selectedModels.map((model) => (
											<th
												key={model.id}
												className="px-3 py-2 text-right font-medium whitespace-nowrap"
											>
												{model.name}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{meterRows.map((row) => (
										<tr
											key={row.meter}
											className="border-b border-border/60 last:border-b-0"
										>
											<td className="px-3 py-2 text-left text-[11px] font-medium whitespace-nowrap">
												{formatMeterLabel(row.meter)}
											</td>
											{row.perModel.map(
												(entry, idx) => {
													const value =
														entry.pricePerMillion;
													const all =
														row.perModel
															.map(
																(v) =>
																	v.pricePerMillion
															)
															.filter(
																(v) =>
																	v != null &&
																	Number.isFinite(
																		v
																	)
															) as number[];
													const min =
														all.length > 0
															? Math.min(
																	...all
															  )
															: null;
													const isBest =
														min != null &&
														value != null &&
														value === min;
													return (
														<td
															key={`${row.meter}-${entry.modelId}-${idx}`}
															className="px-3 py-2 text-right font-mono"
														>
															{value != null &&
															Number.isFinite(
																value
															) ? (
																<span
																	className={
																		isBest
																			? "font-semibold text-emerald-600 dark:text-emerald-400"
																			: ""
																	}
																>
																	$
																	{value.toFixed(
																		2
																	)}
																</span>
															) : (
																<span className="text-muted-foreground">
																	-
																</span>
															)}
														</td>
													);
												}
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
