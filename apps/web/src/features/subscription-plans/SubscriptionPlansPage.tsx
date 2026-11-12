import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { useParams } from "@tanstack/react-router";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useSuspenseQuery } from "@tanstack/react-query";
import { subscriptionPlansQuery } from "./page.queries";
import SubscriptionPlansDisplay from "@/components/(data)/subscription-plans/SubscriptionPlansDisplay";
import { getSubscriptionPlansMessages } from "@/i18n/subscription-plans";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";

export async function getSubscriptionPlansMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params;
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

export default function SubscriptionPlansPage() {
	const { locale } = useParams({ from: "/{-$locale}/_dashboard/subscription-plans/" });
	const messages = getSubscriptionPlansMessages((locale && isPublicLocale(locale) ? locale : "en-GB") as PublicLocale);
	const { data: subscriptionPlans } = useSuspenseQuery(subscriptionPlansQuery());

	console.log("Fetched subscription plans:", subscriptionPlans.length);

	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<SubscriptionPlansDisplay plans={subscriptionPlans} labels={messages} />
			</div>
		</main>
	);
}
