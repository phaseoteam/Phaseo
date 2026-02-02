import SubscriptionPlanDetailShell from "@/components/(data)/subscription-plans/SubscriptionPlanDetailShell";
import SubscriptionPlanOverview from "@/components/(data)/subscription-plans/SubscriptionPlanOverview";
import { getSubscriptionPlanCached } from "@/lib/fetchers/subscription-plans/getSubscriptionPlan";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

async function fetchPlan(baseId: string) {
	try {
		return await getSubscriptionPlanCached(baseId, false);
	} catch (error) {
		console.warn("[seo] failed to load subscription plan metadata", {
			baseId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<{ planId: string }>;
}): Promise<Metadata> {
	const { planId } = await props.params;
	const plan = await fetchPlan(planId);
	const path = `/subscription-plans/${planId}`;
	const imagePath = `/og/subscription-plans/${planId}`;

	// Fallback if we can't load the plan
	if (!plan) {
		return buildMetadata({
			title: "AI Subscription Plan Details",
			description:
				"Explore AI subscription plans and pricing for leading AI tools on AI Stats, including model access, limits, and upgrade paths.",
			path,
			keywords: [
				"AI subscription plan",
				"AI pricing",
				"LLM subscription",
				"AI Stats",
			],
			imagePath,
		});
	}

	const providerName = plan.organisation?.name ?? "AI provider";

	// Try to pull out one representative price (e.g. primary monthly plan)
	const primaryPrice = plan.prices?.[0];
	let priceSnippet: string | undefined;
	if (primaryPrice) {
		const frequency =
			primaryPrice.frequency === "monthly"
				? "per month"
				: primaryPrice.frequency === "yearly"
				? "per year"
				: primaryPrice.frequency;
		priceSnippet = `Typical pricing from ${primaryPrice.currency} ${primaryPrice.price} ${frequency}.`;
	}

	const descriptionParts = [
		`${plan.name} subscription from ${providerName} on AI Stats.`,
		plan.description
			? plan.description.length > 180
				? `${plan.description.slice(0, 177)}…`
				: plan.description
			: undefined,
		priceSnippet,
		"Compare features, limits, and model access against other AI subscription plans.",
	].filter(Boolean);

	return buildMetadata({
		title: `${plan.name} – Pricing, Limits & Features`,
		description: descriptionParts.join(" "),
		path,
		keywords: [
			plan.name,
			`${plan.name} pricing`,
			providerName,
			"AI subscription plan",
			"AI pricing",
			"AI Stats",
		],
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ planId: string }>;
}) {
	const { planId } = await params;

	const plan = await getSubscriptionPlanCached(planId, false);

	if (!plan) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed p-6 md:p-8 text-center bg-muted/30">
						<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<span className="text-xl">💰</span>
						</div>
						<p className="text-base font-medium">
							Subscription plan not found
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							This subscription plan may have been removed or is
							no longer available.
						</p>
					</div>
				</div>
			</main>
		);
	}

	return (
		<SubscriptionPlanDetailShell planId={planId}>
			<SubscriptionPlanOverview plan={plan} />
		</SubscriptionPlanDetailShell>
	);
}
