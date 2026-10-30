// Next: src/app/[locale]/(dashboard)/settings/credits/onboarding/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/settings/credits/onboarding/page";
import { redirect } from "next/navigation";
import { shouldRedirectFromOnboarding } from "@/app/[locale]/(dashboard)/settings/credits/onboarding/page";
import { creditsOnboardingInitialDataQuery } from "@/app/[locale]/(dashboard)/settings/credits/credits.functions";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/credits/onboarding/")({
	beforeLoad: async ({ context }) => {
		const initialData = await context.queryClient.ensureQueryData(creditsOnboardingInitialDataQuery());
		if (shouldRedirectFromOnboarding(initialData)) redirect("/settings/credits");
	},
	loader: async ({ params, location }) => ({ metadata: await routeMetadata({ data: { params, search: location.search as Record<string, unknown> } }) }),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
