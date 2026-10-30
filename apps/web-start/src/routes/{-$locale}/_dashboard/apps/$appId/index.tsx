// Next: src/app/[locale]/(dashboard)/apps/[appId]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/apps/[appId]/page";
import { appDetailsQuery } from "@/app/[locale]/(dashboard)/apps/[appId]/page.queries";
import { getPublicAppPath, getPublicAppRouteSegment } from "@/lib/apps/publicAppPath";
import { permanentRedirect } from "next/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/apps/$appId/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown> } });
		metadataPromise.catch(() => undefined);
		const app = await context.queryClient.ensureQueryData(appDetailsQuery(params.appId));
		if (app) {
			const canonicalAppId = app.slug?.trim() || getPublicAppRouteSegment(app.title);
			if (canonicalAppId !== params.appId) permanentRedirect(getPublicAppPath(app.title, app.slug));
		}
		return { metadata: await metadataPromise };
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
