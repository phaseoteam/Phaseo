// Next: src/app/[locale]/(dashboard)/gateway/marketplace/publishers/[handle]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page from "@/app/[locale]/(dashboard)/gateway/marketplace/publishers/[handle]/page";
import { resolveMarketplacePublisher } from "@/app/[locale]/(dashboard)/gateway/marketplace/publishers/[handle]/page.functions";
import { notFound, redirect } from "next/navigation";


export const Route = createFileRoute("/{-$locale}/_dashboard/gateway/marketplace/publishers/$handle/")({
	beforeLoad: async ({ params }) => {
		const { redirectTo, found } = await resolveMarketplacePublisher({ data: params.handle });
		if (redirectTo) redirect(redirectTo);
		if (!found) notFound();
	},
	component: nextPageComponent(Page),
});
