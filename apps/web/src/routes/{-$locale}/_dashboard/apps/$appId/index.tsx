import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import AppPage, { getAppMetadata } from "@/features/apps/appId/AppPage";
import { appDetailsQuery } from "@/features/apps/appId/page.queries";
import { getPublicAppPath, getPublicAppRouteSegment } from "@/lib/apps/publicAppPath";
import { permanentRedirect } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getAppMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/apps/$appId/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		const app = await context.queryClient.ensureQueryData(appDetailsQuery(params.appId));
		if (app) {
			// Old ids and title slugs redirect to the app's canonical path.
			const canonicalAppId = app.slug?.trim() || getPublicAppRouteSegment(app.title);
			if (canonicalAppId !== params.appId) permanentRedirect(getPublicAppPath(app.title, app.slug));
		}
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: AppPage,
});
