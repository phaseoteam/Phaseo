import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { ProfilePage, getProfileMetadata } from "@/features/profile/slug/ProfilePage";
import { publicProfileQuery } from "@/features/profile/slug/page.queries";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.handler(async () => toSerializableMetadata(await getProfileMetadata()));

export const Route = createFileRoute("/{-$locale}/profile/$slug/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata();
		metadataPromise.catch(() => undefined);
		const profile = await context.queryClient.ensureQueryData(publicProfileQuery(params.slug));
		if (!profile || !profile.publicProfileEnabled) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: ProfilePage,
});
