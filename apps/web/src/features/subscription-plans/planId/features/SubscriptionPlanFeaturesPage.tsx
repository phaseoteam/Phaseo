import SubscriptionPlanDetailShell from "@/components/(data)/subscription-plans/SubscriptionPlanDetailShell";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import SubscriptionPlanFeaturesTable from "@/components/(data)/subscription-plans/SubscriptionPlanFeaturesTable";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { buildMetadata } from "@/lib/seo";
import { formatSubscriptionPlanMessage, getSubscriptionPlansMessagesFor } from "@/i18n/subscription-plans";
import { useParams } from "@tanstack/react-router";
import { defaultLocale } from "@/i18n/locales";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useSuspenseQuery } from "@tanstack/react-query";
import { subscriptionPlanQuery } from "../page.queries";

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

export async function getSubscriptionPlanFeaturesMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { planId, locale } = params;
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

export default function SubscriptionPlanFeaturesPage() {
	const { planId, locale: localeParam } = useParams({ from: "/{-$locale}/_dashboard/subscription-plans/$planId/features/" });
	const locale = localeParam ?? defaultLocale;
	const messages = getSubscriptionPlansMessagesFor(locale);

	const { data: plan } = useSuspenseQuery(subscriptionPlanQuery(planId));

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
