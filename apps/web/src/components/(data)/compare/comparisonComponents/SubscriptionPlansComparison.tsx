import type { ExtendedModel } from "@/data/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Info } from "lucide-react";
import { ProviderLogo } from "../ProviderLogo";
import { PriceRotator } from "./PriceRotator";

interface SubscriptionPlansComparisonProps {
	selectedModels: ExtendedModel[];
}

type PlanPrice =
	NonNullable<ExtendedModel["subscription_plans"]>[number]["prices"][number];

const formatRateLimit = (value: unknown): string => {
	if (value === null || value === undefined) return "";
	if (typeof value === "string" || typeof value === "number") {
		return String(value);
	}
	if (typeof value === "object") {
		try {
			const serialized = JSON.stringify(value);
			return serialized === "{}" ? "" : serialized;
		} catch {
			return "";
		}
	}
	return "";
};

function formatNotes(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? trimmed : null;
	}
	if (typeof value === "object") {
		const maybeNotes = (value as any)?.notes;
		if (typeof maybeNotes === "string" && maybeNotes.trim()) {
			return maybeNotes.trim();
		}
		try {
			const serialized = JSON.stringify(value, null, 2);
			return serialized === "{}" ? null : serialized;
		} catch {
			return null;
		}
	}
	return String(value);
}

function getPlanNotes(
	plan: NonNullable<ExtendedModel["subscription_plans"]>[number]
): string | null {
	return (
		formatNotes(plan.model_info?.other_info) ??
		formatNotes(plan.model_info?.model_info)
	);
}

function normalizeFrequency(freq: string | null | undefined): string {
	const raw = (freq ?? "").trim();
	return raw || "one-off";
}

function monthlyMultiplier(freq: string): number | null {
	const f = freq.toLowerCase();
	if (f.includes("month")) return 1;
	if (f.includes("year") || f.includes("annual")) return 1 / 12;
	if (f.includes("week")) return 4.345;
	if (f.includes("day")) return 30.437;
	if (f.includes("hour")) return 24 * 30.437;
	// For one-off / unknown, don't attempt to normalize.
	if (f.includes("one") || f.includes("once") || f.includes("lifetime")) return null;
	return null;
}

function toMonthlyPrice(price: PlanPrice): number | null {
	if (price.price == null || !Number.isFinite(price.price)) return null;
	const freq = normalizeFrequency(price.frequency);
	const mult = monthlyMultiplier(freq);
	if (mult == null) return null;
	return price.price * mult;
}

function planSortKey(prices: PlanPrice[] | null | undefined): number {
	if (!prices || prices.length === 0) return Number.POSITIVE_INFINITY;
	const monthly = prices
		.map((p) => toMonthlyPrice(p))
		.filter((v): v is number => v != null && Number.isFinite(v));
	if (monthly.length > 0) return Math.min(...monthly);
	const raw = prices
		.map((p) => (p.price != null && Number.isFinite(p.price) ? p.price : null))
		.filter((v): v is number => v != null && Number.isFinite(v));
	return raw.length > 0 ? Math.min(...raw) : Number.POSITIVE_INFINITY;
}

function formatCurrencyAmount(amount: number, currency: string | null | undefined): string {
	const c = (currency ?? "").trim().toUpperCase();
	if (!c || c === "USD") return `$${amount.toFixed(2)}`;
	return `${c} ${amount.toFixed(2)}`;
}

function formatPriceLine(p: PlanPrice): string {
	const freq = normalizeFrequency(p.frequency);
	if (p.price == null || !Number.isFinite(p.price)) return `Custom / ${freq}`;
	return `${formatCurrencyAmount(p.price, p.currency)} / ${freq}`;
}

function getSortedPlanPrices(prices: PlanPrice[] | null | undefined): PlanPrice[] {
	if (!prices || prices.length === 0) return [];
	return [...prices].sort((a, b) => {
		const am = toMonthlyPrice(a);
		const bm = toMonthlyPrice(b);
		const aKey =
			am ?? (a.price != null && Number.isFinite(a.price) ? a.price : Number.POSITIVE_INFINITY);
		const bKey =
			bm ?? (b.price != null && Number.isFinite(b.price) ? b.price : Number.POSITIVE_INFINITY);
		if (aKey !== bKey) return aKey - bKey;
		return normalizeFrequency(a.frequency).localeCompare(normalizeFrequency(b.frequency));
	});
}

export default function SubscriptionPlansComparison({
	selectedModels,
}: SubscriptionPlansComparisonProps) {
	if (!selectedModels || selectedModels.length === 0) return null;

	const modelPlans = selectedModels.map((model) => ({
		model,
		plans: model.subscription_plans ?? [],
	}));

	const anyPlanData = modelPlans.some((entry) => entry.plans.length > 0);

	if (!anyPlanData) return null;

	return (
		<section className="space-y-3">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold">Subscription plans</h2>
				<p className="text-sm text-muted-foreground">
					Plans that include each selected model, grouped by organisation.
				</p>
			</header>

			<div className="grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
				{modelPlans.map(({ model, plans }) => (
					<div
						key={model.id}
						className="rounded-xl border border-border/60 p-4 space-y-4"
					>
						<div className="flex flex-col sm:flex-row sm:items-center gap-2">
							<div>
								<Link
									href={`/models/${model.id}`}
									className="font-semibold"
								>
									<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
										{model.name}
									</span>
								</Link>
								<p className="text-xs text-muted-foreground">
									{plans.length} plan
									{plans.length === 1 ? "" : "s"}
								</p>
							</div>
						</div>
						{plans.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No subscription plans include this model yet.
							</p>
						) : (
							<div className="grid gap-3">
								{[...plans]
									.sort((a, b) => {
										const diff = planSortKey(a.prices) - planSortKey(b.prices);
										if (diff !== 0) return diff;
										return a.name.localeCompare(b.name);
									})
									.map((plan) => {
										const sortedPrices = getSortedPlanPrices(plan.prices);
										const priceLines = sortedPrices.map(formatPriceLine);
										const notes = getPlanNotes(plan);
										return (
									<div
										key={`${model.id}-${plan.plan_uuid}`}
										className={`relative rounded-lg border border-border/40 p-3 flex flex-col gap-2 bg-background/60 ${notes ? "pr-10" : ""}`}
									>
										{notes ? (
											<Popover>
												<PopoverTrigger asChild>
													<button
														type="button"
														className="absolute top-3 right-3 inline-flex items-center justify-center rounded-md border border-border/60 bg-background/70 p-1.5 text-muted-foreground transition hover:text-foreground hover:border-border focus:outline-none focus:ring-2 focus:ring-ring/40"
														aria-label="View plan notes"
													>
														<Info className="h-4 w-4" />
													</button>
												</PopoverTrigger>
												<PopoverContent align="end" className="w-80">
													<div className="text-xs font-medium text-muted-foreground mb-1">
														Notes
													</div>
													<div className="text-sm whitespace-pre-wrap leading-5">
														{notes}
													</div>
												</PopoverContent>
											</Popover>
										) : null}
										<div className="flex flex-wrap items-center gap-2">
											<Link
												href={`/organisations/${plan.organisation.organisation_id}`}
												className="group"
											>
												<ProviderLogo
													id={plan.organisation.organisation_id}
													alt={plan.organisation.name}
													size="xxs"
												/>
											</Link>
											<div className="flex flex-col">
												<Link
													href={
														plan.link ??
														`/organisations/${plan.organisation.organisation_id}`
													}
													className="font-medium text-sm"
													target={
														plan.link
															? "_blank"
															: undefined
													}
													rel={
														plan.link
															? "noreferrer noopener"
															: undefined
													}
												>
													<span className="relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
														{plan.name}
													</span>
												</Link>
												<Link
													href={`/organisations/${plan.organisation.organisation_id}`}
													className="text-xs text-muted-foreground"
												>
													<span className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full">
														{plan.organisation.name}
													</span>
												</Link>
											</div>
											{formatRateLimit(
												plan.model_info?.rate_limit
											) && (
												<Badge
													variant="outline"
													className="text-[10px]"
												>
													{formatRateLimit(
														plan.model_info
															?.rate_limit
													)}
												</Badge>
											)}
										</div>
										{priceLines.length ? (
											<div className="flex items-center justify-between gap-2 min-w-0">
												<PriceRotator
													lines={priceLines}
													className="text-sm font-mono text-primary min-w-0"
												/>
												{priceLines.length > 1 ? (
													<Badge variant="outline" className="text-[10px]">
														+{priceLines.length - 1}
													</Badge>
												) : null}
											</div>
										) : (
											<p className="text-sm font-mono text-muted-foreground">
												Price unavailable
											</p>
										)}
										{plan.description && (
											<p className="text-xs text-muted-foreground line-clamp-2">
												{plan.description}
											</p>
										)}
									</div>
										);
									})}
							</div>
						)}
					</div>
				))}
			</div>
		</section>
	);
}
