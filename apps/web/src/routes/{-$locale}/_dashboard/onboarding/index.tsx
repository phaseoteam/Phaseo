import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import OnboardingPage, { getOnboardingMetadata } from "@/features/onboarding/OnboardingPage";
import { onboardingPageQuery } from "@/features/onboarding/onboarding.functions";

const routeMetadata = createServerFn({ method: "GET" }).handler(async () => toSerializableMetadata(await getOnboardingMetadata()));

export const Route = createFileRoute("/{-$locale}/_dashboard/onboarding/")({
	// Provider-mode accounts and signed-out visitors are redirected before rendering.
	// The query throws those redirects; the page reads the cached data.
	beforeLoad: async ({ context }) => {
		await context.queryClient.ensureQueryData(onboardingPageQuery());
	},
	loader: () => metadataLoaderData(routeMetadata()),
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: OnboardingPage,
});
