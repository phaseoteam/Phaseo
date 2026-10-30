// Next: src/app/[locale]/(dashboard)/help/[category]/[slug]/page.tsx
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/help/[category]/[slug]/page";
import { helpArticleQuery } from "@/app/[locale]/(dashboard)/help/page.functions";
import { defaultLocale } from "@/i18n/locales";
import type { PublicLocale } from "@/i18n/routing";
import { notFound } from "next/navigation";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/help/$category/$slug/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown> } });
		metadataPromise.catch(() => undefined);
		const locale = (params.locale || defaultLocale) as PublicLocale;
		const { article, categoryData } = await context.queryClient.ensureQueryData(helpArticleQuery(locale, params.category, params.slug));
		if (!article || !categoryData) notFound();
		return { metadata: await metadataPromise };
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
