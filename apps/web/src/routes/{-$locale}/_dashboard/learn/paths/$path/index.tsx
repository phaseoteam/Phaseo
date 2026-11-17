import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { defaultLocale } from "@/i18n/locales";
import type { PublicLocale } from "@/i18n/routing";
import { notFound } from "@/lib/navigation";
import { learnOutlineQuery } from "@/features/learn/learn.functions";
import { LearnPathPage, getLearnPathMetadata } from "@/features/learn/LearnPathPage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getLearnPathMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/learn/paths/$path/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		const locale = (params.locale || defaultLocale) as PublicLocale;
		const outline = await context.queryClient.ensureQueryData(learnOutlineQuery(locale));
		if (!outline.paths.some((path) => path.slug === params.path)) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: LearnPathPage,
});
