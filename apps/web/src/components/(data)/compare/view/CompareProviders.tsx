"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ProviderLogo } from "../ProviderLogo";
import { MODEL_COLOURS } from "./CompareGrid";
import { bestIndices } from "./compareViewMath";
import type { CompareViewModel } from "./types";
import { useCompareFormat } from "./useCompareFormat";

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
	const best = (winners: Set<number>, index: number) => winners.has(index) && "font-semibold text-emerald-700 dark:text-emerald-300";
	const money = (value: number | null) => (value == null ? "–" : format.usd(value));
	const tokens = (value: number | null) => (value == null ? "–" : format.tokens(value));

	return (
		<section id="providers" aria-labelledby="compare-providers" className="scroll-mt-32 space-y-3">
			<div>
				<h2 id="compare-providers" className="text-base font-semibold">{t("providers")}</h2>
				<p className="text-xs text-muted-foreground">{t("providersSub")}</p>
			</div>
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
										<th scope="col" className="px-3 py-2 text-right font-medium">{t("input")}</th>
										<th scope="col" className="px-3 py-2 text-right font-medium">{t("output")}</th>
										<th scope="col" className="px-3 py-2 text-right font-medium">{t("cacheRead")}</th>
										<th scope="col" className="px-3 py-2 text-right font-medium">{t("contextWindow")}</th>
										<th scope="col" className="px-3 py-2 text-right font-medium">{t("maxOutput")}</th>
										<th scope="col" className="px-3 py-2 font-medium">{t("tiers")}</th>
									</tr>
								</thead>
								<tbody>
									{model.providers.map((provider, index) => (
										<tr key={provider.id} className="border-b border-border/70 tabular-nums">
											<th scope="row" className="px-3 py-2 text-left font-normal">
												<Link href={`/api-providers/${provider.id}`} className="inline-flex items-center gap-2 hover:underline">
													<ProviderLogo id={provider.id} alt={provider.name} size="xxs" />
													{provider.name}
												</Link>
												{provider.quantisation ? <span className="ml-2 text-xs text-muted-foreground">{provider.quantisation}</span> : null}
											</th>
											<td className={cn("px-3 py-2 text-right", best(cheapestInput, index))}>{money(provider.input)}</td>
											<td className={cn("px-3 py-2 text-right", best(cheapestOutput, index))}>{money(provider.output)}</td>
											<td className={cn("px-3 py-2 text-right", best(cheapestCache, index))}>{money(provider.cacheRead)}</td>
											<td className="px-3 py-2 text-right">{tokens(provider.contextWindow)}</td>
											<td className="px-3 py-2 text-right">{tokens(provider.maxOutput)}</td>
											<td className="px-3 py-2 text-xs text-muted-foreground">{provider.tiers.map(format.tier).join(", ") || "–"}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<ul className="space-y-2 sm:hidden">
							{model.providers.map((provider) => (
								<li key={provider.id} className="rounded-md border border-border p-3 text-sm">
									<Link href={`/api-providers/${provider.id}`} className="flex items-center gap-2 font-medium">
										<ProviderLogo id={provider.id} alt={provider.name} size="xxs" />
										{provider.name}
									</Link>
									<dl className="mt-2 grid grid-cols-3 gap-2 tabular-nums">
										<div><dt className="text-xs text-muted-foreground">{t("input")}</dt><dd>{money(provider.input)}</dd></div>
										<div><dt className="text-xs text-muted-foreground">{t("output")}</dt><dd>{money(provider.output)}</dd></div>
										<div><dt className="text-xs text-muted-foreground">{t("contextWindow")}</dt><dd>{tokens(provider.contextWindow)}</dd></div>
									</dl>
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
					<details className="text-sm">
						<summary className="cursor-pointer text-muted-foreground">
							{t("otherListings", { count: model.otherListings.length })}
						</summary>
						<p className="mt-2 text-muted-foreground">{model.otherListings.map((listing) => listing.name).join(", ")}</p>
						<p className="mt-1 text-xs text-muted-foreground">{t("otherListingsNote")}</p>
					</details>
				) : null}
			</div>
		</section>
	);
}
