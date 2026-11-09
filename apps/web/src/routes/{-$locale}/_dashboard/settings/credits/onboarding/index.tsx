import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import CreditsOnboardingPage, { getCreditsOnboardingMetadata } from "@/features/settings/credits/onboarding/CreditsOnboardingPage";
import { redirect } from "@/lib/navigation";
import { shouldRedirectFromOnboarding } from "@/features/settings/credits/onboarding/CreditsOnboardingPage";
import { creditsOnboardingInitialDataQuery } from "@/features/settings/credits/credits.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getCreditsOnboardingMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/settings/credits/onboarding/")({
	beforeLoad: async ({ context }) => {
		const initialData = await context.queryClient.ensureQueryData(creditsOnboardingInitialDataQuery());
		if (shouldRedirectFromOnboarding(initialData)) redirect("/settings/credits");
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: CreditsOnboardingPage,
});
