import Image from "next/image";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ModelAvailabilityItem } from "@/lib/fetchers/models/getModelAvailability";
import type { SubscriptionPlan } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import { Logo } from "@/components/Logo";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import RotatingPricing from "./RotatingPricing";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";

function SectionEmpty({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="rounded-lg border border-dashed p-6 md:p-8 text-center bg-muted/30">
			<p className="text-base font-medium">{title}</p>
			<p className="mt-1 text-sm text-muted-foreground">{description}</p>
		</div>
	);
}

interface ModelAvailabilityProps {
	availability: ModelAvailabilityItem[];
	subscriptionPlans: SubscriptionPlan[];
	model: ModelOverviewPage | null;
}

export default async function ModelAvailability({
	availability,
	subscriptionPlans,
	model,
}: ModelAvailabilityProps) {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.modelDetail");
	const tAvailability = await getTranslations(
		"Catalogue.modelDetail.availabilityLabels",
	);
	const countryNames = new Intl.DisplayNames([locale], { type: "region" });
	const organisationName = model?.organisation?.name;

	const providerGroups = new Map<
		string,
		{
			providerId: string;
			providerName: string;
			items: ModelAvailabilityItem[];
			slugSet: Set<string>;
			providerCountry: string | null;
		}
	>();

	for (const item of availability ?? []) {
		const providerId =
			item.provider?.api_provider_id ?? item.api_provider_id;
		const providerName = resolveProviderDisplayName({ providerId, providerName: item.provider?.api_provider_name ?? item.api_provider_id });

		if (!providerId) continue;
		const existing = providerGroups.get(providerId);
		if (existing) {
			existing.items.push(item);
			if (item.provider_model_slug) {
				existing.slugSet.add(item.provider_model_slug);
			}
			continue;
		}
		const slugSet = new Set<string>();
		if (item.provider_model_slug) {
			slugSet.add(item.provider_model_slug);
		}
		providerGroups.set(providerId, {
			providerId,
			providerName,
			items: [item],
			slugSet,
			providerCountry: item.provider?.country_code ?? null,
		});
	}

	const providerCards = Array.from(providerGroups.values()).sort((a, b) => {
		const aMatches =
			organisationName && a.providerName === organisationName;
		const bMatches =
			organisationName && b.providerName === organisationName;
		if (aMatches && !bMatches) return -1;
		if (!aMatches && bMatches) return 1;
		return a.providerName.localeCompare(b.providerName);
	});

	return (
		<div className="w-full mx-auto space-y-4">
			<div className="space-y-4">
				<h3 className="text-xl font-semibold">
					{t("sections.providerAvailability")}
				</h3>
				{providerCards.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{providerCards.map((group) => {
							const slugs = Array.from(group.slugSet).sort(
								(a, b) => a.localeCompare(b)
							);

							return (
								<Card
									key={group.providerId}
									className="border-slate-200/70 dark:border-slate-800/80"
								>
									<CardHeader className="p-4">
										<div className="flex items-center justify-between gap-3">
											<div className="flex items-center gap-3">
												<Link
													href={`/api-providers/${group.providerId}`}
													className="group"
												>
													<div className="w-10 h-10 relative flex items-center justify-center rounded-xl border">
														<div className="w-7 h-7 relative">
															<Logo
																id={
																	group.providerId
																}
												alt={tAvailability("providerLogo", {
													provider: group.providerName,
												})}
																className="group-hover:opacity-80 transition object-contain"
																fill
															/>
														</div>
													</div>
												</Link>
												<div className="space-y-1">
													<Link
														href={`/api-providers/${group.providerId}`}
														className="group"
													>
														<CardTitle className="text-base inline-block group-hover:text-primary transition-colors relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
															{group.providerName}
														</CardTitle>
													</Link>
													<p className="text-xs text-muted-foreground font-mono break-all">
														{slugs.length > 0
															? slugs.join(", ")
										: tAvailability("noModelSlug")}
													</p>
												</div>
											</div>
											{group.providerCountry ? (
								<Link
									href={`/countries/${group.providerCountry.toLowerCase()}`}
									aria-label={tAvailability("viewCountryDetails", {
										country:
											countryNames.of(group.providerCountry) ??
											group.providerCountry,
									})}
								>
									<Image
										src={`/flags/${group.providerCountry.toLowerCase()}.svg`}
										alt={tAvailability("countryFlag", {
											country:
												countryNames.of(group.providerCountry) ??
												group.providerCountry,
										})}
														width={24}
														height={16}
														className="h-8 w-auto rounded-sm border"
													/>
												</Link>
											) : null}
										</div>
									</CardHeader>
								</Card>
							);
						})}
					</div>
				) : (
					<SectionEmpty
						title={t("emptyStates.noProvidersTitle")}
						description={t("emptyStates.noProvidersDescription")}
					/>
				)}
			</div>

			<div className="space-y-4">
						<h3 className="text-xl font-semibold">
							{t("sections.subscriptions")}
						</h3>

				{subscriptionPlans && subscriptionPlans.length > 0 ? (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{subscriptionPlans.map((plan) => {
							return (
								<div
									key={plan.plan_id}
									className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg h-full"
								>
									<Link
										href={`/subscription-plans/${plan.plan_id}`}
										className="text-sm font-semibold hover:text-primary transition-colors mb-3"
									>
										<span className="relative underline decoration-transparent hover:decoration-current transition-colors duration-200">
											{plan.name}
										</span>
									</Link>
									<p className="text-xs text-muted-foreground mb-3">
											{tAvailability("via")} {" "}
											{plan.organisation?.name ??
												tAvailability("unknownProvider")}
									</p>
									<div className="space-y-3">
										<div>
											<p className="text-[0.65rem] uppercase text-muted-foreground mb-1">
												{tAvailability("price")}
											</p>
											<RotatingPricing
												prices={plan.prices}
											/>
										</div>{" "}
										{plan.model_info.rate_limit &&
											typeof plan.model_info
												.rate_limit === "string" &&
											plan.model_info.rate_limit.trim() && (
												<div>
													<p className="text-[0.65rem] uppercase text-muted-foreground mb-1">
														{tAvailability("rateLimit")}
													</p>
													<p className="text-xs text-muted-foreground">
														{
															plan.model_info
																.rate_limit
														}
													</p>
												</div>
											)}
										{plan.model_info.model_info &&
											typeof plan.model_info
												.model_info === "string" &&
											plan.model_info.model_info.trim() && (
												<div>
													<p className="text-[0.65rem] uppercase text-muted-foreground mb-1">
														{tAvailability("notes")}
													</p>
													<p className="text-xs text-muted-foreground line-clamp-3">
														{
															plan.model_info
																.model_info
														}
													</p>
												</div>
											)}
										{plan.description && (
											<div>
												<p className="text-[0.65rem] uppercase text-muted-foreground mb-1">
													{tAvailability("description")}
												</p>
												<p className="text-xs text-muted-foreground line-clamp-3">
													{plan.description}
												</p>
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<SectionEmpty
						title={t("emptyStates.noSubscriptions")}
						description={t(
							"emptyStates.noSubscriptionPricingDescription",
						)}
					/>
				)}
			</div>
		</div>
	);
}
