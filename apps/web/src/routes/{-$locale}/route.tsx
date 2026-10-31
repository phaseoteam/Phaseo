// Next: app/[locale] with localePrefix "as-needed". `/models` is the default
// locale (en-GB); `/fr-FR/models` is French. Unknown first segments fall
// through to the child routes, which 404 if nothing matches.
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { defaultLocale, isPublicLocale } from "@/i18n/locales";
import { buildLocalizedRootMetadata } from "@/lib/rootMetadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { createServerFn } from "@tanstack/react-start";
import { toSerializableMetadata } from "@/lib/start/nextPage";

const getRootMetadata = createServerFn({ method: "GET" })
	.validator((locale: string) => locale)
	.handler(async ({ data: locale }) => toSerializableMetadata(await buildLocalizedRootMetadata(isPublicLocale(locale) ? locale : defaultLocale)));

export const Route = createFileRoute("/{-$locale}")({
	beforeLoad: ({ params }) => {
		// An explicit default-locale prefix is canonicalised by the request
		// middleware; anything else that is not a public locale is not ours.
		if (params.locale !== undefined && !isPublicLocale(params.locale)) throw notFound();
	},
	loader: async ({ params }) => ({ metadata: await getRootMetadata({ data: params.locale ?? defaultLocale }) }),
	staleTime: Infinity,
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: Outlet,
});
