import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { OAuthConsentPage, getOAuthConsentMetadata } from "@/features/oauth/consent/OAuthConsentPage";
import { oauthConsentQuery, toConsentSearchParams } from "@/features/oauth/consent/page.functions";
import { redirect } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getOAuthConsentMetadata()));

export const Route = createFileRoute("/{-$locale}/_auth/oauth/consent/")({
	loader: async ({ location, context }) => {
		const metadataPromise = routeMetadata();
		metadataPromise.catch(() => undefined);
		// Signed-out visitors go to sign-in; already-approved requests go back to the client.
		const resolution = await context.queryClient.ensureQueryData(oauthConsentQuery(toConsentSearchParams(location.search as Record<string, unknown>)));
		if (resolution.kind === "sign-in" || resolution.kind === "redirect") redirect(resolution.to);
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: OAuthConsentPage,
});
