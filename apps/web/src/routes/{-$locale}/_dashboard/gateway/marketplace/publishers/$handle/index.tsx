import { createFileRoute } from "@tanstack/react-router";
import MarketplacePublisherPage from "@/features/gateway/marketplace/publishers/handle/MarketplacePublisherPage";
import { resolveMarketplacePublisher } from "@/features/gateway/marketplace/publishers/handle/page.functions";
import { notFound, redirect } from "@/lib/navigation";

export const Route = createFileRoute("/{-$locale}/_dashboard/gateway/marketplace/publishers/$handle/")({
	beforeLoad: async ({ params }) => {
		const { redirectTo, found } = await resolveMarketplacePublisher({ data: params.handle });
		if (redirectTo) redirect(redirectTo);
		if (!found) notFound();
	},
	component: MarketplacePublisherPage,
});
