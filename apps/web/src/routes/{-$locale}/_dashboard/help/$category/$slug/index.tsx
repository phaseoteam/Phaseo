import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { HelpArticlePage, getHelpArticleMetadata } from "@/features/help/category/slug/HelpArticlePage";
import { helpArticleQuery } from "@/features/help/page.functions";
import { defaultLocale } from "@/i18n/locales";
import type { PublicLocale } from "@/i18n/routing";
import { notFound } from "@/lib/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getHelpArticleMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/help/$category/$slug/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		const locale = (params.locale || defaultLocale) as PublicLocale;
		const { article, categoryData } = await context.queryClient.ensureQueryData(helpArticleQuery(locale, params.category, params.slug));
		if (!article || !categoryData) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: HelpArticlePage,
});
