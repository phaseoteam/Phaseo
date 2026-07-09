import SubscriptionPlanDetailShell from "@/components/(data)/subscription-plans/SubscriptionPlanDetailShell";
import { fetchFrontendSubscriptionPlan } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

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

export async function generateMetadata(props: {
	params: Promise<{ planId: string }>;
}): Promise<Metadata> {
	const { planId } = await props.params;
	const plan = await fetchPlanForModels(planId);
	const path = `/subscription-plans/${planId}/models`;
	const imagePath = `/og/subscription-plans/${planId}`;

	if (!plan) {
		return buildMetadata({
			title: "AI Subscription Plan Models",
			description:
				"See which AI models are included in popular subscription plans on Phaseo, with access scope, provider coverage, and plan-level model availability details.",
			path,
			keywords: [
				"AI subscription models",
				"models included in AI plans",
				"AI model access",
				"Phaseo",
			],
			imagePath,
		});
	}

	const providerName = plan.organisation?.name ?? "AI provider";

	const description = [
		`Models included in the ${plan.name} subscription from ${providerName}.`,
		"See which AI models you can access, how they compare to alternatives, and what’s available at each subscription tier.",
	].join(" ");

	return buildMetadata({
		title: `${plan.name} - Models Included in This Subscription`,
		description,
		path,
		keywords: [
			plan.name,
			`${plan.name} models`,
			`${plan.name} model access`,
			providerName,
			"AI subscription models",
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
					<CardTitle>All Included Models</CardTitle>
				</CardHeader>
				<CardContent>
					{plan.models && plan.models.length > 0 ? (
						<div className="space-y-3">
							{plan.models.map((modelInfo) => (
								<div
									key={modelInfo.model_id}
									className="flex items-center justify-between p-3 border rounded-lg"
								>
									<div className="flex-1">
										<Link
											href={`/models/${modelInfo.model_id}`}
											className="font-medium hover:text-primary transition-colors"
										>
											{modelInfo.model.name}
										</Link>
										{modelInfo.model.organisation_name && (
											<p className="text-sm text-muted-foreground">
												by{" "}
												{
													modelInfo.model
														.organisation_name
												}
											</p>
										)}
										{modelInfo.rate_limit && (
											<p className="text-xs text-muted-foreground mt-1">
												Rate limit:{" "}
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
							No models information available.
						</p>
					)}
				</CardContent>
			</Card>
		</SubscriptionPlanDetailShell>
	);
}
