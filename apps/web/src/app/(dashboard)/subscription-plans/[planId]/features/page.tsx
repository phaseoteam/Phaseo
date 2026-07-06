import SubscriptionPlanDetailShell from "@/components/(data)/subscription-plans/SubscriptionPlanDetailShell";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import SubscriptionPlanFeaturesTable from "@/components/(data)/subscription-plans/SubscriptionPlanFeaturesTable";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

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
	params: Promise<{ planId: string }>;
}): Promise<Metadata> {
	const { planId } = await props.params;
	const plan = await fetchPlanForFeatures(planId);
	const path = `/subscription-plans/${planId}/features`;
	const imagePath = `/og/subscription-plans/${planId}`;

	if (!plan) {
		return buildMetadata({
			title: "AI Subscription Plan Features",
			description:
				"Compare features included in AI subscription plans on Phaseo, including request limits, tool availability, support tiers, and other plan-level capabilities.",
			path,
			keywords: [
				"AI subscription features",
				"AI plan limits",
				"AI tools access",
				"Phaseo",
			],
			imagePath,
		});
	}

	const providerName = plan.organisation?.name ?? "AI provider";

	const description = [
		`Features included in the ${plan.name} subscription from ${providerName}.`,
		"Review usage limits, priority access, tools, context window sizes, and other benefits compared to alternative plans.",
	].join(" ");

	return buildMetadata({
		title: `${plan.name} - Features, Limits & Benefits`,
		description,
		path,
		keywords: [
			plan.name,
			`${plan.name} features`,
			`${plan.name} limits`,
			providerName,
			"AI subscription features",
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
		return null; // Shell handles not found
	}

	return (
		<SubscriptionPlanDetailShell planId={planId}>
			<Card>
				<CardHeader>
					<CardTitle>All Features</CardTitle>
				</CardHeader>
				<CardContent>
					{plan.features && plan.features.length > 0 ? (
						<SubscriptionPlanFeaturesTable
							features={plan.features}
						/>
					) : (
						<p className="text-muted-foreground">
							No features information available.
						</p>
					)}
				</CardContent>
			</Card>
		</SubscriptionPlanDetailShell>
	);
}
