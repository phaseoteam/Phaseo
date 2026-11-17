import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { routeMetadataInput, toSerializableMetadata, type RouteMetadataInput } from "@/lib/start/metadata";
import { metadataToHead } from "@/lib/start/metadataToHead";
import { notFound } from "@/lib/navigation";
import { getLearnCourse } from "@/lib/content/learn";
import { metadataLoaderData } from "@/lib/start/streamedMetadata";
import { LearnCoursePage, getLearnCourseMetadata } from "@/features/learn/LearnCoursePage";

const routeMetadata = createServerFn({ method: "GET" })
	.validator((input: RouteMetadataInput) => input)
	.handler(async ({ data }) => toSerializableMetadata(getLearnCourseMetadata(data)));

export const Route = createFileRoute("/{-$locale}/_dashboard/learn/$course/")({
	loader: ({ params, location }) => {
		if (!getLearnCourse(params.course)) notFound();
		return metadataLoaderData(routeMetadata({ data: routeMetadataInput(params, location.search) }));
	},
	head: ({ loaderData }) => metadataToHead(loaderData?.metadata),
	component: LearnCoursePage,
});
