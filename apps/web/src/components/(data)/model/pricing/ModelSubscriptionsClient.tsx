"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import { getLogoLabel } from "@/lib/logos";

export type SubscriptionPrice = {
	price: number;
	currency: string;
	frequency: string;
};

type SubscriptionPlanGroup = {
	organisationId: string;
	organisationName: string;
	organisationColour: string | null;
	plans: SubscriptionPlan[];
};

type SubscriptionLabelKey =
	| "other"
	| "monthly"
	| "quarterly"
	| "yearly"
	| "weekly"
	| "daily"
	| "usageBased"
	| "customPricing";
type SubscriptionLabels = Record<SubscriptionLabelKey, string>;

const PLAN_FREQUENCY_ALIASES: Record<string, string> = {
	mo: "monthly",
	month: "monthly",
	monthly: "monthly",
	qtr: "quarterly",
	quarter: "quarterly",
	quarterly: "quarterly",
	yr: "yearly",
	year: "yearly",
	annual: "yearly",
	yearly: "yearly",
	week: "weekly",
	weekly: "weekly",
	day: "daily",
	daily: "daily",
};

const PLAN_FREQUENCY_MONTH_MULTIPLIERS: Record<string, number> = {
	daily: 30,
	weekly: 4.345,
	monthly: 1,
	quarterly: 1 / 3,
	yearly: 1 / 12,
};

const PLAN_FREQUENCY_SORT_ORDER: Record<string, number> = {
	monthly: 0,
	quarterly: 1,
	yearly: 2,
	weekly: 3,
	daily: 4,
	usage: 98,
	custom: 99,
};

const CURRENCY_FORMATTER_CACHE = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string, locale: string): Intl.NumberFormat {
	const normalized = currency.toUpperCase();
	const cacheKey = `${locale}:${normalized}`;
	const cached = CURRENCY_FORMATTER_CACHE.get(cacheKey);
	if (cached) return cached;
	const formatter = new Intl.NumberFormat(locale, {
		style: "currency",
		currency: normalized,
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	});
	CURRENCY_FORMATTER_CACHE.set(cacheKey, formatter);
	return formatter;
}

function normalizePlanFrequency(value: string | null | undefined): string {
	const normalized = String(value ?? "").trim().toLowerCase();
	return PLAN_FREQUENCY_ALIASES[normalized] ?? normalized;
}

function getFrequencyLabel(value: string, labels: SubscriptionLabels): string {
	const normalized = normalizePlanFrequency(value);
	if (normalized === "monthly" || normalized === "quarterly" || normalized === "yearly" || normalized === "weekly" || normalized === "daily") {
		return labels[normalized];
	}
	return labels.other;
}

function isNonFixedPlanFrequency(value: string): boolean {
	const normalized = normalizePlanFrequency(value);
	return normalized === "usage" || normalized === "custom";
}

function toMonthlyEquivalent(price: SubscriptionPrice): number | null {
	const raw = Number(price.price);
	if (!Number.isFinite(raw) || raw < 0) return null;
	const normalized = normalizePlanFrequency(price.frequency);
	if (normalized === "usage" || normalized === "custom") return null;
	const multiplier = PLAN_FREQUENCY_MONTH_MULTIPLIERS[normalized];
	if (typeof multiplier !== "number") return raw;
	return raw * multiplier;
}

function getCurrencySortRank(currency: string | null | undefined): number {
	const normalized = String(currency ?? "").trim().toUpperCase();
	if (!normalized || normalized === "USD") return 0;
	return 1;
}

function formatPlanPriceValue(price: SubscriptionPrice, locale: string, labels: SubscriptionLabels): string {
	const normalized = normalizePlanFrequency(price.frequency);
	if (normalized === "usage") return labels.usageBased;
	if (normalized === "custom") return labels.customPricing;

	const currency = String(price.currency || "USD").toUpperCase();
	return getCurrencyFormatter(currency, locale).format(price.price);
}

function formatPlanPriceDisplay(price: SubscriptionPrice, locale: string, labels: SubscriptionLabels): {
	value: string;
	frequency: string | null;
} {
	if (isNonFixedPlanFrequency(price.frequency)) {
		return {
			value: formatPlanPriceValue(price, locale, labels),
			frequency: null,
		};
	}

	return {
		value: formatPlanPriceValue(price, locale, labels),
		frequency: getFrequencyLabel(price.frequency, labels),
	};
}

export function dedupeSubscriptionPlanPrices(
	prices: SubscriptionPrice[],
): SubscriptionPrice[] {
	return Array.from(
		new Map(
			prices.map((price) => [
				[
					normalizePlanFrequency(price.frequency),
					String(price.currency || "USD").trim().toUpperCase(),
					Number(price.price),
				].join(":"),
				price,
			]),
		).values(),
	);
}

function sortSubscriptionPlanPrices(prices: SubscriptionPrice[]): SubscriptionPrice[] {
	return dedupeSubscriptionPlanPrices(prices).toSorted((a, b) => {
		const aNonFixed = isNonFixedPlanFrequency(a.frequency);
		const bNonFixed = isNonFixedPlanFrequency(b.frequency);
		if (aNonFixed !== bNonFixed) return aNonFixed ? 1 : -1;

		const currencyRank = getCurrencySortRank(a.currency) - getCurrencySortRank(b.currency);
		if (currencyRank !== 0) return currencyRank;

		const aMonthly = toMonthlyEquivalent(a);
		const bMonthly = toMonthlyEquivalent(b);
		if (aMonthly != null && bMonthly != null && aMonthly !== bMonthly) {
			return aMonthly - bMonthly;
		}
		if (aMonthly == null && bMonthly != null) return 1;
		if (aMonthly != null && bMonthly == null) return -1;

		if (a.price !== b.price) return a.price - b.price;

		const aFrequencyOrder =
			PLAN_FREQUENCY_SORT_ORDER[normalizePlanFrequency(a.frequency)] ?? 99;
		const bFrequencyOrder =
			PLAN_FREQUENCY_SORT_ORDER[normalizePlanFrequency(b.frequency)] ?? 99;
		if (aFrequencyOrder !== bFrequencyOrder) {
			return aFrequencyOrder - bFrequencyOrder;
		}
		return String(a.frequency).localeCompare(String(b.frequency));
	});
}

export function sortSubscriptionPlanPricesForDisplay(
	prices: SubscriptionPrice[],
): SubscriptionPrice[] {
	return dedupeSubscriptionPlanPrices(prices).toSorted((a, b) => {
		const aNonFixed = isNonFixedPlanFrequency(a.frequency);
		const bNonFixed = isNonFixedPlanFrequency(b.frequency);
		if (aNonFixed !== bNonFixed) return aNonFixed ? 1 : -1;

		const currencyRank = getCurrencySortRank(a.currency) - getCurrencySortRank(b.currency);
		if (currencyRank !== 0) return currencyRank;

		const aFrequencyOrder =
			PLAN_FREQUENCY_SORT_ORDER[normalizePlanFrequency(a.frequency)] ?? 99;
		const bFrequencyOrder =
			PLAN_FREQUENCY_SORT_ORDER[normalizePlanFrequency(b.frequency)] ?? 99;
		if (aFrequencyOrder !== bFrequencyOrder) {
			return aFrequencyOrder - bFrequencyOrder;
		}

		return Number(a.price) - Number(b.price);
	});
}

function getPlanSortKey(prices: SubscriptionPrice[]): {
	currencyRank: number;
	monthlyEquivalent: number;
	rawPrice: number;
} | null {
	const sorted = sortSubscriptionPlanPrices(
		prices.filter(
			(price) =>
				Number.isFinite(Number(price.price)) &&
				Number(price.price) >= 0 &&
				Boolean(String(price.currency ?? "").trim()) &&
				!isNonFixedPlanFrequency(price.frequency),
		),
	);
	const first = sorted[0];
	if (!first) return null;
	return {
		currencyRank: getCurrencySortRank(first.currency),
		monthlyEquivalent: toMonthlyEquivalent(first) ?? Number(first.price),
		rawPrice: Number(first.price),
	};
}

function normalizeIdentity(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "");
}

function isOwnerGroup(
	group: SubscriptionPlanGroup,
	ownerOrganisationId: string | null | undefined,
	ownerOrganisationName: string | null | undefined,
): boolean {
	const ownerId = normalizeIdentity(ownerOrganisationId);
	const ownerName = normalizeIdentity(ownerOrganisationName);
	const groupId = normalizeIdentity(group.organisationId);
	const groupName = normalizeIdentity(group.organisationName);

	return Boolean(
		(ownerId && ownerId === groupId) || (ownerName && ownerName === groupName),
	);
}

function getStartingPriceText(plans: SubscriptionPlan[], locale: string, labels: SubscriptionLabels): string | null {
	const prices = sortSubscriptionPlanPricesForDisplay(
		plans.flatMap((plan) =>
			(plan.prices ?? []).filter(
				(price) =>
					Number.isFinite(Number(price.price)) && Number(price.price) >= 0,
			),
		),
	);
	const first = prices[0];
	if (!first) return null;
	if (isNonFixedPlanFrequency(first.frequency)) {
		return formatPlanPriceValue(first, locale, labels);
	}
	return `${formatPlanPriceValue(first, locale, labels)} ${getFrequencyLabel(first.frequency, labels)}`;
}

function getVisibleStartingPriceSortKey(plans: SubscriptionPlan[]): {
	currencyRank: number;
	frequencyRank: number;
	rawPrice: number;
} | null {
	const first = sortSubscriptionPlanPricesForDisplay(
		plans.flatMap((plan) =>
			(plan.prices ?? []).filter(
				(price) =>
					Number.isFinite(Number(price.price)) && Number(price.price) >= 0,
			),
		),
	)[0];
	if (!first) return null;
	return {
		currencyRank: getCurrencySortRank(first.currency),
		frequencyRank:
			PLAN_FREQUENCY_SORT_ORDER[normalizePlanFrequency(first.frequency)] ?? 99,
		rawPrice: Number(first.price),
	};
}

export default function ModelSubscriptionsClient({
	subscriptionPlans,
	ownerOrganisationId,
	ownerOrganisationName,
	showHeader = true,
}: {
	subscriptionPlans: SubscriptionPlan[];
	ownerOrganisationId?: string | null;
	ownerOrganisationName?: string | null;
	showHeader?: boolean;
}) {
	const tEmpty = useTranslations("Catalogue.modelDetail.emptyStates");
	const tLabels = useTranslations("Catalogue.modelDetail.sections");
	const locale = useLocale();
	const planLabels: SubscriptionLabels = {
		other: tLabels("other"),
		monthly: tLabels("monthly"),
		quarterly: tLabels("quarterly"),
		yearly: tLabels("yearly"),
		weekly: tLabels("weekly"),
		daily: tLabels("daily"),
		usageBased: tLabels("usageBased"),
		customPricing: tLabels("customPricing"),
	};
	const groupedPlans = subscriptionPlans.reduce<SubscriptionPlanGroup[]>((groups, plan) => {
		const organisationId = plan.organisation?.organisation_id ?? plan.organisation_id;
		const sourceOrganisationName = plan.organisation?.name?.trim();
		const organisationName = !sourceOrganisationName ||
			normalizeIdentity(sourceOrganisationName) === normalizeIdentity(organisationId)
			? getLogoLabel(organisationId)
			: sourceOrganisationName;
		const existing = groups.find((group) => group.organisationId === organisationId);
		if (existing) {
			existing.plans.push(plan);
			return groups;
		}
		groups.push({
			organisationId,
			organisationName,
			organisationColour: plan.organisation?.colour ?? null,
			plans: [plan],
		});
		return groups;
	}, []);

	groupedPlans.sort((a, b) => {
		const aKey = getVisibleStartingPriceSortKey(a.plans);
		const bKey = getVisibleStartingPriceSortKey(b.plans);
		if (aKey && bKey) {
			if (aKey.currencyRank !== bKey.currencyRank) {
				return aKey.currencyRank - bKey.currencyRank;
			}
			if (aKey.frequencyRank !== bKey.frequencyRank) {
				return aKey.frequencyRank - bKey.frequencyRank;
			}
			if (aKey.rawPrice !== bKey.rawPrice) {
				return aKey.rawPrice - bKey.rawPrice;
			}
		} else if (aKey && !bKey) {
			return -1;
		} else if (!aKey && bKey) {
			return 1;
		}

		const aIsOwner = isOwnerGroup(a, ownerOrganisationId, ownerOrganisationName);
		const bIsOwner = isOwnerGroup(b, ownerOrganisationId, ownerOrganisationName);
		if (aIsOwner !== bIsOwner) return aIsOwner ? -1 : 1;

		return a.organisationName.localeCompare(b.organisationName);
	});

	for (const group of groupedPlans) {
		group.plans.sort((a, b) => {
			const aKey = getPlanSortKey(a.prices ?? []);
			const bKey = getPlanSortKey(b.prices ?? []);
			if (aKey && bKey) {
				if (aKey.currencyRank !== bKey.currencyRank) {
					return aKey.currencyRank - bKey.currencyRank;
				}
				if (aKey.monthlyEquivalent !== bKey.monthlyEquivalent) {
					return aKey.monthlyEquivalent - bKey.monthlyEquivalent;
				}
				if (aKey.rawPrice !== bKey.rawPrice) {
					return aKey.rawPrice - bKey.rawPrice;
				}
			} else if (aKey && !bKey) {
				return -1;
			} else if (!aKey && bKey) {
				return 1;
			}
			return a.name.localeCompare(b.name);
		});
	}

	return (
		<div className="space-y-6">
			{showHeader ? (
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold tracking-tight text-foreground">
						{tLabels("subscriptions")}
					</h2>
					<p className="text-sm text-muted-foreground">
						{tLabels("subscriptionsDescription")}
					</p>
				</div>
			) : null}

			{groupedPlans.length > 0 ? (
				<div className="space-y-3 xl:grid xl:grid-cols-2 xl:items-start xl:gap-3 xl:space-y-0">
					{groupedPlans.map((group) => (
						<section
							key={group.organisationId}
							className="overflow-hidden rounded-xl border border-border bg-card"
						>
							<div className="flex flex-col gap-2 border-b border-border/70 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
								<div className="flex min-w-0 items-center gap-2.5">
									<span
										className="relative flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1 shadow-sm"
										style={{
											borderColor: group.organisationColour ?? undefined,
										}}
									>
										<Logo
											id={group.organisationId || group.organisationName}
										alt={tLabels("organisationLogo", { organisation: group.organisationName })}
											fill
											sizes="18px"
											className="object-contain p-1"
										/>
									</span>
									<div className="min-w-0">
										<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
											<h3 className="text-sm font-semibold text-foreground">
												{group.organisationName}
											</h3>
											{isOwnerGroup(
												group,
												ownerOrganisationId,
												ownerOrganisationName,
											) ? (
												<span className="text-xs text-muted-foreground">
												{tLabels("modelOwner")}
												</span>
											) : null}
										</div>
										<p className="text-xs text-muted-foreground">
											{tLabels("planCount", { count: group.plans.length })}
										</p>
									</div>
								</div>
								{getStartingPriceText(group.plans, locale, planLabels) ? (
									<div className="text-xs text-muted-foreground sm:text-right">
										{tLabels("from")} {" "}
										<span className="font-medium tabular-nums text-foreground">
										{getStartingPriceText(group.plans, locale, planLabels)}
										</span>
									</div>
								) : null}
							</div>
							<div>
								{group.plans.map((plan, index) => {
									const sortedPrices = sortSubscriptionPlanPricesForDisplay(
										(plan.prices ?? []).filter(
											(price) =>
												Number.isFinite(Number(price.price)) &&
												Number(price.price) >= 0,
										),
									);

									return (
										<div
											key={plan.plan_id}
											className={cn(
												"grid gap-2 px-4 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
												index > 0 && "border-t border-border/70",
											)}
										>
											<div className="min-w-0">
												<Link
													href={`/subscription-plans/${plan.plan_id}`}
													className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
												>
													{plan.name}
												</Link>
											</div>

											<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm sm:justify-end">
												{sortedPrices.length > 0 ? (
													sortedPrices.map((price, priceIndex) => {
									const displayPrice = formatPlanPriceDisplay(price, locale, planLabels);
														return (
															<span
																key={`${plan.plan_id}:${price.frequency}:${price.currency}:${price.price}`}
																className="inline-flex items-baseline gap-1 tabular-nums"
															>
																{priceIndex > 0 ? (
																	<span className="text-muted-foreground/50">/</span>
																) : null}
																<span className="font-semibold text-foreground">
																	{displayPrice.value}
																</span>
																{displayPrice.frequency ? (
																	<span className="text-xs text-muted-foreground">
																		{displayPrice.frequency}
																	</span>
																) : null}
															</span>
														);
													})
												) : (
													<div className="text-sm text-muted-foreground">
												{tEmpty("noSubscriptionPrice")}
													</div>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</section>
					))}
				</div>
			) : (
				<Empty className="rounded-lg border p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CreditCard className="size-5" />
						</EmptyMedia>
						<EmptyTitle>{tEmpty("noSubscriptions")}</EmptyTitle>
						<EmptyDescription>
							{tEmpty("noSubscriptionPricingDescription")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}
