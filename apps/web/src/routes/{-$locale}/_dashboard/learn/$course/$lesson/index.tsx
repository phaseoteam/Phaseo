import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { notFound } from "@/lib/navigation";
import { getLearnLesson } from "@/lib/content/learn";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { LearnLessonPage, getLearnLessonMetadata } from "@/features/learn/LearnLessonPage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(getLearnLessonMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/learn/$course/$lesson/")({
	loader: ({ params, location }) => {
		if (!getLearnLesson(params.course, params.lesson)) notFound();
		return metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) }));
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: LearnLessonPage,
});
