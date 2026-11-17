import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { defaultLocale } from "@/i18n/locales";
import type { PublicLocale } from "@/i18n/routing";
import { learnOutlineQuery } from "@/features/learn/learn.functions";
import { LearnHubPage, getLearnMetadata } from "@/features/learn/LearnHubPage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getLearnMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/learn/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		const locale = (params.locale || defaultLocale) as PublicLocale;
		await context.queryClient.ensureQueryData(learnOutlineQuery(locale));
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: LearnHubPage,
});
