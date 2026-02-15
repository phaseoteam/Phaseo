import type { Metadata } from "next";
import {
	SubscriptionPlanSummary,
	getAllSubscriptionPlansCached,
} from "@/lib/fetchers/subscription-plans/getAllSubscriptionPlans";
import SubscriptionPlansDisplay from "@/components/(data)/subscription-plans/SubscriptionPlansDisplay";

export const metadata: Metadata = {
	title: "AI Subscription Plans – Compare Pricing & Features",
	description:
		"Explore a comprehensive directory of AI subscription plans like ChatGPT Plus, Claude Pro, SuperGrok and more. Compare pricing, features, model access and limits across leading AI providers to find the right plan for your needs.",
	keywords: [
		"AI subscription plans",
		"AI pricing",
		"LLM subscriptions",
		"subscription tiers",
		"AI model access",
		"compare AI plans",
		"ChatGPT Plus pricing",
		"Claude Pro pricing",
		"SuperGrok pricing",
		"AI Stats",
	],
	alternates: {
		canonical: "/subscription-plans",
	},
};

export default async function SubscriptionPlansPage() {
	const subscriptionPlans =
		(await getAllSubscriptionPlansCached()) as SubscriptionPlanSummary[];

	console.log("Fetched subscription plans:", subscriptionPlans.length);

	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<SubscriptionPlansDisplay plans={subscriptionPlans} />
			</div>
		</main>
	);
}
