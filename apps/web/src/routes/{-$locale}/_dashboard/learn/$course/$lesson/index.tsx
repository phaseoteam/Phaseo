import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { defaultLocale } from "@/i18n/locales";
import type { PublicLocale } from "@/i18n/routing";
import { notFound } from "@/lib/navigation";
import { learnLessonQuery, learnOutlineQuery } from "@/features/learn/learn.functions";
import { LearnLessonPage, getLearnLessonMetadata } from "@/features/learn/LearnLessonPage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(await getLearnLessonMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/learn/$course/$lesson/")({
	loader: async ({ params, location, context }) => {
		const metadataPromise = routeMetadata({ data: routeMetadataInput(params, location.search) });
		metadataPromise.catch(() => undefined);
		const locale = (params.locale || defaultLocale) as PublicLocale;
		const [, lesson] = await Promise.all([
			context.queryClient.ensureQueryData(learnOutlineQuery(locale)),
			context.queryClient.ensureQueryData(learnLessonQuery(locale, params.course, params.lesson)),
		]);
		if (!lesson) notFound();
		return metadataLoaderData(metadataPromise);
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: LearnLessonPage,
});
