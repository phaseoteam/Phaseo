import type { Metadata } from "next";
import type { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/types";
import { fetchFrontendSubscriptionPlans } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import SubscriptionPlansDisplay from "@/components/(data)/subscription-plans/SubscriptionPlansDisplay";
import { getSubscriptionPlansMessages } from "@/i18n/subscription-plans";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params;
	const messages = getSubscriptionPlansMessages((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	return {
	title: messages.title,
	description: messages.description,
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
		"Phaseo",
	],
	alternates: {
		canonical: "/subscription-plans",
	},
};

}

export default async function SubscriptionPlansPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const messages = getSubscriptionPlansMessages((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	const subscriptionPlans =
		(await fetchFrontendSubscriptionPlans()) as SubscriptionPlanSummary[];

	console.log("Fetched subscription plans:", subscriptionPlans.length);

	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<SubscriptionPlansDisplay plans={subscriptionPlans} labels={messages} />
			</div>
		</main>
	);
}
