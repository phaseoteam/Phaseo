"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProviderLogo } from "../ProviderLogo";
import { CompareSection, MODEL_COLOURS } from "./CompareGrid";
import { bestIndices } from "./compareViewMath";
import type { CompareViewModel, CompareViewPriceRow, CompareViewProvider } from "./types";
import { useCompareFormat } from "./useCompareFormat";

/**
 * One standard-tier price per meter for a route: the plain rate, or for a meter
 * priced only by option (resolution, draft mode) its cheapest option, shown as "from".
 * The headline route's rows are the model's own pricing.
 */
function standardRows(model: CompareViewModel, provider: CompareViewProvider): CompareViewPriceRow[] {
	const tiers = provider.pricing ?? (provider.id === model.pricing?.provider.id ? model.pricing.tiers : undefined);
	const byMeter = new Map<string, CompareViewPriceRow>();
	for (const row of tiers?.standard ?? Object.values(tiers ?? {})[0] ?? []) {
		const current = byMeter.get(row.meter);
		const better = !current || (current.conditional && !row.conditional) || (current.conditional === row.conditional && row.price / row.per < current.price / current.per);
		if (better) byMeter.set(row.meter, row);
	}
	return [...byMeter.values()];
}

const MAX_METERS = 3;

export function CompareProviders({ models }: { models: CompareViewModel[] }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	// Keyed by id so removing another model keeps the same panel open.
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const model = models.find((entry) => entry.id === selectedId) ?? models[0];
	if (!model) return null;
	const cheapestInput = bestIndices(model.providers.map((provider) => provider.input), "lower");
	const cheapestOutput = bestIndices(model.providers.map((provider) => provider.output), "lower");
	const cheapestCache = bestIndices(model.providers.map((provider) => provider.cacheRead), "lower");
	const best = (winners: Set<number>, index: number) => winners.has(index) && "font-semibold text-emerald-600 dark:text-emerald-400";
	const money = (value: number | null) => (value == null ? "–" : format.usd(value));
	const tokens = (value: number | null) => (value == null ? "–" : format.tokens(value));
	// Video, image and speech routes have no token prices, so the token columns would all read "–": show their own meters instead.
	const tokenPriced = model.providers.some((provider) => provider.input != null || provider.output != null || provider.cacheRead != null);
	const meters = (provider: CompareViewProvider) => {
		const rows = standardRows(model, provider);
		if (!rows.length) return <span className="text-muted-foreground">{t("notPriced")}</span>;
		return (
			<span className="block space-y-0.5">
				{rows.slice(0, MAX_METERS).map((row) => (
					<span key={row.meter} className="block">
						{row.conditional ? t("priceFrom", { price: format.price(row, { tokenUnit: true }) }) : format.price(row, { tokenUnit: true })}
						<span className="ml-1.5 text-xs text-muted-foreground">{format.meter(row)}</span>
					</span>
				))}
				{rows.length > MAX_METERS ? <span className="block text-xs text-muted-foreground">{t("moreMetersCount", { count: rows.length - MAX_METERS })}</span> : null}
			</span>
		);
	};

	return (
		<CompareSection id="providers" title={t("providers")} description={tokenPriced ? t("providersSub") : t("providersSubMeters")}>
			{models.length > 1 ? (
				<div role="tablist" aria-label={t("providers")} className="flex flex-wrap gap-1.5">
					{models.map((entry, index) => (
						<button
							key={entry.id}
							type="button"
							role="tab"
							aria-selected={entry.id === model.id}
							onClick={() => setSelectedId(entry.id)}
							className={cn(
								"inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm sm:h-8",
								entry.id === model.id ? "border-foreground font-medium" : "text-muted-foreground",
							)}
						>
							<span aria-hidden className="h-3.5 w-1 rounded-sm" style={{ background: MODEL_COLOURS[index] }} />
							{entry.name}
							<span className="text-xs text-muted-foreground">{entry.providers.length}</span>
						</button>
					))}
				</div>
			) : null}

			<div role="tabpanel" className="space-y-2">
				{model.providers.length ? (
					<>
						<div className="hidden overflow-x-auto sm:block">
							<table className="w-full min-w-[40rem] text-sm">
								<thead>
									<tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
										<th scope="col" className="px-3 py-2 font-medium">{t("provider")}</th>
										{tokenPriced ? (
											<>
												<th scope="col" className="px-3 py-2 text-right font-medium">{t("input")}</th>
												<th scope="col" className="px-3 py-2 text-right font-medium">{t("output")}</th>
												<th scope="col" className="px-3 py-2 text-right font-medium">{t("cacheRead")}</th>
												<th scope="col" className="px-3 py-2 text-right font-medium">{t("contextWindow")}</th>
												<th scope="col" className="px-3 py-2 text-right font-medium">{t("maxOutput")}</th>
											</>
										) : (
											<th scope="col" className="px-3 py-2 font-medium">{t("standardPrice")}</th>
										)}
										<th scope="col" className="px-3 py-2 font-medium">{t("tiers")}</th>
									</tr>
								</thead>
								<tbody>
									{model.providers.map((provider, index) => (
										<tr key={provider.id} className="border-b border-border/70 tabular-nums">
											<th scope="row" className="px-3 py-2 text-left align-top font-normal">
												<Link href={`/api-providers/${provider.id}`} className="inline-flex items-center gap-2 hover:underline">
													<ProviderLogo id={provider.logoId ?? provider.id} alt="" size="xxs" />
													{provider.name}
												</Link>
												{provider.quantisation ? <span className="ml-2 text-xs text-muted-foreground">{provider.quantisation}</span> : null}
											</th>
											{tokenPriced ? (
												<>
													<td className={cn("px-3 py-2 text-right", best(cheapestInput, index))}>{money(provider.input)}</td>
													<td className={cn("px-3 py-2 text-right", best(cheapestOutput, index))}>{money(provider.output)}</td>
													<td className={cn("px-3 py-2 text-right", best(cheapestCache, index))}>{money(provider.cacheRead)}</td>
													<td className="px-3 py-2 text-right">{tokens(provider.contextWindow)}</td>
													<td className="px-3 py-2 text-right">{tokens(provider.maxOutput)}</td>
												</>
											) : (
												<td className="px-3 py-2 align-top">{meters(provider)}</td>
											)}
											<td className="px-3 py-2 align-top text-xs text-muted-foreground">{provider.tiers.map(format.tier).join(", ") || "–"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<ul className="space-y-2 sm:hidden">
							{model.providers.map((provider, index) => (
								<li key={provider.id} className="rounded-md border border-border p-3 text-sm">
									<Link href={`/api-providers/${provider.id}`} className="flex items-center gap-2 font-medium">
										<ProviderLogo id={provider.logoId ?? provider.id} alt="" size="xxs" />
										{provider.name}
									</Link>
									{tokenPriced ? (
										<dl className="mt-2 grid grid-cols-2 gap-2 tabular-nums">
											<div><dt className="text-xs text-muted-foreground">{t("input")}</dt><dd className={cn(best(cheapestInput, index))}>{money(provider.input)}</dd></div>
											<div><dt className="text-xs text-muted-foreground">{t("output")}</dt><dd className={cn(best(cheapestOutput, index))}>{money(provider.output)}</dd></div>
											<div><dt className="text-xs text-muted-foreground">{t("cacheRead")}</dt><dd className={cn(best(cheapestCache, index))}>{money(provider.cacheRead)}</dd></div>
											<div><dt className="text-xs text-muted-foreground">{t("contextWindow")}</dt><dd>{tokens(provider.contextWindow)}</dd></div>
										</dl>
									) : (
										<div className="mt-2 tabular-nums">{meters(provider)}</div>
									)}
									{provider.tiers.length ? <p className="mt-1 text-xs text-muted-foreground">{provider.tiers.map(format.tier).join(", ")}</p> : null}
								</li>
							))}
						</ul>
						<p className="text-xs text-muted-foreground">{t("providerPriceNote")}</p>
					</>
				) : (
					<p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t("noRoutesFor", { name: model.name })}</p>
				)}
				{model.otherListings.length ? (
					<details className="group text-sm">
						<summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
							<ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
							{t("otherListings", { count: model.otherListings.length })}
						</summary>
						<p className="mt-2 text-muted-foreground">{model.otherListings.map((listing) => listing.name).join(", ")}</p>
						<p className="mt-1 text-xs text-muted-foreground">{t("otherListingsNote")}</p>
					</details>
				) : null}
			</div>
		</CompareSection>
	);
}
