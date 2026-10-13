import { formatSubscriptionPrice } from "@/lib/fetchers/subscription-plans/pricing";
import SubscriptionPlanDetailShell from "@/components/(data)/subscription-plans/SubscriptionPlanDetailShell";
import SubscriptionPlanOverview from "@/components/(data)/subscription-plans/SubscriptionPlanOverview";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { formatSubscriptionPlanMessage, getSubscriptionPlansMessagesFor } from "@/i18n/subscription-plans";

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
	params: Promise<{ locale: string; planId: string }>;
}): Promise<Metadata> {
	const { planId, locale } = await props.params;
	const messages = getSubscriptionPlansMessagesFor(locale);
	const plan = await fetchPlan(planId);
	const path = `/subscription-plans/${planId}`;
	const imagePath = `/og/subscription-plans/${planId}`;

	// Fallback if we can't load the plan
	if (!plan) {
		return buildMetadata({
			title: messages.metadata.fallbackTitle,
			description: messages.metadata.fallbackDescription,
			path,
			keywords: ["Phaseo"],
			imagePath,
		});
	}

	const providerName = plan.organisation?.name ?? messages.detail.unknownProvider;

	// Try to pull out one representative price (e.g. primary monthly plan)
	const primaryPrice = plan.prices?.[0];
	let priceSnippet: string | undefined;
	if (primaryPrice) {
		priceSnippet = formatSubscriptionPrice(primaryPrice, undefined, { custom: messages.metadata.customPricing, usage: messages.metadata.usagePricing, unknown: "Price unavailable" });
	}

	const descriptionParts = [
		formatSubscriptionPlanMessage(messages.metadata.planLead, {
			plan: plan.name,
			provider: providerName,
		}),
		plan.description
			? plan.description.length > 180
				? `${plan.description.slice(0, 177)}…`
				: plan.description
			: undefined,
		priceSnippet,
		messages.metadata.comparePlans,
	].filter(Boolean);

	return buildMetadata({
		title: formatSubscriptionPlanMessage(messages.metadata.planTitle, { plan: plan.name }),
		description: descriptionParts.join(" "),
		path,
		keywords: [
			plan.name,
			`${plan.name} pricing`,
			providerName,
			"Phaseo",
		],
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ locale: string; planId: string }>;
}) {
	const { planId, locale } = await params;
	const messages = getSubscriptionPlansMessagesFor(locale);

	const plan = await fetchFrontendSubscriptionPlan(planId);

	if (!plan) {
		return <SubscriptionPlanDetailShell planId={planId}>{null}</SubscriptionPlanDetailShell>;
	}

	return (
		<SubscriptionPlanDetailShell planId={planId} tocItems={[{ id: "main-features", label: messages.detail.mainFeatures }, { id: "included-models", label: messages.detail.includedModels }]}>
			<SubscriptionPlanOverview plan={plan} messages={messages.detail} />
		</SubscriptionPlanDetailShell>
	);
}
