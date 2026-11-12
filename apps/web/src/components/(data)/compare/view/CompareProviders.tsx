import { useState } from "react";
import Link from "@/components/link";
import { useTranslations } from "@/i18n/react";
import { ChevronDown } from "lucide-react";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ProviderLogo } from "../ProviderLogo";
import { CompareGrid, CompareRow, CompareSection, type CompareCell } from "./CompareGrid";
import { bestIndices, doSameJob, providerLines, TYPICAL_REQUEST, type ProviderLine } from "./compareViewMath";
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

/** Popular open models have 30 routes, so a three-model union can pass 40; the rest wait behind a toggle. */
const SHOWN_PROVIDERS = 10;
const MAX_METERS = 2;

export function CompareProviders({ models }: { models: CompareViewModel[] }) {
	const t = useTranslations("Catalogue.compareView");
	const format = useCompareFormat();
	const [showAll, setShowAll] = useState(false);
	const lines = providerLines(models);
	const shown = showAll ? lines : lines.slice(0, SHOWN_PROVIDERS);
	const sameJob = doSameJob(models);
	const tokenPriced = models.some((model) => model.providers.some((provider) => provider.input != null || provider.output != null));

	const cell = (model: CompareViewModel, route: CompareViewProvider | null, best: boolean): CompareCell => {
		if (!route) return { content: "—", text: "", muted: true };
		const details = [
			route.contextWindow ? t("routeContext", { value: format.compactTokens(route.contextWindow) }) : null,
			route.quantisation,
			route.tiers.some((tier) => tier !== "standard") ? route.tiers.map(format.tier).join(", ") : null,
		].filter(Boolean).join(" · ") || undefined;
		const priceOf = (row: CompareViewPriceRow) => (row.conditional ? t("priceFrom", { price: format.price(row, { tokenUnit: true }) }) : format.price(row, { tokenUnit: true }));
		const meterLine = (row: CompareViewPriceRow) => (
			<span key={row.meter} className="block">
				{priceOf(row)}
				<span className="ml-1.5 text-xs font-normal text-muted-foreground">{format.meter(row)}</span>
			</span>
		);
		const all = standardRows(model, route);
		// A route sold only on a paid tier (Venice's Priority) has no standard token price; read its own input and output rows.
		const perMillion = (row: CompareViewPriceRow | undefined) => (row ? (row.price / row.per) * 1_000_000 : null);
		const input = route.input ?? perMillion(all.find((row) => row.kind === "input"));
		const output = route.output ?? perMillion(all.find((row) => row.kind === "output"));
		const tokenPrice = input != null || output != null
			? t("routePrice", { input: input == null ? "–" : format.usd(input), output: output == null ? "–" : format.usd(output) })
			: null;
		if (tokenPrice) {
			// Other meters (web search, per image) sit with the details, so the cheaper-model tick marks only the token price.
			const others = all.filter((row) => row.unit !== "token");
			const extra = [
				...others.slice(0, MAX_METERS).map((row) => `${priceOf(row)} ${format.meter(row)}`),
				others.length > MAX_METERS ? t("moreMetersCount", { count: others.length - MAX_METERS }) : null,
			].filter(Boolean);
			return {
				content: tokenPrice,
				text: [tokenPrice, ...others.map(priceOf)].join(" "),
				best,
				sub: extra.length || details ? (
					<>
						{extra.map((line) => <span key={line} className="block">{line}</span>)}
						{details ? <span className="block">{details}</span> : null}
					</>
				) : undefined,
			};
		}
		if (!all.length) return { content: t("notPriced"), text: "", muted: true, sub: details };
		return {
			content: <span className="block space-y-0.5">{all.slice(0, MAX_METERS).map(meterLine)}</span>,
			text: all.map(priceOf).join(" "),
			sub: [all.length > MAX_METERS ? t("moreMetersCount", { count: all.length - MAX_METERS }) : null, details].filter(Boolean).join(" · ") || undefined,
		};
	};

	// On a shared provider, the model with the cheaper typical request (2K tokens in, 500 out) is marked, as in Pricing.
	const cells = (line: ProviderLine): CompareCell[] => {
		const costs = line.routes.map((route) => (route?.input != null && route.output != null
			? (TYPICAL_REQUEST.inputTokens * route.input + TYPICAL_REQUEST.outputTokens * route.output) / 1_000_000
			: null));
		const best = sameJob && costs.filter((cost) => cost != null).length > 1 ? bestIndices(costs, "lower") : new Set<number>();
		return line.routes.map((route, index) => cell(models[index]!, route, best.has(index)));
	};

	const otherListings = models.map((model) => model.otherListings);
	return (
		<CompareSection id="providers" title={t("providers")} description={tokenPriced ? t("providersAcrossSub") : t("providersAcrossSubMeters")}>
			{lines.length ? (
				<CompareGrid label={t("providers")}>
					{shown.map((line) => (
						<CompareRow
							key={line.id}
							alwaysShow
							label={(
								<Link href={`/api-providers/${line.id}`} className="inline-flex min-w-0 items-center gap-2 text-foreground hover:underline">
									<ProviderLogo id={line.logoId} alt="" size="xxs" />
									<span className="truncate">{line.name}</span>
								</Link>
							)}
							cells={cells(line)}
						/>
					))}
					{otherListings.some((listings) => listings.length) ? (
						<CompareRow
							alwaysShow
							label={t("otherListingsLabel")}
							cells={otherListings.map((listings): CompareCell => (listings.length
								? {
									content: (
										<Tip label={listings.map((listing) => listing.name).join(", ")}>
											<span className="cursor-default underline decoration-dotted underline-offset-4">{t("routeCount", { count: listings.length })}</span>
										</Tip>
									),
									text: String(listings.length),
									muted: true,
								}
								: { content: "—", text: "", muted: true }))}
						/>
					) : null}
				</CompareGrid>
			) : (
				<p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">{t("noRoutesAny")}</p>
			)}
			{lines.length > SHOWN_PROVIDERS ? (
				<button
					type="button"
					onClick={() => setShowAll((value) => !value)}
					aria-expanded={showAll}
					className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<ChevronDown aria-hidden className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
					{showAll ? t("showFewerProviders") : t("showAllProviders", { count: lines.length })}
				</button>
			) : null}
			{lines.length ? <p className="text-xs text-muted-foreground">{t("providersAcrossNote")}</p> : null}
		</CompareSection>
	);
}
