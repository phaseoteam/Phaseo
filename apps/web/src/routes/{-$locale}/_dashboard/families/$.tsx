// Family ids can contain slashes (`/families/openai/gpt-5`), hence the splat.
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import FamilyPage, { familyIdFromSplat, getFamilyMetadata } from "@/features/families/familyId/FamilyPage";
import { familyQuery } from "@/features/families/page.queries";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getFamilyMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/families/$")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		if (!(await context.queryClient.ensureQueryData(familyQuery(familyIdFromSplat(params._splat))))) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: FamilyPage,
});
