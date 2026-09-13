import SubscriptionPlanDetailShell from "@/components/(data)/subscription-plans/SubscriptionPlanDetailShell";
import SubscriptionPlanOverview from "@/components/(data)/subscription-plans/SubscriptionPlanOverview";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

async function fetchPlan(baseId: string) {
	try {
		return await fetchFrontendSubscriptionPlan(baseId);
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
				"Explore AI subscription plans and pricing for leading AI tools on Phaseo, including model access, usage limits, feature differences, and practical upgrade paths.",
			path,
			keywords: [
				"AI subscription plan",
				"AI pricing",
				"LLM subscription",
				"Phaseo",
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
		priceSnippet =
			primaryPrice.frequency === "usage"
				? "Typical pricing is usage-based."
				: primaryPrice.frequency === "custom"
				? "Typical pricing is custom; contact sales."
				: `Typical pricing from ${primaryPrice.currency} ${primaryPrice.price} ${frequency}.`;
	}

	const descriptionParts = [
		`${plan.name} subscription from ${providerName} on Phaseo.`,
		plan.description
			? plan.description.length > 180
				? `${plan.description.slice(0, 177)}…`
				: plan.description
			: undefined,
		priceSnippet,
		"Compare features, limits, and model access against other AI subscription plans.",
	].filter(Boolean);

	return buildMetadata({
		title: `${plan.name} Plan`,
		description: descriptionParts.join(" "),
		path,
		keywords: [
			plan.name,
			`${plan.name} pricing`,
			providerName,
			"AI subscription plan",
			"AI pricing",
			"Phaseo",
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

	const plan = await fetchFrontendSubscriptionPlan(planId);

	if (!plan) {
		return <SubscriptionPlanDetailShell planId={planId}>{null}</SubscriptionPlanDetailShell>;
	}

	return (
		<SubscriptionPlanDetailShell planId={planId} tocItems={[{ id: "main-features", label: "Main Features" }, { id: "included-models", label: "Included Models" }]}>
			<SubscriptionPlanOverview plan={plan} />
		</SubscriptionPlanDetailShell>
	);
}
