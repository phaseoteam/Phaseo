"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModelCard } from "@/components/(data)/models/Models/ModelCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import type { CountrySummary } from "@/lib/fetchers/countries/types";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import { webQueryKeys } from "@/lib/query/queryKeys";
import { fetchPublicWebApi } from "@/lib/web-api/client";
import { useTranslations } from "next-intl";
import { getUniqueCountryModels } from "./utils";
import {
	COUNTRY_MODELS_PREVIEW_PER_ORGANISATION,
	groupCountryModels,
} from "./countryModelGroups";

type CountryModelsSectionProps = {
	iso: string;
	/** The first models of each organisation; the server renders only these. */
	previewModels: ModelCardType[];
	/** Model count per organisation id, for the "Show all" buttons. */
	organisationModelCounts: Record<string, number>;
	totalModels: number;
};

function matchesQuery(model: ModelCardType, normalizedQuery: string) {
	return [model.name, model.model_id, model.organisation_name, model.organisation_id]
		.filter(Boolean)
		.join(" ")
		.toLowerCase()
		.includes(normalizedQuery);
}

/**
 * Large countries have hundreds of models (the US has over 850), and rendering
 * every card made these the most expensive pages on the site. The page renders
 * a few per organisation; searching or "Show all" loads the full list from the
 * Cloudflare web API, the same payload the server render reads.
 */
export default function CountryModelsSection({
	iso,
	previewModels,
	organisationModelCounts,
	totalModels,
}: CountryModelsSectionProps) {
	const t = useTranslations("Catalogue.countryDetail");
	const [query, setQuery] = useState("");
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
	const normalizedQuery = query.trim().toLowerCase();
	const needsAllModels = normalizedQuery !== "" || expanded.size > 0;

	const allModels = useQuery<ModelCardType[]>({
		queryKey: webQueryKeys.public.countryDetail(iso),
		queryFn: async ({ signal }) =>
			getUniqueCountryModels(
				(await fetchPublicWebApi<{ country: CountrySummary }>(
					`/api/_web/countries/${encodeURIComponent(iso)}`,
					{ signal },
				)).country,
			),
		...WEB_QUERY_POLICIES.publicNoPolling,
		enabled: needsAllModels,
	});
	const hasAllModels = Boolean(allModels.data);
	const loadingAllModels = needsAllModels && !hasAllModels && !allModels.isError;

	const groups = useMemo(() => {
		const models = allModels.data ?? previewModels;
		const filtered = normalizedQuery
			? models.filter((model) => matchesQuery(model, normalizedQuery))
			: models;
		return groupCountryModels(filtered, t("unknownOrganisation"));
	}, [allModels.data, previewModels, normalizedQuery, t]);

	const groupTotal = (group: (typeof groups)[number]) =>
		normalizedQuery || hasAllModels
			? group.models.length
			: (organisationModelCounts[group.id] ?? group.models.length);
	const visibleCount = normalizedQuery
		? groups.reduce((total, group) => total + group.models.length, 0)
		: totalModels;

	const expand = (id: string) =>
		setExpanded((current) => new Set(current).add(id));

	return (
		<div className="space-y-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative w-full sm:max-w-sm">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={t("searchPlaceholder")}
						aria-label={t("searchLabel")}
						className="h-9 rounded-md pl-9"
					/>
				</div>
				<p className="shrink-0 text-sm tabular-nums text-muted-foreground" aria-live="polite">
					{loadingAllModels && normalizedQuery
						? t("loadingAllModels")
						: t("modelsCount", { count: visibleCount })}
				</p>
			</div>

			{groups.length ? (
				<div className="space-y-8">
					{groups.map((group) => {
						const total = groupTotal(group);
						const showAll = Boolean(normalizedQuery) || expanded.has(group.id);
						const shown = showAll
							? group.models
							: group.models.slice(0, COUNTRY_MODELS_PREVIEW_PER_ORGANISATION);
						const hidden = total - shown.length;
						return (
							<section key={group.id} className="space-y-2">
								<div className="flex items-baseline justify-between gap-4 border-b border-border/70 pb-2">
									<h3 className="text-base font-semibold">{group.name}</h3>
									<span className="text-xs tabular-nums text-muted-foreground">
										{t("modelsCount", { count: total })}
									</span>
								</div>
								<div className="divide-y divide-border/70">
									{shown.map((model) => (
										<ModelCard key={model.model_id} model={model} />
									))}
								</div>
								{hidden > 0 ? (
									showAll && loadingAllModels ? (
										<p className="py-2 text-sm text-muted-foreground">
											{t("loadingAllModels")}
										</p>
									) : (
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="rounded-md"
											// After a failed load the group is already expanded, so retry.
											onClick={() => (showAll ? void allModels.refetch() : expand(group.id))}
										>
											{t("showAllModels", { count: total })}
										</Button>
									)
								) : null}
							</section>
						);
					})}
				</div>
			) : loadingAllModels ? (
				<div className="border-y border-border/70 py-10 text-center text-sm text-muted-foreground">
					{t("loadingAllModels")}
				</div>
			) : (
				<div className="border-y border-border/70 py-10 text-center text-sm text-muted-foreground">
					{t("noModelsMatch")}
				</div>
			)}
		</div>
	);
}
