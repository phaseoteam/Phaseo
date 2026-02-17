import type { ExtendedModel } from "@/data/types";
import {
	Card,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ProviderLogo } from "../ProviderLogo";
import { ProviderLogoName } from "../ProviderLogoName";

interface AvailabilityComparisonProps {
	selectedModels: ExtendedModel[];
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
	models: ExtendedModel[]
): AvailabilitySummary[] {
	return models.map((model) => {
		const providerId = model.provider?.provider_id ?? model.provider?.name;
		const providerName = model.provider?.name ?? providerId ?? "Unknown";

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
				providerMap.set(priceProviderId, priceProviderName);
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
}: AvailabilityComparisonProps) {
	if (!selectedModels || selectedModels.length === 0) return null;

	const summaries = buildAvailabilitySummaries(selectedModels);

	const anyPricing = summaries.some((s) => s.providers.length > 0);
	if (!anyPricing) return null;

	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Availability</h2>
					<p className="text-sm text-muted-foreground">
						Providers that expose each model based on observed pricing data.
					</p>
				</div>
				<Badge variant="outline" className="text-xs">
					From provider pricing data
				</Badge>
			</header>

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
									href={`/models/${encodeURIComponent(
										summary.modelId
									)}`}
									className="group text-sm font-semibold"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 group-hover:after:w-full">
										{summary.modelName}
									</span>
								</Link>
								<Link
									href={`/organisations/${summary.providerId}`}
									className="text-xs text-muted-foreground hover:underline"
								>
									{summary.providerName}
								</Link>
							</div>
						</div>
						<div className="mt-3 space-y-2">
							<span className="text-xs font-medium text-muted-foreground">
								Providers
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
		</section>
	);
}
