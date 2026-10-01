"use client";

import type { ExtendedModel } from "@/data/types";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";
import {
	Card,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ProviderLogo } from "../ProviderLogo";
import { ProviderLogoName } from "../ProviderLogoName";
import { useTranslations } from "next-intl";

interface AvailabilityComparisonProps {
	selectedModels: ExtendedModel[];
	hideHeader?: boolean;
}

type AvailabilitySummary = {
	modelId: string;
	modelName: string;
	providerId: string;
	providerName: string;
	providers: Array<{
		id: string;
		name: string;
	}>;
};

function buildAvailabilitySummaries(
	models: ExtendedModel[],
	unknownProvider: string
): AvailabilitySummary[] {
	return models.map((model) => {
		const providerId = model.provider?.provider_id ?? model.provider?.name;
		const providerName = model.provider?.name ?? providerId ?? unknownProvider;

		const providerMap = new Map<string, string>();
		(model.prices ?? []).forEach((price) => {
			const priceProviderId =
				price.api_provider_id ??
				(typeof price.api_provider === "string"
					? price.api_provider
					: price.api_provider?.api_provider_id);
			if (!priceProviderId) return;
			const priceProviderName =
				typeof price.api_provider === "object"
					? price.api_provider.api_provider_name ??
						price.api_provider.api_provider_id
					: priceProviderId;
			if (!providerMap.has(priceProviderId)) {
				providerMap.set(priceProviderId, resolveProviderDisplayName({ providerId: priceProviderId, providerName: priceProviderName }));
			}
		});

		return {
			modelId: model.id,
			modelName: model.name,
			providerId: providerId ?? "unknown",
			providerName,
			providers: Array.from(providerMap.entries()).map(
				([id, name]) => ({
					id,
					name,
				})
			),
		};
	});
}

export default function AvailabilityComparison({
	selectedModels,
	hideHeader = false,
}: AvailabilityComparisonProps) {
	const t = useTranslations("Catalogue.compare");
	if (!selectedModels || selectedModels.length === 0) return null;

	const summaries = buildAvailabilitySummaries(selectedModels, t("unknownProvider"));

	const anyPricing = summaries.some((s) => s.providers.length > 0);
	if (!anyPricing) return null;

	return (
		<div className="space-y-3">
			{!hideHeader ? (
				<header className="flex items-start justify-between gap-4">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold">{t("availability")}</h2>
						<p className="text-sm text-muted-foreground">
							{t("availabilityDescription")}
						</p>
					</div>
					<Badge variant="outline" className="text-xs">
						{t("fromPricingData")}
					</Badge>
				</header>
			) : null}

			<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
				{summaries.map((summary) => (
					<Card
						key={summary.modelId}
						className="border border-border/60 shadow-sm bg-card flex flex-col gap-2 p-4"
					>
						<div className="flex items-center gap-2">
							<Link
								href={`/organisations/${summary.providerId}`}
								className="flex items-center"
							>
								<ProviderLogo
									id={summary.providerId}
									alt={summary.providerName}
									size="xs"
								/>
							</Link>
							<div className="flex flex-col">
								<Link
									href={`/models/${
										summary.modelId
									}`}
									className="group text-sm font-semibold"
								>
									<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
										{summary.modelName}
									</span>
								</Link>
								<Link
									href={`/organisations/${summary.providerId}`}
									className="text-xs text-muted-foreground underline decoration-transparent hover:decoration-current transition-colors duration-200"
								>
									{summary.providerName}
								</Link>
							</div>
						</div>
						<div className="mt-3 space-y-2">
							<span className="text-xs font-medium text-muted-foreground">
								{t("availabilityProviders")}
							</span>
							{summary.providers.length ? (
								<div className="flex flex-wrap items-center gap-2">
									{summary.providers.map((provider) => (
										<div
											key={`${summary.modelId}-${provider.id}`}
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
								</div>
							) : (
								<span className="text-xs text-muted-foreground">-</span>
							)}
						</div>
					</Card>
				))}
			</div>
		</div>
	);
}

