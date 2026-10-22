"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Link2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompareModelOption } from "../types";
import { CompareActivity } from "./CompareActivity";
import { CompareBenchmarks } from "./CompareBenchmarks";
import { CompareGridProvider } from "./CompareGrid";
import { CompareHeader } from "./CompareHeader";
import { CompareDetails, CompareFeatures, CompareOverviewTable, ComparePerformance, CompareVerdicts } from "./CompareOverview";
import { CompareCalculator, ComparePricing } from "./ComparePricing";
import { CompareProviders } from "./CompareProviders";
import { activeTier, applyRoute, buildVerdicts, type RouteChoice } from "./compareViewMath";
import type { CompareView as CompareViewData, CompareViewUsageByModel } from "./types";

export function CompareView({
	view,
	usage,
	selectedOptions,
	selectedIds,
	onSelectedIdsChange,
}: {
	view: CompareViewData;
	usage: CompareViewUsageByModel;
	selectedOptions: CompareModelOption[];
	selectedIds: string[];
	onSelectedIdsChange: (ids: string[]) => void;
}) {
	const t = useTranslations("Catalogue.compareView");
	const pathname = usePathname();
	const models = view.models;
	const [highlightBest, setHighlightBest] = useState(true);
	const [differencesOnly, setDifferencesOnly] = useState(false);
	const [page, setPage] = useState(0);
	const [copied, setCopied] = useState(false);
	// Keyed by model id, so removing one model keeps the others' choices.
	const [routes, setRoutes] = useState<Record<string, RouteChoice>>({});
	const pages = Math.max(1, Math.ceil(models.length / 2));
	const phonePage = Math.min(page, pages - 1);
	const priced = useMemo(() => models.map((model) => applyRoute(model, routes[model.id]?.provider)), [models, routes]);
	const tiers = useMemo(() => priced.map((model) => activeTier(model, routes[model.id]?.tier)), [priced, routes]);
	const verdicts = useMemo(() => buildVerdicts(priced, usage, view.benchmarks, tiers), [priced, usage, view.benchmarks, tiers]);
	const title = models.map((model) => model.name).join(` ${t("versus")} `);
	const chatModel = models.find((model) => model.providers.length > 0);

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	};

	return (
		<CompareGridProvider value={{ modelCount: models.length, phonePage, highlightBest, differencesOnly, bestLabel: t("best") }}>
			<div className="space-y-10">
				<div className="mb-4 space-y-3">
					<nav aria-label={t("breadcrumb")} className="text-xs text-muted-foreground">
						{/* On a pair page ("/compare/a-vs-b") the crumb goes back to "/compare". */}
						<Link href={/\/compare\/[^/]+$/.test(pathname) ? pathname.slice(0, pathname.lastIndexOf("/")) : pathname} className="hover:underline">{t("compare")}</Link>
						<span aria-hidden> / </span>
						<span>{title}</span>
					</nav>
					<div className="flex flex-wrap items-end justify-between gap-4">
						<div className="min-w-0 max-w-3xl">
							<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
							<p className="mt-1.5 text-sm text-muted-foreground">{t("headerSub")}</p>
						</div>
						<div className="flex gap-2">
							<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={copyLink}>
								{copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
								{copied ? t("copied") : t("copyLink")}
							</Button>
							{chatModel ? (
								<Button asChild size="sm" className="rounded-md">
									<Link href={`/chat?model=${encodeURIComponent(chatModel.id)}`}>
										<MessageSquare className="size-4" />
										{t("tryInChat", { name: chatModel.name })}
									</Link>
								</Button>
							) : null}
						</div>
					</div>
				</div>

				<CompareHeader
					models={models}
					priced={priced}
					tiers={tiers}
					phonePage={phonePage}
					onPhonePageChange={setPage}
					onRouteChange={(modelId, choice) => setRoutes((current) => {
						const previous = current[modelId] ?? { provider: null, tier: null };
						return { ...current, [modelId]: { ...previous, ...choice } };
					})}
					onRemove={(modelId) => onSelectedIdsChange(selectedIds.filter((id) => id !== modelId))}
					highlightBest={highlightBest}
					onHighlightBestChange={setHighlightBest}
					differencesOnly={differencesOnly}
					onDifferencesOnlyChange={setDifferencesOnly}
					selectedOptions={selectedOptions}
					selectedIds={selectedIds}
					onSelectedIdsChange={onSelectedIdsChange}
				/>

				<CompareVerdicts models={models} verdicts={verdicts} />
				<CompareOverviewTable models={models} />
				<ComparePricing models={priced} tiers={tiers} />
				<CompareCalculator models={priced} tiers={tiers} />
				<ComparePerformance models={models} usage={usage} />
				<CompareActivity models={models} usage={usage} />
				<CompareFeatures models={models} priced={priced} tiers={tiers} />
				<CompareBenchmarks models={models} benchmarks={view.benchmarks} peers={view.peers ?? []} />
				<CompareProviders models={models} />
				<CompareDetails models={models} />
				{pages > 1 ? <p className="text-xs text-muted-foreground sm:hidden">{t("phoneBestNote")}</p> : null}
			</div>
		</CompareGridProvider>
	);
}
