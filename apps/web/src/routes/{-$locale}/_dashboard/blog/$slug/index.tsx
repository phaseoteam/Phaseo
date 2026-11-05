import { createFileRoute, notFound } from "@tanstack/react-router";
import { redirect } from "@/i18n/navigation";
import { defaultLocale } from "@/i18n/locales";
import { blogPostQuery } from "@/features/blog/slug/post.functions";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { BlogPostPage, getBlogPostMetadata } from "@/features/blog/slug/BlogPostPage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getBlogPostMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/blog/$slug/")({
	loader: async ({ params, location, context }) => {
		const locale = params.locale ?? defaultLocale;
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		// The post lookup decides the status (404 / redirect), so it blocks; metadata streams.
		const resolution = await context.queryClient.ensureQueryData(blogPostQuery(params.slug, locale));
		if (resolution.kind === "redirect-to-index") redirect({ href: "/blog", locale });
		if (resolution.kind === "not-found") throw notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: BlogPostPage,
});
