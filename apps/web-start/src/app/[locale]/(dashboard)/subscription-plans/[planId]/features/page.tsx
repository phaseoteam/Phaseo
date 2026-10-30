import SubscriptionPlanDetailShell from "@/components/(data)/subscription-plans/SubscriptionPlanDetailShell";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import SubscriptionPlanFeaturesTable from "@/components/(data)/subscription-plans/SubscriptionPlanFeaturesTable";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { formatSubscriptionPlanMessage, getSubscriptionPlansMessagesFor } from "@/i18n/subscription-plans";

async function fetchPlanForFeatures(planId: string) {
	try {
		return await fetchFrontendSubscriptionPlan(planId);
	} catch (error) {
		console.warn(
			"[seo] failed to load subscription plan features metadata",
			{
				planId,
				error,
			}
		);
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<{ locale: string; planId: string }>;
}): Promise<Metadata> {
	const { planId, locale } = await props.params;
	const messages = getSubscriptionPlansMessagesFor(locale);
	const plan = await fetchPlanForFeatures(planId);
	const path = `/subscription-plans/${planId}/features`;
	const imagePath = `/og/subscription-plans/${planId}`;

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

	const description = [
		formatSubscriptionPlanMessage(messages.metadata.featuresLead, {
			plan: plan.name,
			provider: providerName,
		}),
		messages.metadata.featuresDescription,
	].join(" ");

	return buildMetadata({
		title: formatSubscriptionPlanMessage(messages.metadata.featuresTitle, { plan: plan.name }),
		description,
		path,
		keywords: [
			plan.name,
			`${plan.name} features`,
			`${plan.name} limits`,
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
		return null; // Shell handles not found
	}

	return (
		<SubscriptionPlanDetailShell planId={planId} tab="features">
			<section className="space-y-4">
				<h2 className="text-xl font-semibold">{messages.detail.allFeatures}</h2>
					{plan.features && plan.features.length > 0 ? (
						<SubscriptionPlanFeaturesTable
							features={plan.features}
							messages={messages.detail}
						/>
					) : (
						<p className="text-muted-foreground">
							{messages.detail.noFeatures}
						</p>
					)}
			</section>
		</SubscriptionPlanDetailShell>
	);
}
