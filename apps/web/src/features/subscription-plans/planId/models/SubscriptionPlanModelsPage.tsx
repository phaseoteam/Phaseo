import SubscriptionPlanDetailShell from "@/components/(data)/subscription-plans/SubscriptionPlanDetailShell";
import { getTranslations } from "@/i18n/server";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import Link from "@/components/link";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { buildMetadata } from "@/lib/seo";
import { formatSubscriptionPlanMessage, getSubscriptionPlansMessagesFor } from "@/i18n/subscription-plans";
import { useTranslations } from "@/i18n/react";
import { useParams } from "@tanstack/react-router";
import { defaultLocale } from "@/i18n/locales";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useSuspenseQuery } from "@tanstack/react-query";
import { subscriptionPlanQuery } from "../page.queries";

async function fetchPlanForModels(planId: string) {
	try {
		return await fetchFrontendSubscriptionPlan(planId);
	} catch (error) {
		console.warn("[seo] failed to load subscription plan models metadata", {
			planId,
			error,
		});
		return null;
	}
}

export async function getSubscriptionPlanModelsMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { planId, locale } = params;
	const messages = getSubscriptionPlansMessagesFor(locale);
	const plan = await fetchPlanForModels(planId);
	const path = `/subscription-plans/${planId}/models`;
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
		formatSubscriptionPlanMessage(messages.metadata.modelsLead, {
			plan: plan.name,
			provider: providerName,
		}),
		messages.metadata.modelsDescription,
	].join(" ");

	return buildMetadata({
		title: formatSubscriptionPlanMessage(messages.metadata.modelsTitle, { plan: plan.name }),
		description,
		path,
		keywords: [
			plan.name,
			`${plan.name} models`,
			`${plan.name} model access`,
			providerName,
			"Phaseo",
		],
		imagePath,
	});
}

export default function SubscriptionPlanModelsPage() {
	const { planId, locale: localeParam } = useParams({ from: "/{-$locale}/_dashboard/subscription-plans/$planId/models/" });
	const locale = localeParam ?? defaultLocale;
	const messages = getSubscriptionPlansMessagesFor(locale);

	const { data: plan } = useSuspenseQuery(subscriptionPlanQuery(planId));
	const access = useTranslations("Common.ui.subscriptionCatalog");

	if (!plan) {
		return null; // Shell handles not found
	}

	return (
		<SubscriptionPlanDetailShell planId={planId} tab="models">
			<section className="space-y-4">
				<h2 className="text-xl font-semibold">{access("plan_model_access")}</h2>
					{plan.models && plan.models.length > 0 ? (
						<div className="divide-y divide-border/70 border-y border-border/70">
							{plan.models.map((modelInfo) => (
								<div
									key={modelInfo.model_id}
									className="flex items-center justify-between px-1 py-4"
								>
									<div className="flex-1">
										<Link
											href={`/models/${modelInfo.model_id}`}
											className="font-medium hover:text-primary transition-colors"
										>
											{modelInfo.model.name}
										</Link>
										<p className="text-xs text-muted-foreground">{[modelInfo.mapping_status === "example" ? access("example") : modelInfo.mapping_status === "unverified" ? access("unverified") : null, modelInfo.access_channel, modelInfo.conditions].filter(Boolean).join(" · ")}</p>
										{modelInfo.model.organisation_name && (
											<p className="text-sm text-muted-foreground">
												{messages.detail.byOrganisation.replace("{name}", "")}
												{
													modelInfo.model
														.organisation_name
												}
											</p>
										)}
										{modelInfo.rate_limit && (
											<p className="text-xs text-muted-foreground mt-1">
												{messages.detail.rateLimit.replace("{limit}", "")}
												{JSON.stringify(
													modelInfo.rate_limit
												)}
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-muted-foreground">
							{messages.detail.noModels}
						</p>
					)}
			</section>
		</SubscriptionPlanDetailShell>
	);
}
