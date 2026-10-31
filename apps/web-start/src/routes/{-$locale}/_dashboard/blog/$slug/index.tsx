// Next: src/app/[locale]/(dashboard)/blog/[slug]/page.tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { redirect } from "@/i18n/navigation";
import { defaultLocale } from "@/i18n/locales";
import { blogPostQuery } from "@/app/[locale]/(dashboard)/blog/[slug]/post.functions";
import { createServerFn } from "@tanstack/react-start";
import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { nextPageComponent } from "@/lib/start/nextPage";
import Page, * as mod from "@/app/[locale]/(dashboard)/blog/[slug]/page";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: MetadataInput) => input)
	.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/blog/$slug/")({
	loader: async ({ params, location, context }) => {
		const locale = params.locale ?? defaultLocale;
		const metadataPromise = routeMetadata({ data: { params, search: location.search as Record<string, unknown> } });
		metadataPromise.catch(() => undefined);
		// The post lookup decides the status (404 / redirect), so it blocks; metadata streams.
		const resolution = await context.queryClient.ensureQueryData(blogPostQuery(params.slug, locale));
		if (resolution.kind === "redirect-to-index") redirect({ href: "/blog", locale });
		if (resolution.kind === "not-found") throw notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: nextPageComponent(Page),
});
